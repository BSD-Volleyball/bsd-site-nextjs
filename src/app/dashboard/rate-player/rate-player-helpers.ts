import { formatDisplayName } from "@/lib/utils"
import {
    LEGACY_COURT_BY_DIVISION,
    getSessionNumberFromTeam
} from "@/lib/courts"
import type { SeasonPhase } from "@/lib/season-phases"
import type { LookupType, PlayerRatingValues, RatePlayerEntry } from "./actions"

export function getDisplayName(player: RatePlayerEntry): string {
    return formatDisplayName(
        player.firstName,
        player.lastName,
        player.preferredName
    )
}

export function getOldIdLabel(player: RatePlayerEntry): string {
    if (player.oldId === null) {
        return "No old_id"
    }

    return `#${player.oldId}`
}

export function getGenderLabel(male: boolean | null): string {
    if (male === true) {
        return "Male"
    }

    if (male === false) {
        return "Non-Male"
    }

    return "—"
}

export function getEmptyRating(): PlayerRatingValues {
    return {
        overall: null,
        passing: null,
        setting: null,
        hitting: null,
        serving: null,
        blocking: null,
        sharedNotes: null,
        privateNotes: null
    }
}

export interface DefaultLookupContext {
    phase: SeasonPhase
    /** Tryout event dates (YYYY-MM-DD) in week order: [tryout 1, tryout 2, tryout 3]. */
    tryoutDates: string[]
    /** Today's date (YYYY-MM-DD) in the league's timezone. */
    today: string
    /** True once at least one draft pick exists for the season. */
    draftStarted: boolean
    /** Whether the "By Team" option is offered in the dropdown. */
    byTeamAvailable: boolean
}

/**
 * Picks the lookup type the Rate Player page should open on, following the
 * season timeline: Direct in the off-season and before tryouts, Tryout N
 * from that tryout's date until the next one, and By Team once drafting has
 * started. ISO date strings compare lexically, so no Date parsing is needed.
 */
export function resolveDefaultLookupType({
    phase,
    tryoutDates,
    today,
    draftStarted,
    byTeamAvailable
}: DefaultLookupContext): LookupType {
    if (phase === "off_season" || phase === "complete") {
        return "direct"
    }

    const teamsExist =
        draftStarted || phase === "regular_season" || phase === "playoffs"
    if (teamsExist && byTeamAvailable) {
        return "byTeam"
    }

    const tryoutLookups: LookupType[] = ["tryout1", "tryout2", "tryout3"]
    for (let i = Math.min(tryoutDates.length, 3) - 1; i >= 0; i--) {
        if (today >= tryoutDates[i]) {
            return tryoutLookups[i]
        }
    }

    return "direct"
}

export function sortPlayers(
    a: RatePlayerEntry,
    b: RatePlayerEntry,
    hasHistoryFn: (entry: RatePlayerEntry) => boolean
): number {
    // New players (no draft history) before returning players
    const aNew = hasHistoryFn(a) ? 1 : 0
    const bNew = hasHistoryFn(b) ? 1 : 0
    if (aNew !== bNew) return aNew - bNew
    // Male players before non-male
    const aMale = a.male === true ? 0 : 1
    const bMale = b.male === true ? 0 : 1
    if (aMale !== bMale) return aMale - bMale
    // Alphabetical by last name
    return a.lastName.localeCompare(b.lastName)
}

export interface TryoutTimeSlotDivision {
    divisionName: string
    courtNumber: number
    teams: { teamNumber: number; players: RatePlayerEntry[] }[]
}

export interface TryoutTimeSlotGroup {
    sessionNumber: 1 | 2 | 3
    timeLabel: string
    divisions: TryoutTimeSlotDivision[]
}

interface TryoutRosterRow {
    userId: string
    divisionName: string
    divisionLevel: number
    teamNumber: number
}

/**
 * Groups week 2/3 tryout roster rows by time slot: teams 1-2 play session 1,
 * 3-4 session 2, 5-6 session 3, with each division on its historical court
 * for the whole night. `sessionTimeLabels[n - 1]` labels session n (falling
 * back to "Session n" when the tryout event has no configured time slots).
 */
export function buildTryoutTimeSlotGroups(
    rosterRows: TryoutRosterRow[],
    playersById: Map<string, RatePlayerEntry>,
    lastDivisionByPlayerId: Map<string, string>,
    sessionTimeLabels: string[]
): TryoutTimeSlotGroup[] {
    const sessionMap = new Map<
        1 | 2 | 3,
        Map<string, { level: number; teams: Map<number, RatePlayerEntry[]> }>
    >()

    for (const row of rosterRows) {
        const player = playersById.get(row.userId)
        if (!player) continue

        const sessionNumber = getSessionNumberFromTeam(row.teamNumber)
        if (!sessionMap.has(sessionNumber)) {
            sessionMap.set(sessionNumber, new Map())
        }

        const divisionMap = sessionMap.get(sessionNumber)!
        if (!divisionMap.has(row.divisionName)) {
            divisionMap.set(row.divisionName, {
                level: row.divisionLevel,
                teams: new Map()
            })
        }

        const divEntry = divisionMap.get(row.divisionName)!
        if (!divEntry.teams.has(row.teamNumber)) {
            divEntry.teams.set(row.teamNumber, [])
        }
        divEntry.teams.get(row.teamNumber)!.push(player)
    }

    return [...sessionMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([sessionNumber, divisionMap]) => ({
            sessionNumber,
            timeLabel:
                sessionTimeLabels[sessionNumber - 1] ||
                `Session ${sessionNumber}`,
            divisions: [...divisionMap.entries()]
                .sort((a, b) => a[1].level - b[1].level)
                .map(([divisionName, { teams }]) => ({
                    divisionName,
                    courtNumber: LEGACY_COURT_BY_DIVISION[divisionName] ?? 0,
                    teams: [...teams.entries()]
                        .sort((a, b) => a[0] - b[0])
                        .map(([teamNumber, players]) => ({
                            teamNumber,
                            players: [...players].sort((a, b) =>
                                sortPlayers(a, b, (p) =>
                                    lastDivisionByPlayerId.has(p.id)
                                )
                            )
                        }))
                }))
        }))
}
