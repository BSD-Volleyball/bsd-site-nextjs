// Read model for the player-facing Pre-Season Week 2/3 pages: every
// division's tryout teams, plus the night's match schedule per division.
// Callers (the pages) are responsible for authorization.

import "server-only"

import { asc, eq } from "drizzle-orm"
import { db } from "@/database/db"
import { divisions, users } from "@/database/schema"
import { LEGACY_COURT_BY_DIVISION } from "@/lib/courts"
import { weekRosterTable } from "@/lib/preseason/roster-tables"
import { formatTryoutMatchLabel } from "@/lib/tryout-team-names"
import { formatDisplayName } from "@/lib/utils"

export interface DivisionWeekRosterRow {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    divisionId: number
    divisionName: string
    divisionLevel: number
    teamNumber: number
    isCaptain: boolean
}

export interface DivisionWeekPlayer {
    userId: string
    /** Display name with " (Capt)" appended for captains. */
    displayName: string
    /** On more than one team this week, so scheduled for two matches. */
    hasAsterisk: boolean
}

export interface DivisionWeekTeam {
    teamNumber: number
    players: DivisionWeekPlayer[]
}

export interface DivisionWeekGroup {
    divisionId: number
    divisionName: string
    divisionLevel: number
    teams: DivisionWeekTeam[]
}

export async function loadDivisionWeekRosters(
    seasonId: number,
    week: 2 | 3
): Promise<DivisionWeekGroup[]> {
    const table = weekRosterTable(week)
    const rows = await db
        .select({
            userId: table.user,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            divisionId: table.division,
            divisionName: divisions.name,
            divisionLevel: divisions.level,
            teamNumber: table.team_number,
            isCaptain: table.is_captain
        })
        .from(table)
        .innerJoin(users, eq(table.user, users.id))
        .innerJoin(divisions, eq(table.division, divisions.id))
        .where(eq(table.season, seasonId))
        .orderBy(
            asc(divisions.level),
            asc(table.team_number),
            asc(users.last_name),
            asc(users.first_name)
        )
    return groupDivisionWeekRosters(rows)
}

/**
 * Groups roster rows into divisions (by level) and teams (by number), each
 * team's players ordered by last name. A player on two teams is flagged
 * with an asterisk on both.
 */
export function groupDivisionWeekRosters(
    rows: DivisionWeekRosterRow[]
): DivisionWeekGroup[] {
    const assignmentCounts = new Map<string, number>()
    for (const row of rows) {
        assignmentCounts.set(
            row.userId,
            (assignmentCounts.get(row.userId) ?? 0) + 1
        )
    }

    const sorted = [...rows].sort(
        (a, b) =>
            a.divisionLevel - b.divisionLevel ||
            a.teamNumber - b.teamNumber ||
            a.lastName.localeCompare(b.lastName)
    )

    const groups = new Map<
        number,
        Omit<DivisionWeekGroup, "teams"> & {
            teams: Map<number, DivisionWeekPlayer[]>
        }
    >()
    for (const row of sorted) {
        let group = groups.get(row.divisionId)
        if (!group) {
            group = {
                divisionId: row.divisionId,
                divisionName: row.divisionName,
                divisionLevel: row.divisionLevel,
                teams: new Map()
            }
            groups.set(row.divisionId, group)
        }
        const players = group.teams.get(row.teamNumber) ?? []
        const baseName = formatDisplayName(
            row.firstName,
            row.lastName,
            row.preferredName
        )
        players.push({
            userId: row.userId,
            displayName: row.isCaptain ? `${baseName} (Capt)` : baseName,
            hasAsterisk: (assignmentCounts.get(row.userId) ?? 0) > 1
        })
        group.teams.set(row.teamNumber, players)
    }

    return [...groups.values()]
        .map((group) => ({
            ...group,
            teams: [...group.teams.entries()]
                .sort(([a], [b]) => a - b)
                .map(([teamNumber, players]) => ({ teamNumber, players }))
        }))
        .sort((a, b) => a.divisionLevel - b.divisionLevel)
}

export interface DivisionWeekMatch {
    time: string
    courtNumber: number
    matchLabel: string
}

const WEEK_MATCHUPS: Array<[number, number]> = [
    [1, 2],
    [3, 4],
    [5, 6]
]

/**
 * One match per tryout session: teams 1v2, 3v4, 5v6, on the division's
 * legacy court (or its position, for divisions without one).
 */
export function buildDivisionWeekSchedule(
    divisionName: string,
    maxTeamNumber: number,
    divisionIndex: number,
    sessionTimes: string[]
): DivisionWeekMatch[] {
    const courtNumber =
        LEGACY_COURT_BY_DIVISION[divisionName] ?? divisionIndex + 1
    return WEEK_MATCHUPS.filter(
        ([home, away]) => home <= maxTeamNumber && away <= maxTeamNumber
    ).map(([home, away], index) => ({
        time: sessionTimes[index] || "Time TBD",
        courtNumber,
        matchLabel: formatTryoutMatchLabel(divisionName, home, away)
    }))
}
