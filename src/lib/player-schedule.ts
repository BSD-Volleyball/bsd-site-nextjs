/**
 * player-schedule.ts — upcoming schedule for a single player in a season,
 * grouped into tryouts / games / reffing / volunteering.
 *
 * A label layer over getScheduleForUsers() (src/lib/schedule-items.ts),
 * which owns the business rules. Performs NO authorization checks: callers
 * must gate access before invoking. "Upcoming" is date-based (league-local
 * today or later), so today's entries stay visible even after their start
 * time has passed.
 *
 * Playoff play/work rows are NOT included here — they need the bracket
 * resolution in getPlayoffNextMatches(), which the getPlayerSchedule action
 * merges in on top of this base data. (Playoff sub pickups are kept, as
 * before.)
 */

import "server-only"

import { getLeagueDateString } from "@/lib/date-utils"
import type {
    PlayerScheduleData,
    PlayerScheduleEntry
} from "@/lib/player-schedule-types"
import {
    type MatchScheduleItem,
    type ScheduleItem,
    getScheduleForUsers
} from "@/lib/schedule-items"
import { formatEventTime, formatMatchTime } from "@/lib/season-utils"
import { formatDisplayName } from "@/lib/utils"

type SortableEntry = { entry: PlayerScheduleEntry; sortKey: string }

function finalize(items: SortableEntry[]): PlayerScheduleEntry[] {
    return items
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .map((i) => i.entry)
}

function sortKeyFor(date: string, rawTime: string | null): string {
    return `${date}T${rawTime ?? "99:99:99"}`
}

function opponentOf(item: MatchScheduleItem): string {
    return item.teamId === item.homeTeamId ? item.awayName : item.homeName
}

function gameEntry(item: MatchScheduleItem): SortableEntry {
    return {
        sortKey: sortKeyFor(item.date, item.startTime),
        entry: {
            date: item.date,
            timeLabel: item.startTime ? formatMatchTime(item.startTime) : null,
            court: item.court,
            label: `vs ${opponentOf(item)} (${item.divisionName}, Week ${item.week})`,
            sublabel: item.subbingFor
                ? `Subbing for ${formatDisplayName(
                      item.subbingFor.firstName,
                      item.subbingFor.lastName,
                      item.subbingFor.preferredName
                  )}`
                : null
        }
    }
}

/**
 * Upcoming (league-local today or later) schedule for a player in a season,
 * excluding playoff play/work rows (merged in by the calling action).
 */
export async function getPlayerScheduleForUser(
    userId: string,
    seasonId: number
): Promise<PlayerScheduleData> {
    const today = getLeagueDateString()
    const { items } = await getScheduleForUsers([userId], seasonId)
    const upcoming: ScheduleItem[] = items.filter((i) => i.date >= today)

    const tryouts: SortableEntry[] = []
    const games: SortableEntry[] = []
    const reffing: SortableEntry[] = []
    const volunteering: SortableEntry[] = []

    for (const item of upcoming) {
        switch (item.kind) {
            case "tryout":
                tryouts.push({
                    sortKey: sortKeyFor(item.date, item.startTime),
                    entry: {
                        date: item.date,
                        timeLabel: item.startTime
                            ? formatMatchTime(item.startTime)
                            : null,
                        court: item.court,
                        label: `Tryout ${item.tryoutNumber} — Session ${item.session}`,
                        sublabel: item.sublabel
                    }
                })
                break
            case "match":
                // Regular-season games plus one-off pickups; playoff play and
                // work rows come from getPlayoffNextMatches in the action.
                if (item.role !== "play") break
                if (item.playoff && !item.subbingFor) break
                games.push(gameEntry(item))
                break
            case "ref":
                reffing.push({
                    sortKey: sortKeyFor(item.date, item.startTime),
                    entry: {
                        date: item.date,
                        timeLabel: item.startTime
                            ? formatMatchTime(item.startTime)
                            : null,
                        court: item.court,
                        label: `Ref: ${item.homeName} vs ${item.awayName} (${item.divisionName})`,
                        sublabel: null
                    }
                })
                break
            case "volunteer":
                volunteering.push({
                    // Whole-night jobs span the evening, so they sort ahead
                    // of the per-session ones instead of taking sortKeyFor's
                    // unknown-time default, which sorts last.
                    sortKey: sortKeyFor(
                        item.date,
                        item.allNight ? "00:00:00" : item.startTime
                    ),
                    entry: {
                        date: item.date,
                        timeLabel:
                            item.allNight || !item.startTime
                                ? "All night"
                                : formatEventTime(item.startTime),
                        court: null,
                        label:
                            item.tryoutNumber > 0
                                ? `${item.jobName} — Tryout ${item.tryoutNumber}`
                                : item.jobName,
                        sublabel: null
                    }
                })
                break
        }
    }

    return {
        tryouts: finalize(tryouts),
        games: finalize(games),
        reffing: finalize(reffing),
        volunteering: finalize(volunteering)
    }
}
