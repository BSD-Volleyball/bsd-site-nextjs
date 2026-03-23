"use server"

import { db } from "@/database/db"
import {
    users,
    seasons,
    divisions,
    individual_divisions,
    teams,
    playerRatings,
    movingDay,
    draftHomework
} from "@/database/schema"
import { eq, and, notInArray, desc, count, inArray } from "drizzle-orm"
import { getIsCommissioner } from "@/app/dashboard/actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { getCommissionerDivisionScope } from "@/lib/rbac"

export interface CaptainStatus {
    captainId: string
    captainName: string
    isCoach: boolean
    ratePlayersComplete: boolean
    movingDayComplete: boolean
    draftHomeworkComplete: boolean
}

export interface DivisionStatus {
    divisionId: number
    divisionName: string
    divisionLevel: number
    isCoachesMode: boolean
    numTeams: number
    captains: CaptainStatus[]
}

export interface HomeworkStatusData {
    status: boolean
    message?: string
    seasonLabel: string
    seasonId: number
    divisions: DivisionStatus[]
    availableDivisions: { divisionId: number; divisionName: string }[]
    selectedDivisionId: number | null
    canSelectDivision: boolean
}

export interface RatedPlayer {
    playerId: string
    playerName: string
}

export interface RatePlayersDetailResult {
    status: boolean
    message?: string
    players: RatedPlayer[]
}

export interface MovingDayPlayer {
    playerId: string
    playerName: string
}

export interface MovingDayDetailResult {
    status: boolean
    message?: string
    forcedUp: MovingDayPlayer[]
    forcedDown: MovingDayPlayer[]
    recommendedUp: MovingDayPlayer[]
    recommendedDown: MovingDayPlayer[]
}

export async function getHomeworkStatusData(
    requestedDivisionId?: number
): Promise<HomeworkStatusData> {
    const hasAccess = await getIsCommissioner()

    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            seasonLabel: "",
            seasonId: 0,
            divisions: [],
            availableDivisions: [],
            selectedDivisionId: null,
            canSelectDivision: false
        }
    }

    try {
        // 1. Get current season
        const [currentSeason] = await db
            .select({
                id: seasons.id,
                year: seasons.year,
                season: seasons.season
            })
            .from(seasons)
            .where(notInArray(seasons.phase, ["off_season", "complete"]))
            .limit(1)

        let targetSeason = currentSeason
        if (!targetSeason) {
            const [mostRecent] = await db
                .select({
                    id: seasons.id,
                    year: seasons.year,
                    season: seasons.season
                })
                .from(seasons)
                .orderBy(desc(seasons.id))
                .limit(1)
            targetSeason = mostRecent
        }

        if (!targetSeason) {
            return {
                status: false,
                message: "No season found.",
                seasonLabel: "",
                seasonId: 0,
                divisions: [],
                availableDivisions: [],
                selectedDivisionId: null,
                canSelectDivision: false
            }
        }

        const seasonId = targetSeason.id
        const seasonLabel = `${targetSeason.season.charAt(0).toUpperCase() + targetSeason.season.slice(1)} ${targetSeason.year}`

        // 2. Auth + division access check
        const session = await auth.api.getSession({ headers: await headers() })
        if (!session?.user) {
            return {
                status: false,
                message: "Unauthorized",
                seasonLabel: "",
                seasonId: 0,
                divisions: [],
                availableDivisions: [],
                selectedDivisionId: null,
                canSelectDivision: false
            }
        }

        const divisionAccess = await getCommissionerDivisionScope(
            session.user.id,
            seasonId
        )
        if (divisionAccess.type === "denied") {
            return {
                status: false,
                message: "Unauthorized",
                seasonLabel: "",
                seasonId: 0,
                divisions: [],
                availableDivisions: [],
                selectedDivisionId: null,
                canSelectDivision: false
            }
        }

        const seasonDivisionRows = await db
            .select({
                divisionId: divisions.id,
                divisionName: divisions.name,
                divisionLevel: divisions.level
            })
            .from(individual_divisions)
            .innerJoin(
                divisions,
                eq(individual_divisions.division, divisions.id)
            )
            .where(eq(individual_divisions.season, seasonId))

        const availableDivisions = seasonDivisionRows
            .filter(
                (division) =>
                    divisionAccess.type === "league_wide" ||
                    divisionAccess.divisionIds.includes(division.divisionId)
            )
            .sort((a, b) => a.divisionLevel - b.divisionLevel)
            .map((division) => ({
                divisionId: division.divisionId,
                divisionName: division.divisionName
            }))

        const selectedDivisionId =
            availableDivisions.length === 0
                ? null
                : requestedDivisionId &&
                    availableDivisions.some(
                        (division) =>
                            division.divisionId === requestedDivisionId
                    )
                  ? requestedDivisionId
                  : availableDivisions[0].divisionId

        // 3. Run all data queries in parallel
        const [
            teamsData,
            ratingCounts,
            movingDayCounts,
            draftHomeworkCaptains
        ] = await Promise.all([
            // A. Teams + division info for the season
            db
                .select({
                    captainId: teams.captain,
                    divisionId: teams.division,
                    divisionName: divisions.name,
                    divisionLevel: divisions.level,
                    isCoachesMode: individual_divisions.coaches,
                    numTeams: individual_divisions.teams
                })
                .from(teams)
                .innerJoin(divisions, eq(teams.division, divisions.id))
                .innerJoin(
                    individual_divisions,
                    and(
                        eq(individual_divisions.division, divisions.id),
                        eq(individual_divisions.season, seasonId)
                    )
                )
                .where(
                    and(
                        eq(teams.season, seasonId),
                        selectedDivisionId !== null
                            ? eq(teams.division, selectedDivisionId)
                            : undefined
                    )
                ),

            // C. Rating counts per evaluator for the season
            db
                .select({
                    evaluator: playerRatings.evaluator,
                    cnt: count()
                })
                .from(playerRatings)
                .where(eq(playerRatings.season, seasonId))
                .groupBy(playerRatings.evaluator),

            // D. Forced moving-day submissions per submitter + direction
            db
                .select({
                    submittedBy: movingDay.submitted_by,
                    direction: movingDay.direction,
                    cnt: count()
                })
                .from(movingDay)
                .where(
                    and(
                        eq(movingDay.season, seasonId),
                        eq(movingDay.is_forced, true)
                    )
                )
                .groupBy(movingDay.submitted_by, movingDay.direction),

            // E. Distinct captains who have saved draft homework
            db
                .selectDistinct({ captain: draftHomework.captain })
                .from(draftHomework)
                .where(eq(draftHomework.season, seasonId))
        ])

        // 4. Fetch captain names
        const captainIds = [...new Set(teamsData.map((t) => t.captainId))]

        const captainUserMap = new Map<
            string,
            {
                firstName: string
                lastName: string
                preferredName: string | null
            }
        >()

        if (captainIds.length > 0) {
            const rows = await db
                .select({
                    id: users.id,
                    first_name: users.first_name,
                    last_name: users.last_name,
                    preffered_name: users.preffered_name
                })
                .from(users)
                .where(inArray(users.id, captainIds))

            for (const row of rows) {
                captainUserMap.set(row.id, {
                    firstName: row.first_name,
                    lastName: row.last_name,
                    preferredName: row.preffered_name
                })
            }
        }

        // 5. Build lookup maps
        const ratingCountMap = new Map<string, number>()
        for (const row of ratingCounts) {
            ratingCountMap.set(row.evaluator, row.cnt)
        }

        const movingDayMap = new Map<string, { up: number; down: number }>()
        for (const row of movingDayCounts) {
            const existing = movingDayMap.get(row.submittedBy) ?? {
                up: 0,
                down: 0
            }
            if (row.direction === "up") {
                existing.up = row.cnt
            } else {
                existing.down = row.cnt
            }
            movingDayMap.set(row.submittedBy, existing)
        }

        const draftHomeworkSet = new Set(
            draftHomeworkCaptains.map((r) => r.captain)
        )

        // 6. Determine division min/max levels (top/bottom division logic)
        const divisionLevels = [
            ...new Set(teamsData.map((t) => t.divisionLevel))
        ]
        const minLevel =
            divisionLevels.length > 0 ? Math.min(...divisionLevels) : null
        const maxLevel =
            divisionLevels.length > 0 ? Math.max(...divisionLevels) : null

        // 7. Group teams by division (deduplicates coaches who captain multiple teams)
        const divisionMap = new Map<
            number,
            {
                divisionId: number
                divisionName: string
                divisionLevel: number
                isCoachesMode: boolean
                numTeams: number
                captainIds: Set<string>
            }
        >()

        for (const row of teamsData) {
            const existing = divisionMap.get(row.divisionId)
            if (!existing) {
                divisionMap.set(row.divisionId, {
                    divisionId: row.divisionId,
                    divisionName: row.divisionName,
                    divisionLevel: row.divisionLevel,
                    isCoachesMode: row.isCoachesMode,
                    numTeams: row.numTeams,
                    captainIds: new Set([row.captainId])
                })
            } else {
                existing.captainIds.add(row.captainId)
            }
        }

        // 8. Build final result sorted by divisionLevel ascending
        const divisionStatuses: DivisionStatus[] = []

        for (const div of [...divisionMap.values()].sort(
            (a, b) => a.divisionLevel - b.divisionLevel
        )) {
            const isTopDivision = div.divisionLevel === minLevel
            const isBottomDivision = div.divisionLevel === maxLevel

            const captains: CaptainStatus[] = []

            for (const captainId of div.captainIds) {
                const userInfo = captainUserMap.get(captainId)
                const displayFirst =
                    userInfo?.preferredName || userInfo?.firstName || ""
                const captainName = userInfo
                    ? `${displayFirst} ${userInfo.lastName}`.trim()
                    : captainId

                // Rate players: > 5 ratings submitted
                const ratingCount = ratingCountMap.get(captainId) ?? 0
                const ratePlayersComplete = ratingCount > 5

                // Moving day completion rules
                const mdCounts = movingDayMap.get(captainId) ?? {
                    up: 0,
                    down: 0
                }
                let movingDayComplete: boolean
                if (div.isCoachesMode) {
                    // Coaches submit one forced-up per team in their division
                    movingDayComplete = mdCounts.up >= div.numTeams
                } else if (isTopDivision && !isBottomDivision) {
                    // Top division: only need forced-down picks
                    movingDayComplete = mdCounts.down >= 2
                } else if (isBottomDivision && !isTopDivision) {
                    // Bottom division: only need forced-up picks
                    movingDayComplete = mdCounts.up >= 2
                } else {
                    // Middle (or single) division: normally 2 up + 2 down = 4 forced
                    // picks, but teams with only 1 non-male player can only produce 3.
                    movingDayComplete =
                        (mdCounts.up >= 2 && mdCounts.down >= 2) ||
                        mdCounts.up + mdCounts.down >= 3
                }

                const draftHomeworkComplete = draftHomeworkSet.has(captainId)

                captains.push({
                    captainId,
                    captainName,
                    isCoach: div.isCoachesMode,
                    ratePlayersComplete,
                    movingDayComplete,
                    draftHomeworkComplete
                })
            }

            captains.sort((a, b) => a.captainName.localeCompare(b.captainName))

            divisionStatuses.push({
                divisionId: div.divisionId,
                divisionName: div.divisionName,
                divisionLevel: div.divisionLevel,
                isCoachesMode: div.isCoachesMode,
                numTeams: div.numTeams,
                captains
            })
        }

        return {
            status: true,
            seasonLabel,
            seasonId,
            divisions: divisionStatuses,
            availableDivisions,
            selectedDivisionId,
            canSelectDivision: availableDivisions.length > 1
        }
    } catch (error) {
        console.error("Error fetching homework status data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            seasonLabel: "",
            seasonId: 0,
            divisions: [],
            availableDivisions: [],
            selectedDivisionId: null,
            canSelectDivision: false
        }
    }
}

export async function getRatePlayersDetail(
    captainId: string,
    seasonId: number
): Promise<RatePlayersDetailResult> {
    const hasAccess = await getIsCommissioner()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized", players: [] }
    }

    try {
        const ratings = await db
            .select({ player: playerRatings.player })
            .from(playerRatings)
            .where(
                and(
                    eq(playerRatings.season, seasonId),
                    eq(playerRatings.evaluator, captainId)
                )
            )

        const playerIds = ratings.map((r) => r.player)
        if (playerIds.length === 0) {
            return { status: true, players: [] }
        }

        const playerUsers = await db
            .select({
                id: users.id,
                first_name: users.first_name,
                last_name: users.last_name,
                preffered_name: users.preffered_name
            })
            .from(users)
            .where(inArray(users.id, playerIds))

        const userMap = new Map(playerUsers.map((u) => [u.id, u]))

        const players = playerIds
            .map((id) => {
                const u = userMap.get(id)
                const displayFirst = u?.preffered_name || u?.first_name || ""
                return {
                    playerId: id,
                    playerName: u ? `${displayFirst} ${u.last_name}`.trim() : id
                }
            })
            .sort((a, b) => a.playerName.localeCompare(b.playerName))

        return { status: true, players }
    } catch (error) {
        console.error("Error fetching rate players detail:", error)
        return {
            status: false,
            message: "Something went wrong.",
            players: []
        }
    }
}

export async function getMovingDayDetail(
    captainId: string,
    seasonId: number
): Promise<MovingDayDetailResult> {
    const hasAccess = await getIsCommissioner()
    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            forcedUp: [],
            forcedDown: [],
            recommendedUp: [],
            recommendedDown: []
        }
    }

    try {
        const entries = await db
            .select({
                player: movingDay.player,
                direction: movingDay.direction,
                isForced: movingDay.is_forced
            })
            .from(movingDay)
            .where(
                and(
                    eq(movingDay.season, seasonId),
                    eq(movingDay.submitted_by, captainId)
                )
            )

        const playerIds = [...new Set(entries.map((e) => e.player))]
        if (playerIds.length === 0) {
            return {
                status: true,
                forcedUp: [],
                forcedDown: [],
                recommendedUp: [],
                recommendedDown: []
            }
        }

        const playerUsers = await db
            .select({
                id: users.id,
                first_name: users.first_name,
                last_name: users.last_name,
                preffered_name: users.preffered_name
            })
            .from(users)
            .where(inArray(users.id, playerIds))

        const userMap = new Map(playerUsers.map((u) => [u.id, u]))

        const getPlayerName = (id: string) => {
            const u = userMap.get(id)
            const displayFirst = u?.preffered_name || u?.first_name || ""
            return u ? `${displayFirst} ${u.last_name}`.trim() : id
        }

        const toPlayer = (e: { player: string }): MovingDayPlayer => ({
            playerId: e.player,
            playerName: getPlayerName(e.player)
        })

        const sortByName = (a: MovingDayPlayer, b: MovingDayPlayer) =>
            a.playerName.localeCompare(b.playerName)

        return {
            status: true,
            forcedUp: entries
                .filter((e) => e.isForced && e.direction === "up")
                .map(toPlayer)
                .sort(sortByName),
            forcedDown: entries
                .filter((e) => e.isForced && e.direction === "down")
                .map(toPlayer)
                .sort(sortByName),
            recommendedUp: entries
                .filter((e) => !e.isForced && e.direction === "up")
                .map(toPlayer)
                .sort(sortByName),
            recommendedDown: entries
                .filter((e) => !e.isForced && e.direction === "down")
                .map(toPlayer)
                .sort(sortByName)
        }
    } catch (error) {
        console.error("Error fetching moving day detail:", error)
        return {
            status: false,
            message: "Something went wrong.",
            forcedUp: [],
            forcedDown: [],
            recommendedUp: [],
            recommendedDown: []
        }
    }
}
