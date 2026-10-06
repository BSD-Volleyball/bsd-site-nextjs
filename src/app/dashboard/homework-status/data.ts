import "server-only"

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

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { getCommissionerDivisionScope } from "@/lib/rbac"
import { type ActionResult, fail, ok, withAction } from "@/next/action-helpers"
import { isCommissionerBySession } from "@/next/session"

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
    seasonLabel: string
    seasonId: number
    divisions: DivisionStatus[]
    availableDivisions: { divisionId: number; divisionName: string }[]
    selectedDivisionId: number | null
    canSelectDivision: boolean
}

export const getHomeworkStatusData = withAction(
    async (
        requestedDivisionId?: number
    ): Promise<ActionResult<HomeworkStatusData>> => {
        const hasAccess = await isCommissionerBySession()

        if (!hasAccess) {
            return fail("Unauthorized")
        }

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
            return fail("No season found.")
        }

        const seasonId = targetSeason.id
        const seasonLabel = `${targetSeason.season.charAt(0).toUpperCase() + targetSeason.season.slice(1)} ${targetSeason.year}`

        // 2. Auth + division access check
        const session = await auth.api.getSession({ headers: await headers() })
        if (!session?.user) {
            return fail("Unauthorized")
        }

        const divisionAccess = await getCommissionerDivisionScope(
            session.user.id,
            seasonId
        )
        if (divisionAccess.type === "denied") {
            return fail("Unauthorized")
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
                    captain2Id: teams.captain2,
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

            // E. Draft homework row counts per captain per division
            db
                .select({
                    captain: draftHomework.captain,
                    division: draftHomework.division,
                    cnt: count()
                })
                .from(draftHomework)
                .where(
                    and(
                        eq(draftHomework.season, seasonId),
                        selectedDivisionId !== null
                            ? eq(draftHomework.division, selectedDivisionId)
                            : undefined
                    )
                )
                .groupBy(draftHomework.captain, draftHomework.division)
        ])

        // 4. Fetch captain names
        const captainIds = [
            ...new Set(
                teamsData.flatMap((t) =>
                    [t.captainId, t.captain2Id].filter(
                        (id): id is string => !!id
                    )
                )
            )
        ]

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
                    preferred_name: users.preferred_name
                })
                .from(users)
                .where(inArray(users.id, captainIds))

            for (const row of rows) {
                captainUserMap.set(row.id, {
                    firstName: row.first_name,
                    lastName: row.last_name,
                    preferredName: row.preferred_name
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

        // captainId → divisionId → row count
        const draftHomeworkCountMap = new Map<string, Map<number, number>>()
        for (const row of draftHomeworkCaptains) {
            if (!draftHomeworkCountMap.has(row.captain)) {
                draftHomeworkCountMap.set(row.captain, new Map())
            }
            draftHomeworkCountMap.get(row.captain)!.set(row.division, row.cnt)
        }

        // 6. Determine division min/max levels (top/bottom division logic).
        // Use the season's full division list, not teamsData: teamsData is
        // filtered to the selected division, which would make every division
        // look like both top and bottom.
        const divisionLevels = [
            ...new Set(seasonDivisionRows.map((d) => d.divisionLevel))
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
                const ids = new Set([row.captainId])
                if (row.captain2Id) ids.add(row.captain2Id)
                divisionMap.set(row.divisionId, {
                    divisionId: row.divisionId,
                    divisionName: row.divisionName,
                    divisionLevel: row.divisionLevel,
                    isCoachesMode: row.isCoachesMode,
                    numTeams: row.numTeams,
                    captainIds: ids
                })
            } else {
                existing.captainIds.add(row.captainId)
                if (row.captain2Id) existing.captainIds.add(row.captain2Id)
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

                const homeworkRowCount =
                    draftHomeworkCountMap.get(captainId)?.get(div.divisionId) ??
                    0
                const completionThreshold = div.numTeams * 8
                const draftHomeworkComplete =
                    completionThreshold > 0 &&
                    homeworkRowCount >= completionThreshold

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

        return ok({
            seasonLabel,
            seasonId,
            divisions: divisionStatuses,
            availableDivisions,
            selectedDivisionId,
            canSelectDivision: availableDivisions.length > 1
        })
    }
)
