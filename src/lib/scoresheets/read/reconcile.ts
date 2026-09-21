/**
 * reconcile.ts — turn evidence into a verdict, with honest confidence.
 *
 * Three independent things say how a game ended: the two handwritten scores,
 * the WIN tick, and the rules of volleyball. Reconciling them is what makes a
 * pre-filled form safe to offer, because a misread digit usually produces an
 * illegal score, or one that contradicts the tick, or both.
 *
 * Confidence here is the *margin* between the best legal reading and the next
 * best, not whatever the transcriber said about itself. A model that is
 * confidently wrong still loses to a reading the ticks and the rules agree on,
 * and a genuinely ambiguous box produces two close candidates and a low score,
 * which is exactly when a human should look.
 */

import type { CheckReading } from "./checkbox"
import { type GameConstraint, legalScorePairs } from "./rules"

export interface ScoreCandidate {
    value: number | null
    confidence: number
    /** Runners-up the transcriber also considered plausible. */
    alternatives?: { value: number; confidence: number }[]
    /**
     * How many digits were actually written, measured from the ink rather
     * than read. A transcriber that drops a tens digit turns 18 into 8: still
     * a legal score, still the same winner, so neither the rules nor the WIN
     * tick object. Only the ink in the tens box does.
     */
    digitsWritten?: 1 | 2 | null
}

export interface GameEvidence {
    constraint: GameConstraint
    /** Null when the reader found no ink in that pair of boxes. */
    home: ScoreCandidate | null
    away: ScoreCandidate | null
    homeWin: CheckReading
    awayWin: CheckReading
}

export type ReadLevel = "high" | "low" | "unreadable"

export interface GameVerdict {
    home: number | null
    away: number | null
    winner: "home" | "away" | null
    confidence: number
    level: ReadLevel
    /** Set when the evidence disagreed with itself, in words for an admin. */
    conflict: string | null
    /** True when the game was left blank, which is a normal answer. */
    blank: boolean
}

/** Above this a field may be pre-filled without drawing attention to it. */
const HIGH = 0.85
/** Below this the reading is not worth offering at all. */
const LOW = 0.4

/** How much a tick is worth against a digit, in log-odds. */
const TICK_WEIGHT = 1.6
/** Penalty for a value the transcriber never proposed. */
const UNSEEN = Math.log(0.002)
/** Penalty for expecting a number and finding no ink. */
const MISSING = Math.log(0.05)
/**
 * Penalty for a value with the wrong number of digits for the ink present.
 *
 * Heavier than `UNSEEN` on purpose. The digit count is measured off the page;
 * the transcriber's answer is a claim about it. When the two disagree the
 * measurement wins, and the usual outcome is that no supported reading
 * survives and the game is handed to a human — which is the right answer,
 * because something genuinely does not add up.
 */
const WRONG_DIGIT_COUNT = Math.log(1e-5)

function digitLogProb(candidate: ScoreCandidate | null, value: number): number {
    if (!candidate) return MISSING

    let score: number
    if (candidate.value === value) {
        score = Math.log(Math.max(1e-6, candidate.confidence))
    } else {
        const alt = candidate.alternatives?.find((a) => a.value === value)
        score = alt ? Math.log(Math.max(1e-6, alt.confidence)) : UNSEEN
    }

    // Two boxes were written in, so the score cannot be a single digit, and
    // vice versa. This is measured off the page rather than claimed by a
    // model, so it outranks the model's own confidence.
    if (
        candidate.digitsWritten !== undefined &&
        candidate.digitsWritten !== null
    ) {
        const digits = value >= 10 ? 2 : 1
        if (digits !== candidate.digitsWritten) score += WRONG_DIGIT_COUNT
    }
    return score
}

/** Did the transcriber actually propose this number for this side? */
function proposed(candidate: ScoreCandidate | null, value: number): boolean {
    if (!candidate) return false
    if (candidate.value === value) return true
    return candidate.alternatives?.some((a) => a.value === value) ?? false
}

function tickLogProb(evidence: GameEvidence, winner: "home" | "away"): number {
    const winning = winner === "home" ? evidence.homeWin : evidence.awayWin
    const losing = winner === "home" ? evidence.awayWin : evidence.homeWin

    let score = 0
    if (winning.state === "marked") score += TICK_WEIGHT
    if (winning.state === "unmarked") score -= TICK_WEIGHT * 0.5
    if (losing.state === "marked") score -= TICK_WEIGHT
    return score
}

function isBlank(evidence: GameEvidence): boolean {
    return (
        evidence.home === null &&
        evidence.away === null &&
        evidence.homeWin.state !== "marked" &&
        evidence.awayWin.state !== "marked"
    )
}

export function reconcileGame(evidence: GameEvidence): GameVerdict {
    // A game that was never played is a confident answer, not a failure.
    if (isBlank(evidence)) {
        return {
            home: null,
            away: null,
            winner: null,
            confidence: 1,
            level: "high",
            conflict: null,
            blank: true
        }
    }

    const scored = legalScorePairs(evidence.constraint).flatMap((pair) =>
        // Either side could be the one that won.
        (["home", "away"] as const).map((winner) => {
            const home = winner === "home" ? pair.winner : pair.loser
            const away = winner === "home" ? pair.loser : pair.winner
            return {
                home,
                away,
                winner,
                score:
                    digitLogProb(evidence.home, home) +
                    digitLogProb(evidence.away, away) +
                    tickLogProb(evidence, winner)
            }
        })
    )

    if (scored.length === 0) {
        return unreadable("No legal score fits this game.")
    }

    scored.sort((a, b) => b.score - a.score)
    const best = scored[0]
    const runnerUp = scored[1]

    // A margin alone is not enough. When nothing the transcriber proposed
    // appears in the winning pair, every legal reading scores the same and the
    // "best" one is an arbitrary pick dressed up as a decision. Ticks may
    // break a tie between plausible scores; they may not conjure a scoreline
    // out of digits nobody read.
    const support =
        (proposed(evidence.home, best.home) ? 1 : 0) +
        (proposed(evidence.away, best.away) ? 1 : 0)
    if (support === 0) {
        return unreadable(
            "No legal score matches what was written in the boxes."
        )
    }

    // Softmax margin between the top two: a decisive gap means one reading
    // explains the evidence far better than any other.
    const confidence = runnerUp
        ? 1 / (1 + Math.exp(-(best.score - runnerUp.score)))
        : 1

    const ticked =
        evidence.homeWin.state === "marked"
            ? "home"
            : evidence.awayWin.state === "marked"
              ? "away"
              : null

    let conflict: string | null = null
    if (ticked && ticked !== best.winner) {
        conflict = `The WIN tick says ${ticked} won, but the scores read ${best.home}-${best.away}.`
    }
    if (
        evidence.homeWin.state === "marked" &&
        evidence.awayWin.state === "marked"
    ) {
        conflict = "Both teams are ticked as winning this game."
    }

    const level: ReadLevel = conflict
        ? "low"
        : confidence >= HIGH
          ? "high"
          : confidence >= LOW
            ? "low"
            : "unreadable"

    return {
        home: level === "unreadable" ? null : best.home,
        away: level === "unreadable" ? null : best.away,
        winner: level === "unreadable" ? null : best.winner,
        confidence,
        level,
        conflict,
        blank: false
    }
}

function unreadable(reason: string): GameVerdict {
    return {
        home: null,
        away: null,
        winner: null,
        confidence: 0,
        level: "unreadable",
        conflict: reason,
        blank: false
    }
}

export interface MatchVerdict {
    games: GameVerdict[]
    /** Counted from the games, never read off the sheet. */
    homeGamesWon: number | null
    awayGamesWon: number | null
    winner: "home" | "away" | null
    problems: string[]
}

/**
 * A match's totals are derived, because the sheet has no box for them. That
 * also means they cannot be misread: if the games are right the totals are
 * right, and if a game is unreadable the totals honestly say so.
 */
export function reconcileMatch(games: GameVerdict[]): MatchVerdict {
    const problems: string[] = []
    for (const [i, game] of games.entries()) {
        if (game.conflict) problems.push(`Game ${i + 1}: ${game.conflict}`)
    }

    const played = games.filter((g) => !g.blank)
    const unreadableGames = played.filter((g) => g.level === "unreadable")
    if (unreadableGames.length > 0) {
        problems.push(
            `${unreadableGames.length} game(s) could not be read confidently.`
        )
        return {
            games,
            homeGamesWon: null,
            awayGamesWon: null,
            winner: null,
            problems
        }
    }

    const homeGamesWon = played.filter((g) => g.winner === "home").length
    const awayGamesWon = played.filter((g) => g.winner === "away").length

    if (played.length === 0) {
        return {
            games,
            homeGamesWon: null,
            awayGamesWon: null,
            winner: null,
            problems
        }
    }
    if (homeGamesWon === awayGamesWon) {
        problems.push(
            `The match is level at ${homeGamesWon}-${awayGamesWon} with no decider.`
        )
    }

    return {
        games,
        homeGamesWon,
        awayGamesWon,
        winner:
            homeGamesWon === awayGamesWon
                ? null
                : homeGamesWon > awayGamesWon
                  ? "home"
                  : "away",
        problems
    }
}
