/**
 * combine.ts — turn two independent readings of a sheet into one verdict.
 *
 * Two vision models from different providers read the same photo. Neither is
 * trusted alone: on the real photographs every model was occasionally
 * confidently wrong, and the same model could read one digit differently from
 * one run to the next. Where two different models give the *same* answer they
 * were never wrong (0 of ~280 agreed games, 2026-10-13), so agreement is what
 * earns `high`, not either model's opinion of itself.
 *
 * Everything else is offered to the admin with the reason attached: a
 * disagreement shows both readings, a single surviving reading is a guess,
 * and the rules of the game still veto an impossible score.
 */

import type { SheetEventType } from "../types"
import type { GameReading, PageReading } from "./page-reader"
import { gameConstraint, isLegalPair } from "./rules"

export type ReadLevel = "high" | "low" | "unreadable"

export interface GameVerdict {
    home: number | null
    away: number | null
    winner: "home" | "away" | null
    /** 1 when the readers agreed, lower the less settled the reading is. */
    confidence: number
    level: ReadLevel
    /** Why this needs a look, in words for an admin. */
    conflict: string | null
    /** True when the game was left blank, which is a normal answer. */
    blank: boolean
}

export interface MatchVerdict {
    games: GameVerdict[]
    /** Counted from the games, never read off the sheet. */
    homeGamesWon: number | null
    awayGamesWon: number | null
    winner: "home" | "away" | null
    problems: string[]
}

const LOW_CONFIDENCE = 0.6

function isBlank(reading: GameReading): boolean {
    return reading.home === null && reading.away === null
}

function describe(reading: GameReading): string {
    if (isBlank(reading)) return "not played"
    return `${reading.home ?? "?"}-${reading.away ?? "?"}`
}

/** A short model name for an admin: "gemini-4-argon", not the full slug. */
function shortName(model: string): string {
    return model.split("/").pop() ?? model
}

function notesOf(readings: readonly GameReading[]): string {
    const notes = readings.map((r) => r.note).filter(Boolean)
    return notes.length > 0 ? ` ${notes.join(" ")}` : ""
}

function unreadable(conflict: string, partial?: GameReading): GameVerdict {
    return {
        // A half-read game keeps the half that was read, so the admin only
        // has to type the other number.
        home: partial?.home ?? null,
        away: partial?.away ?? null,
        winner: null,
        confidence: 0,
        level: "unreadable",
        conflict,
        blank: false
    }
}

/**
 * One game, from however many readings arrived for it (normally two).
 * `models` names each reading, for saying who read what.
 */
export function combineGame(
    eventType: SheetEventType,
    game: 1 | 2 | 3,
    readings: readonly GameReading[],
    models: readonly string[]
): GameVerdict {
    if (readings.length === 0) {
        return unreadable(
            "This game could not be read. Type it in from the photo."
        )
    }

    const [first] = readings
    const agreed = readings.every(
        (r) => r.home === first.home && r.away === first.away
    )
    if (!agreed) {
        const said = readings
            .map((r, i) => `${shortName(models[i])} read ${describe(r)}`)
            .join(", ")
        return unreadable(`The two readers disagree: ${said}. Check the photo.`)
    }

    const single = readings.length === 1
    const unsure = readings.some((r) => r.confidence === "low")

    if (isBlank(first)) {
        // A confident "never played" is a real answer; an unsure one is not,
        // because a faint score read as nothing is exactly how a played game
        // disappears.
        if (single || unsure) {
            return unreadable(
                `This game looks unplayed, but the reading is not certain.${notesOf(readings)}`
            )
        }
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

    if (first.home === null || first.away === null) {
        return unreadable(
            `Only one team's score could be read (${describe(first)}).${notesOf(readings)}`,
            first
        )
    }

    const home = first.home
    const away = first.away
    const winner = home > away ? "home" : "away"

    if (!isLegalPair(gameConstraint(eventType, game), home, away)) {
        return {
            home,
            away,
            winner: home === away ? null : winner,
            confidence: LOW_CONFIDENCE,
            level: "low",
            conflict: `${home}-${away} is not a possible final score under the rules. Check the photo.${notesOf(readings)}`,
            blank: false
        }
    }

    if (single || unsure) {
        return {
            home,
            away,
            winner,
            confidence: LOW_CONFIDENCE,
            level: "low",
            conflict: single
                ? `Only one reader answered for this sheet, so this is unconfirmed.${notesOf(readings)}`
                : `A reader was unsure of this game.${notesOf(readings)}`,
            blank: false
        }
    }

    return {
        home,
        away,
        winner,
        confidence: 1,
        level: "high",
        conflict: null,
        blank: false
    }
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
    if (unreadableGames.length > 0 || played.some((g) => g.winner === null)) {
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

/**
 * Every match on a sheet, from the readings that came back. A reader that
 * failed outright is simply absent; the games then rest on the other alone
 * and are never better than `low`.
 */
export function combineReadings(
    eventType: SheetEventType,
    matchCount: number,
    readings: readonly PageReading[]
): MatchVerdict[] {
    const models = readings.map((r) => r.model)
    return Array.from({ length: matchCount }, (_, m) =>
        reconcileMatch(
            ([1, 2, 3] as const).map((game) =>
                combineGame(
                    eventType,
                    game,
                    readings.map((r) => r.matches[m][game - 1]),
                    models
                )
            )
        )
    )
}
