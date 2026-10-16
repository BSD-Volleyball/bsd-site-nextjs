/**
 * Turning a court's game scores into what the save action takes.
 *
 * On this page only the six game scores are typed (or read off the photo):
 * games won and the winner follow from them, which is exactly what the
 * validator would insist on anyway. The winner is a team id, and for a
 * playoff block printed as "Winner of M1" which team that is depends on the
 * winner of another match, so resolution runs to a fixed point the same way
 * Enter Scores does it live.
 */

import type { ScoreDraft } from "@/lib/scoresheets/read/draft"
import type {
    DivisionMatchGroup,
    MatchScoreData,
    MatchScoreInput
} from "../enter-scores/actions"
import {
    initFormState,
    isMatchEmpty,
    type MatchFormState,
    parseIntOrNull
} from "../enter-scores/match-form-state"
import {
    computeResolvedMatches,
    type ResolvedMatchInfo
} from "../enter-scores/match-resolution"
import { validateMatch } from "../enter-scores/match-validation"

export const GAME_FIELDS = [
    ["homeSet1Score", "awaySet1Score"],
    ["homeSet2Score", "awaySet2Score"],
    ["homeSet3Score", "awaySet3Score"]
] as const

export type GameField = (typeof GAME_FIELDS)[number][number]
export type GameScores = Record<GameField, string>

export const EMPTY_GAMES: GameScores = {
    homeSet1Score: "",
    awaySet1Score: "",
    homeSet2Score: "",
    awaySet2Score: "",
    homeSet3Score: "",
    awaySet3Score: ""
}

export function gamesOf(source: GameScores): GameScores {
    return {
        homeSet1Score: source.homeSet1Score,
        awaySet1Score: source.awaySet1Score,
        homeSet2Score: source.homeSet2Score,
        awaySet2Score: source.awaySet2Score,
        homeSet3Score: source.homeSet3Score,
        awaySet3Score: source.awaySet3Score
    }
}

export function draftGames(draft: ScoreDraft): GameScores {
    return gamesOf(draft.fields)
}

export function savedGames(match: MatchScoreData): GameScores {
    return gamesOf(initFormState(match))
}

/** Games each side won, counting only games with both scores in. */
export function gamesWon(games: GameScores): { home: number; away: number } {
    let home = 0
    let away = 0
    for (const [h, a] of GAME_FIELDS) {
        const homePts = parseIntOrNull(games[h])
        const awayPts = parseIntOrNull(games[a])
        if (homePts === null || awayPts === null) continue
        if (homePts > awayPts) home++
        else if (awayPts > homePts) away++
    }
    return { home, away }
}

function hasAnyGame(games: GameScores): boolean {
    return Object.values(games).some((v) => v.trim() !== "")
}

function completeForm(
    games: GameScores,
    resolved: ResolvedMatchInfo | undefined
): MatchFormState {
    if (!hasAnyGame(games)) {
        return { ...games, homeScore: "", awayScore: "", winner: null }
    }
    const won = gamesWon(games)
    const winner =
        won.home > won.away
            ? (resolved?.homeTeamId ?? null)
            : won.away > won.home
              ? (resolved?.awayTeamId ?? null)
              : null
    return {
        ...games,
        homeScore: String(won.home),
        awayScore: String(won.away),
        winner
    }
}

export interface CourtForms {
    forms: Record<number, MatchFormState>
    resolved: Map<number, ResolvedMatchInfo>
}

/**
 * The night's forms as saved, with this court's games replaced by `games`,
 * and every team slot resolved against the result.
 */
export function courtForms(
    divisions: readonly DivisionMatchGroup[],
    games: Record<number, GameScores>
): CourtForms {
    const forms: Record<number, MatchFormState> = {}
    for (const division of divisions) {
        for (const match of division.matches) {
            forms[match.matchId] = initFormState(match)
        }
    }

    const resolved = new Map<number, ResolvedMatchInfo>()
    for (let pass = 0; pass < 8; pass++) {
        for (const division of divisions) {
            for (const [id, info] of computeResolvedMatches(division, forms)) {
                resolved.set(id, info)
            }
        }
        let changed = false
        for (const [idText, matchGames] of Object.entries(games)) {
            const id = Number(idText)
            const next = completeForm(matchGames, resolved.get(id))
            const current = forms[id]
            if (
                !current ||
                current.winner !== next.winner ||
                current.homeScore !== next.homeScore ||
                current.awayScore !== next.awayScore ||
                GAME_FIELDS.flat().some((f) => current[f] !== next[f])
            ) {
                changed = true
            }
            forms[id] = next
        }
        if (!changed) break
    }
    return { forms, resolved }
}

/** Why a match on this court cannot be saved as it stands, in plain words. */
export function courtMatchProblems(
    form: MatchFormState,
    resolved: ResolvedMatchInfo | undefined,
    games: GameScores
): string[] {
    if (!resolved || isMatchEmpty(form)) return []
    if (resolved.isLocked) {
        const waitingOn = [resolved.homeLockLabel, resolved.awayLockLabel]
            .filter(Boolean)
            .join(" & ")
        return [
            `Waiting on ${waitingOn || "an earlier match"}. Save that court first.`
        ]
    }
    const won = gamesWon(games)
    if (form.winner === null && won.home === won.away) {
        return ["The games are tied. Enter the deciding game."]
    }
    return validateMatch(form, resolved)
}

export function toScoreInput(
    matchId: number,
    form: MatchFormState
): MatchScoreInput {
    return {
        matchId,
        homeScore: parseIntOrNull(form.homeScore),
        awayScore: parseIntOrNull(form.awayScore),
        homeSet1Score: parseIntOrNull(form.homeSet1Score),
        awaySet1Score: parseIntOrNull(form.awaySet1Score),
        homeSet2Score: parseIntOrNull(form.homeSet2Score),
        awaySet2Score: parseIntOrNull(form.awaySet2Score),
        homeSet3Score: parseIntOrNull(form.homeSet3Score),
        awaySet3Score: parseIntOrNull(form.awaySet3Score),
        winner: form.winner
    }
}

/** One save per division, since one court can host two (playoff week 2). */
export function scoreInputsByDivision(
    divisions: readonly DivisionMatchGroup[],
    matchIds: readonly number[],
    forms: Record<number, MatchFormState>
): { divisionId: number; inputs: MatchScoreInput[] }[] {
    const wanted = new Set(matchIds)
    const out: { divisionId: number; inputs: MatchScoreInput[] }[] = []
    for (const division of divisions) {
        const inputs = division.matches
            .filter((m) => wanted.has(m.matchId) && forms[m.matchId])
            .map((m) => toScoreInput(m.matchId, forms[m.matchId]))
        if (inputs.length > 0) {
            out.push({ divisionId: division.divisionId, inputs })
        }
    }
    return out
}
