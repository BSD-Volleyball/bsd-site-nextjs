/**
 * advancement.ts — catch a sheet whose scores send the wrong team forward.
 *
 * Two models agreeing on a score only means they agree on what the referee
 * wrote. On 2026-10-29 a referee wrote Gomez 26, Collazo 24 and ticked
 * Gomez's WIN box, then wrote "Team Collazo" into the next block's "Winner of
 * M6" slot, and Collazo played it. Both readers read 26-24 at high confidence;
 * the paper contradicted itself, and only a person noticed.
 *
 * The handwritten name in a slot is a witness the scores cannot see, so this
 * compares the two: when a slot is filled from a match on the same sheet, and
 * the name written there clearly names the team the scores did not send, the
 * source match needs a look. Pure: no database, no models.
 */

import type { BracketSource } from "../types"
import type { PageReading } from "./page-reader"

type Side = "home" | "away"

export interface BracketSide {
    /** Captains' display names; referees write these as often as team names. */
    captains: string[]
    /** Set when the row printed as "Winner of M6" rather than a team. */
    source: BracketSource | null
}

/** Playoff facts about one printed match block. */
export interface MatchBracket {
    /** Bracket numbers are per division, and one court can hold two. */
    division: string
    matchNum: number
    home: BracketSide
    away: BracketSide
}

export interface AdvancementMatch {
    home: string
    away: string
    bracket?: MatchBracket
}

export interface AdvancementProblem {
    /** Index of the match whose scores disagree with the slot, in print order. */
    matchIndex: number
    problem: string
}

const SIDES: readonly Side[] = ["home", "away"]

/** Words that say nothing about which team is meant. */
const FILLER = new Set(["team", "the", "and", "winner", "loser"])

function words(text: string): string[] {
    return text
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3 && !FILLER.has(w))
}

/**
 * Which side of a match a handwritten name refers to, by team or captain
 * name, or null when it names neither or both. Deliberately strict: a name
 * it cannot place raises nothing.
 */
export function namedSide(
    written: string,
    match: AdvancementMatch & { bracket: MatchBracket }
): Side | null {
    const said = new Set(words(written))
    const names = (side: Side) =>
        words([match[side], ...match.bracket[side].captains].join(" "))
    const home = names("home").some((w) => said.has(w))
    const away = names("away").some((w) => said.has(w))
    if (home === away) return null
    return home ? "home" : "away"
}

function opposite(side: Side): Side {
    return side === "home" ? "away" : "home"
}

export function advancementProblems(
    matches: readonly AdvancementMatch[],
    winners: readonly (Side | null)[],
    readings: readonly PageReading[]
): AdvancementProblem[] {
    const problems: AdvancementProblem[] = []
    for (const [index, match] of matches.entries()) {
        const bracket = match.bracket
        if (!bracket) continue
        for (const side of SIDES) {
            const source = bracket[side].source
            if (!source) continue

            const fromIndex = matches.findIndex(
                (m, i) =>
                    i !== index &&
                    m.bracket?.division === bracket.division &&
                    m.bracket.matchNum === source.matchNum
            )
            const from = matches[fromIndex]
            // Only a source on this sheet, between two known teams, with a
            // winner the scores settle, can be checked.
            if (
                !from?.bracket ||
                from.bracket.home.source ||
                from.bracket.away.source
            )
                continue
            const winner = winners[fromIndex]
            if (!winner) continue
            const sent = source.kind === "winner" ? winner : opposite(winner)

            for (const reading of readings) {
                const written = reading.writtenNames?.[index]?.[side]
                if (!written) continue
                const named = namedSide(written, {
                    ...from,
                    bracket: from.bracket
                })
                if (named === null || named === sent) continue
                problems.push({
                    matchIndex: fromIndex,
                    problem: `The referee wrote "${written.slice(0, 40)}" into match ${index + 1} as the ${source.kind} of M${source.matchNum}, but these scores make ${from[sent]} the ${source.kind}. Check this match's scores against the photo.`
                })
                break
            }
        }
    }
    return problems
}
