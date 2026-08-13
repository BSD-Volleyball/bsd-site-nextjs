/**
 * player-season-history.ts — draft history enriched with each season's record.
 *
 * Lives apart from roster.ts because player-elo-data.ts already imports that
 * module; composing here keeps the dependency one-directional.
 */

import "server-only"

import {
    getDraftHistoryForUser,
    type UserDraftHistoryEntry
} from "@/lib/roster"
import { getSeasonRecordsForUser } from "@/lib/player-elo-data"

export interface SeasonHistoryEntry extends UserDraftHistoryEntry {
    regularWins: number
    regularLosses: number
    playoffWins: number
    playoffLosses: number
    champion: boolean
}

/**
 * Every season the player was drafted into, with their match record for that
 * season. Seasons whose matches were never scored come back with zeroes,
 * which the chart tooltip renders as "no results recorded".
 */
export async function getSeasonHistoryForUser(
    userId: string
): Promise<SeasonHistoryEntry[]> {
    const [draftHistory, records] = await Promise.all([
        getDraftHistoryForUser(userId),
        getSeasonRecordsForUser(userId)
    ])

    const bySeason = new Map(records.map((r) => [r.seasonId, r]))
    return draftHistory.map((entry) => {
        const record = bySeason.get(entry.seasonId)
        return {
            ...entry,
            regularWins: record?.regularWins ?? 0,
            regularLosses: record?.regularLosses ?? 0,
            playoffWins: record?.playoffWins ?? 0,
            playoffLosses: record?.playoffLosses ?? 0,
            champion: record?.champion ?? false
        }
    })
}
