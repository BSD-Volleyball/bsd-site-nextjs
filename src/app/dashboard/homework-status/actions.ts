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
import { eq, and, notInArray, desc, count, inArray, or } from "drizzle-orm"
import { getIsCommissioner } from "@/app/dashboard/access-actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { getCommissionerDivisionScope } from "@/lib/rbac"
import {
    type ActionResult,
    fail,
    ok,
    requirePositiveInt,
    withAction
} from "@/lib/action-helpers"

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

export interface RatedPlayer {
    playerId: string
    playerName: string
}

export interface RatePlayersDetailData {
    players: RatedPlayer[]
}

export type RatePlayersDetailResult = ActionResult<RatePlayersDetailData>

export interface MovingDayPlayer {
    playerId: string
    playerName: string
}

export interface MovingDayDetailData {
    forcedUp: MovingDayPlayer[]
    forcedDown: MovingDayPlayer[]
    recommendedUp: MovingDayPlayer[]
    recommendedDown: MovingDayPlayer[]
}

export type MovingDayDetailResult = ActionResult<MovingDayDetailData>

export const getHomeworkStatusData = withAction(
    async (
        requestedDivisionId?: number
    ): Promise<ActionResult<HomeworkStatusData>> => {
        const hasAccess = await getIsCommissioner()

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

export const getRatePlayersDetail = withAction(
    async (
        captainId: string,
        seasonId: number
    ): Promise<ActionResult<RatePlayersDetailData>> => {
        const hasAccess = await getIsCommissioner()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        requirePositiveInt(seasonId, "season")

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
            return ok({ players: [] })
        }

        const playerUsers = await db
            .select({
                id: users.id,
                first_name: users.first_name,
                last_name: users.last_name,
                preferred_name: users.preferred_name
            })
            .from(users)
            .where(inArray(users.id, playerIds))

        const userMap = new Map(playerUsers.map((u) => [u.id, u]))

        const players = playerIds
            .map((id) => {
                const u = userMap.get(id)
                const displayFirst = u?.preferred_name || u?.first_name || ""
                return {
                    playerId: id,
                    playerName: u ? `${displayFirst} ${u.last_name}`.trim() : id
                }
            })
            .sort((a, b) => a.playerName.localeCompare(b.playerName))

        return ok({ players })
    }
)

export const getMovingDayDetail = withAction(
    async (
        captainId: string,
        seasonId: number
    ): Promise<ActionResult<MovingDayDetailData>> => {
        const hasAccess = await getIsCommissioner()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        requirePositiveInt(seasonId, "season")

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
            return ok({
                forcedUp: [],
                forcedDown: [],
                recommendedUp: [],
                recommendedDown: []
            })
        }

        const playerUsers = await db
            .select({
                id: users.id,
                first_name: users.first_name,
                last_name: users.last_name,
                preferred_name: users.preferred_name
            })
            .from(users)
            .where(inArray(users.id, playerIds))

        const userMap = new Map(playerUsers.map((u) => [u.id, u]))

        const getPlayerName = (id: string) => {
            const u = userMap.get(id)
            const displayFirst = u?.preferred_name || u?.first_name || ""
            return u ? `${displayFirst} ${u.last_name}`.trim() : id
        }

        const toPlayer = (e: { player: string }): MovingDayPlayer => ({
            playerId: e.player,
            playerName: getPlayerName(e.player)
        })

        const sortByName = (a: MovingDayPlayer, b: MovingDayPlayer) =>
            a.playerName.localeCompare(b.playerName)

        return ok({
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
        })
    }
)

// ─── Draft Homework Detail ────────────────────────────────────────────────────

const MALE_ROUND_MAP: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 6, 5: 7 }
const NON_MALE_ROUND_MAP: Record<number, number> = { 1: 3, 2: 5, 3: 8 }
const CONSIDERING_ROUND = 9

export interface DraftHomeworkDetailPlayer {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    oldId: number
    picture: string | null
}

export interface DraftHomeworkDetailRound {
    draftRound: number
    label: string
    isMale: boolean
    players: DraftHomeworkDetailPlayer[]
}

export interface DraftHomeworkDetailData {
    rounds: DraftHomeworkDetailRound[]
    consideringMalePlayers: DraftHomeworkDetailPlayer[]
    consideringNonMalePlayers: DraftHomeworkDetailPlayer[]
    numTeams: number
    captainName: string
    divisionName: string
}

export type DraftHomeworkDetailResult = ActionResult<DraftHomeworkDetailData>

export const getDraftHomeworkDetail = withAction(
    async (
        captainId: string,
        seasonId: number
    ): Promise<ActionResult<DraftHomeworkDetailData>> => {
        const hasAccess = await getIsCommissioner()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        requirePositiveInt(seasonId, "season")

        // 1. Look up captain's team to find divisionId
        const captainTeams = await db
            .select({
                divisionId: teams.division,
                captain: teams.captain,
                captain2: teams.captain2
            })
            .from(teams)
            .where(
                and(
                    eq(teams.season, seasonId),
                    or(
                        eq(teams.captain, captainId),
                        eq(teams.captain2, captainId)
                    )
                )
            )
            .limit(1)

        if (captainTeams.length === 0) {
            return fail("Captain not found in this season.")
        }

        const divisionId = captainTeams[0].divisionId

        // 2. Fetch division config (genderSplit, numTeams) and division name
        const [divConfig] = await db
            .select({
                genderSplit: individual_divisions.gender_split,
                numTeams: individual_divisions.teams,
                divisionName: divisions.name
            })
            .from(individual_divisions)
            .innerJoin(
                divisions,
                eq(individual_divisions.division, divisions.id)
            )
            .where(
                and(
                    eq(individual_divisions.season, seasonId),
                    eq(individual_divisions.division, divisionId)
                )
            )
            .limit(1)

        if (!divConfig) {
            return fail("Division configuration not found.")
        }

        // 3. Fetch captain user info
        const [captainUser] = await db
            .select({
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name
            })
            .from(users)
            .where(eq(users.id, captainId))
            .limit(1)

        const captainDisplayFirst =
            captainUser?.preferredName || captainUser?.firstName || ""
        const captainName = captainUser
            ? `${captainDisplayFirst} ${captainUser.lastName}`.trim()
            : captainId

        // 4. Fetch all homework rows for this captain+season
        const homeworkRows = await db
            .select({
                round: draftHomework.round,
                slot: draftHomework.slot,
                player: draftHomework.player,
                isMaleTab: draftHomework.is_male_tab
            })
            .from(draftHomework)
            .where(
                and(
                    eq(draftHomework.season, seasonId),
                    eq(draftHomework.captain, captainId)
                )
            )

        // 5. Fetch player user data
        const playerIds = [...new Set(homeworkRows.map((r) => r.player))]
        const playerUserMap = new Map<string, DraftHomeworkDetailPlayer>()

        if (playerIds.length > 0) {
            const playerUsers = await db
                .select({
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preferred_name,
                    oldId: users.old_id,
                    picture: users.picture
                })
                .from(users)
                .where(inArray(users.id, playerIds))

            for (const u of playerUsers) {
                playerUserMap.set(u.id, {
                    userId: u.id,
                    firstName: u.firstName,
                    lastName: u.lastName,
                    preferredName: u.preferredName,
                    oldId: u.oldId ?? 0,
                    picture: u.picture
                })
            }
        }

        // 6. Parse genderSplit to determine how many rounds of each type exist
        const splitParts = divConfig.genderSplit.split("-").map(Number)
        const maleRounds = splitParts[0] ?? 0
        const nonMaleRounds = splitParts[1] ?? 0

        // 7. Build interleaved rounds and considering buckets
        const roundMap = new Map<number, DraftHomeworkDetailRound>()

        for (let mHw = 1; mHw <= maleRounds; mHw++) {
            const draftRound = MALE_ROUND_MAP[mHw]
            if (draftRound === undefined) continue
            roundMap.set(draftRound, {
                draftRound,
                label: `Round ${draftRound} — Male (Pick ${mHw})`,
                isMale: true,
                players: []
            })
        }

        for (let fHw = 1; fHw <= nonMaleRounds; fHw++) {
            const draftRound = NON_MALE_ROUND_MAP[fHw]
            if (draftRound === undefined) continue
            roundMap.set(draftRound, {
                draftRound,
                label: `Round ${draftRound} — Non-Male (Pick ${fHw})`,
                isMale: false,
                players: []
            })
        }

        const consideringMalePlayers: DraftHomeworkDetailPlayer[] = []
        const consideringNonMalePlayers: DraftHomeworkDetailPlayer[] = []

        // Sort by slot so players appear in pick order within each round
        const sorted = [...homeworkRows].sort((a, b) => a.slot - b.slot)

        for (const row of sorted) {
            const player = playerUserMap.get(row.player)
            if (!player) continue

            if (row.round === CONSIDERING_ROUND) {
                if (row.isMaleTab) {
                    consideringMalePlayers.push(player)
                } else {
                    consideringNonMalePlayers.push(player)
                }
                continue
            }

            // Map homework round → draft round using the correct map
            const draftRound = row.isMaleTab
                ? MALE_ROUND_MAP[row.round]
                : NON_MALE_ROUND_MAP[row.round]

            if (draftRound === undefined) continue

            const roundEntry = roundMap.get(draftRound)
            if (roundEntry) {
                roundEntry.players.push(player)
            }
        }

        const rounds = [...roundMap.values()].sort(
            (a, b) => a.draftRound - b.draftRound
        )

        return ok({
            rounds,
            consideringMalePlayers,
            consideringNonMalePlayers,
            numTeams: divConfig.numTeams,
            captainName,
            divisionName: divConfig.divisionName
        })
    }
)
