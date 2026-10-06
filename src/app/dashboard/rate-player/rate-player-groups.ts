import { formatSeasonLabel } from "@/lib/season-utils"
import type {
    CaptainTeamRef,
    RatePlayerEntry,
    RatedPlayerEntry,
    RatedSeasonOption,
    SeasonTeamDivisionGroup,
    SeasonTeamGroup,
    TryoutDivisionGroup,
    TryoutSessionGroup
} from "./data"
import { sortPlayers, sortRatedPlayers } from "./rate-player-helpers"

// Pure builders behind getRatePlayerData: they turn the rows the loader
// fetches into the page's lookup groups. Every player list is ordered by
// sortPlayers, where "has history" means the player appears in
// lastDivisionByPlayerId.

/** A user joined from `users`, before their last division is attached. */
export type RatePlayerUserRow = Omit<RatePlayerEntry, "lastDivisionName">

function byPlayerOrder(lastDivisionByPlayerId: Map<string, string>) {
    return (a: RatePlayerEntry, b: RatePlayerEntry) =>
        sortPlayers(a, b, (p) => lastDivisionByPlayerId.has(p.id))
}

function toPlayerEntry(
    row: RatePlayerUserRow,
    lastDivisionByPlayerId: Map<string, string>
): RatePlayerEntry {
    return {
        id: row.id,
        oldId: row.oldId,
        firstName: row.firstName,
        lastName: row.lastName,
        preferredName: row.preferredName,
        male: row.male,
        height: row.height,
        picture: row.picture,
        lastDivisionName: lastDivisionByPlayerId.get(row.id) || null
    }
}

/**
 * Each player's most recent division, from draft rows ordered newest first
 * (season desc, draft id desc): the first row per player wins.
 */
export function latestDivisionByPlayer(
    draftRows: { userId: string; divisionName: string }[]
): Map<string, string> {
    const lastDivisionByPlayerId = new Map<string, string>()
    for (const row of draftRows) {
        if (!lastDivisionByPlayerId.has(row.userId)) {
            lastDivisionByPlayerId.set(row.userId, row.divisionName)
        }
    }
    return lastDivisionByPlayerId
}

/**
 * The "Players I've Rated" rows, sorted by sortRatedPlayers. A row can be
 * rated (canRate) only for current-season signups other than the viewer.
 */
export function buildRatedPlayers(
    ratedRows: (RatePlayerUserRow & {
        seasonId: number
        seasonName: string
        seasonYear: number
        overall: number | null
        ratedAt: Date | null
    })[],
    lastDivisionByPlayerId: Map<string, string>,
    signupIdSet: Set<string>,
    evaluatorId: string
): RatedPlayerEntry[] {
    return ratedRows
        .map(
            (row): RatedPlayerEntry => ({
                player: toPlayerEntry(row, lastDivisionByPlayerId),
                seasonId: row.seasonId,
                seasonLabel: formatSeasonLabel(row),
                overall: row.overall,
                ratedAt: row.ratedAt ? row.ratedAt.toISOString() : null,
                canRate: signupIdSet.has(row.id) && row.id !== evaluatorId
            })
        )
        .sort(sortRatedPlayers)
}

/** The distinct seasons among the rated rows, newest first. */
export function buildRatedSeasons(
    ratedPlayers: RatedPlayerEntry[]
): RatedSeasonOption[] {
    const ratedSeasonsById = new Map<number, RatedSeasonOption>()
    for (const entry of ratedPlayers) {
        if (!ratedSeasonsById.has(entry.seasonId)) {
            ratedSeasonsById.set(entry.seasonId, {
                seasonId: entry.seasonId,
                label: entry.seasonLabel
            })
        }
    }
    return [...ratedSeasonsById.values()].sort(
        (a, b) => b.seasonId - a.seasonId
    )
}

/** The current-season signups the viewer may rate (everyone but themselves). */
export function buildPlayerEntries(
    signupRows: RatePlayerUserRow[],
    evaluatorId: string,
    lastDivisionByPlayerId: Map<string, string>
): RatePlayerEntry[] {
    return signupRows
        .filter((row) => row.id !== evaluatorId)
        .map((row) => toPlayerEntry(row, lastDivisionByPlayerId))
        .sort(byPlayerOrder(lastDivisionByPlayerId))
}

/**
 * Week 1 tryout rosters by session, each with courts 1-4. Rows on another
 * court, in a non-positive session, or for a player not in playersById are
 * dropped.
 */
export function buildTryout1Sessions(
    rosterRows: {
        userId: string
        sessionNumber: number
        courtNumber: number
    }[],
    playersById: Map<string, RatePlayerEntry>,
    lastDivisionByPlayerId: Map<string, string>
): TryoutSessionGroup[] {
    const sessionMap = new Map<number, Map<1 | 2 | 3 | 4, RatePlayerEntry[]>>()

    for (const row of rosterRows) {
        if (
            row.courtNumber < 1 ||
            row.courtNumber > 4 ||
            row.sessionNumber <= 0
        ) {
            continue
        }

        const player = playersById.get(row.userId)
        if (!player) {
            continue
        }

        const courtNumber = row.courtNumber as 1 | 2 | 3 | 4

        if (!sessionMap.has(row.sessionNumber)) {
            sessionMap.set(
                row.sessionNumber,
                new Map([
                    [1, []],
                    [2, []],
                    [3, []],
                    [4, []]
                ])
            )
        }

        sessionMap.get(row.sessionNumber)!.get(courtNumber)!.push(player)
    }

    return [...sessionMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([sessionNumber, courtMap]) => ({
            sessionNumber,
            courts: ([1, 2, 3, 4] as const).map((courtNumber) => ({
                courtNumber,
                players: [...(courtMap.get(courtNumber) || [])].sort(
                    byPlayerOrder(lastDivisionByPlayerId)
                )
            }))
        }))
}

/**
 * Week 2/3 tryout rosters grouped by division (by level) then team number.
 * Players not in playersById are dropped.
 */
export function buildDivisionGroups(
    rosterRows: Array<{
        userId: string
        divisionName: string
        divisionLevel: number
        teamNumber: number
    }>,
    playersById: Map<string, RatePlayerEntry>,
    lastDivisionByPlayerId: Map<string, string>
): TryoutDivisionGroup[] {
    const divisionMap = new Map<
        string,
        { level: number; teams: Map<number, RatePlayerEntry[]> }
    >()

    for (const row of rosterRows) {
        const player = playersById.get(row.userId)
        if (!player) continue

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

    return [...divisionMap.entries()]
        .sort((a, b) => a[1].level - b[1].level)
        .map(([divisionName, { teams }]) => ({
            divisionName,
            teams: [...teams.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([teamNumber, players]) => ({
                    teamNumber,
                    players: [...players].sort(
                        byPlayerOrder(lastDivisionByPlayerId)
                    )
                }))
        }))
}

export interface SeasonTeamRow {
    teamId: number
    teamName: string
    teamNumber: number | null
    captain: string
    captain2: string | null
    divisionName: string
}

/**
 * "By Team": the season's teams grouped under their division in row order.
 * Each roster is the captain(s) plus the active player of every draft slot
 * (permanent subs resolved), filtered through playersById, which drops
 * non-signups and the viewer. captainTeam is the last team the viewer
 * captains or co-captains.
 */
export function buildByTeamDivisions(
    teamRows: SeasonTeamRow[],
    rosterEntries: { teamId: number; activeUser: { id: string } }[],
    evaluatorId: string,
    playersById: Map<string, RatePlayerEntry>,
    lastDivisionByPlayerId: Map<string, string>
): {
    byTeamDivisions: SeasonTeamDivisionGroup[]
    captainTeam: CaptainTeamRef | null
} {
    let captainTeam: CaptainTeamRef | null = null

    const activeUserIdsByTeam = new Map<number, Set<string>>()
    for (const entry of rosterEntries) {
        const ids = activeUserIdsByTeam.get(entry.teamId) ?? new Set<string>()
        ids.add(entry.activeUser.id)
        activeUserIdsByTeam.set(entry.teamId, ids)
    }

    const divisionOrder: string[] = []
    const teamsByDivision = new Map<string, SeasonTeamGroup[]>()

    for (const team of teamRows) {
        if (team.captain === evaluatorId || team.captain2 === evaluatorId) {
            captainTeam = {
                divisionName: team.divisionName,
                teamId: team.teamId
            }
        }

        const memberIds = new Set<string>([team.captain])
        if (team.captain2) {
            memberIds.add(team.captain2)
        }
        for (const id of activeUserIdsByTeam.get(team.teamId) ?? []) {
            memberIds.add(id)
        }

        const teamPlayers: RatePlayerEntry[] = []
        for (const id of memberIds) {
            const player = playersById.get(id)
            if (player) {
                teamPlayers.push(player)
            }
        }
        teamPlayers.sort(byPlayerOrder(lastDivisionByPlayerId))

        if (!teamsByDivision.has(team.divisionName)) {
            teamsByDivision.set(team.divisionName, [])
            divisionOrder.push(team.divisionName)
        }
        teamsByDivision.get(team.divisionName)!.push({
            teamId: team.teamId,
            teamName: team.teamName,
            teamNumber: team.teamNumber,
            players: teamPlayers
        })
    }

    return {
        byTeamDivisions: divisionOrder.map((divisionName) => ({
            divisionName,
            teams: teamsByDivision.get(divisionName)!
        })),
        captainTeam
    }
}
