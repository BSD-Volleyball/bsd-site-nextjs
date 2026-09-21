/**
 * draft.ts — turn a read into something the score-entry form can hold.
 *
 * The shape here mirrors the form's own state rather than the reader's: scores
 * as strings because that is what an input holds, and the winner as a side
 * rather than a team id because the page already resolves playoff placeholders
 * live and lib has no business guessing which team "Winner of M1" turned out
 * to be.
 *
 * Nothing here decides anything. Every value came from reconciliation, which
 * has already weighed the digits against the ticks and the rules; this only
 * lays them out and says which ones a human should look at.
 */

import type { ReadLevel } from "./reconcile"
import type { MatchRead, SheetRead } from "./read"

export interface ScoreDraftFields {
    homeScore: string
    awayScore: string
    homeSet1Score: string
    awaySet1Score: string
    homeSet2Score: string
    awaySet2Score: string
    homeSet3Score: string
    awaySet3Score: string
    /** The side that won; the page maps it to a team id. */
    winnerSide: "home" | "away" | null
}

export interface DraftFlag {
    field: keyof ScoreDraftFields
    level: Exclude<ReadLevel, "high"> | "conflict"
    /** Plain language, for showing beside the input. */
    note: string
}

export interface ScoreDraft {
    matchId: number
    fields: ScoreDraftFields
    flags: DraftFlag[]
    /** Lowest confidence of any field offered, so a card can rank itself. */
    confidence: number
    /** True when the sheet says this match was not played. */
    empty: boolean
}

const EMPTY_FIELDS: ScoreDraftFields = {
    homeScore: "",
    awayScore: "",
    homeSet1Score: "",
    awaySet1Score: "",
    homeSet2Score: "",
    awaySet2Score: "",
    homeSet3Score: "",
    awaySet3Score: "",
    winnerSide: null
}

const SET_FIELDS = [
    ["homeSet1Score", "awaySet1Score"],
    ["homeSet2Score", "awaySet2Score"],
    ["homeSet3Score", "awaySet3Score"]
] as const

function asText(value: number | null): string {
    return value === null ? "" : String(value)
}

export function toScoreDraft(match: MatchRead): ScoreDraft {
    const fields: ScoreDraftFields = { ...EMPTY_FIELDS }
    const flags: DraftFlag[] = []
    let confidence = 1

    match.games.forEach((game, index) => {
        const [homeField, awayField] = SET_FIELDS[index]
        if (game.blank) return

        fields[homeField] = asText(game.home)
        fields[awayField] = asText(game.away)
        confidence = Math.min(confidence, game.confidence)

        if (game.conflict) {
            for (const field of [homeField, awayField]) {
                flags.push({
                    field,
                    level: "conflict",
                    note: game.conflict
                })
            }
            return
        }
        if (game.level === "unreadable") {
            for (const field of [homeField, awayField]) {
                flags.push({
                    field,
                    level: "unreadable",
                    note: `Game ${index + 1} could not be read. Type it in from the photo.`
                })
            }
            return
        }
        if (game.level === "low") {
            for (const field of [homeField, awayField]) {
                flags.push({
                    field,
                    level: "low",
                    note: `Game ${index + 1} is a guess. Check it against the photo.`
                })
            }
        }
    })

    const played = match.games.filter((g) => !g.blank)
    if (played.length === 0) {
        return {
            matchId: match.matchId,
            fields: { ...EMPTY_FIELDS },
            flags: [],
            confidence: 1,
            empty: true
        }
    }

    // Totals are counted from the games, never read, so they are only offered
    // when every game that was played could be read.
    fields.homeScore = asText(match.homeGamesWon)
    fields.awayScore = asText(match.awayGamesWon)
    fields.winnerSide = match.winner

    if (match.homeGamesWon === null) {
        for (const field of ["homeScore", "awayScore"] as const) {
            flags.push({
                field,
                level: "unreadable",
                note: "Games won could not be counted because a game is unclear."
            })
        }
        confidence = 0
    }

    return {
        matchId: match.matchId,
        fields,
        flags,
        confidence,
        empty: false
    }
}

export function toScoreDrafts(read: SheetRead): ScoreDraft[] {
    return read.matches.map(toScoreDraft)
}

/** Fields worth drawing attention to, for a quick count in the UI. */
export function flaggedFieldCount(drafts: readonly ScoreDraft[]): number {
    return drafts.reduce(
        (total, draft) => total + new Set(draft.flags.map((f) => f.field)).size,
        0
    )
}
