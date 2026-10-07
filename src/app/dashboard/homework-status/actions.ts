"use server"

import { db } from "@/database/db"
import {
    users,
    divisions,
    individual_divisions,
    teams,
    playerRatings,
    movingDay,
    draftHomework
} from "@/database/schema"
import { buildHomeworkRoundMaps } from "@/lib/draft-round-maps"
import { eq, and, inArray, or } from "drizzle-orm"
import {
    type ActionResult,
    fail,
    ok,
    requirePositiveInt,
    requireSession,
    withAction
} from "@/next/action-helpers"
import { commissionerCanWriteDivision } from "@/lib/rbac"

/**
 * The division a captain's team sits in for `seasonId`, or null when they
 * have no team that season. Captains hold a `teams` row (captain or
 * captain2) from the moment select-captains runs, so this resolves for
 * every phase the homework pages cover.
 */
async function resolveCaptainDivision(
    captainId: string,
    seasonId: number
): Promise<number | null> {
    const [team] = await db
        .select({ divisionId: teams.division })
        .from(teams)
        .where(
            and(
                eq(teams.season, seasonId),
                or(eq(teams.captain, captainId), eq(teams.captain2, captainId))
            )
        )
        .limit(1)
    return team?.divisionId ?? null
}

/**
 * Admins and league-wide commissioners may read any captain; a commissioner
 * scoped to one division only their own. The page's loader (data.ts) hides
 * other divisions, but these detail actions take the captain id from the
 * browser, so the same scope is enforced here, for the requested season.
 * Returns the captain's division id.
 */
async function requireCaptainInScope(
    userId: string,
    captainId: string,
    seasonId: number
): Promise<ActionResult<number>> {
    const divisionId = await resolveCaptainDivision(captainId, seasonId)
    if (divisionId === null) return fail("Captain not found in this season.")
    const allowed = await commissionerCanWriteDivision(
        userId,
        seasonId,
        divisionId
    )
    if (!allowed) return fail("Unauthorized")
    return ok(divisionId)
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

export const getRatePlayersDetail = withAction(
    async (
        captainId: string,
        seasonId: number
    ): Promise<ActionResult<RatePlayersDetailData>> => {
        const session = await requireSession()
        requirePositiveInt(seasonId, "season")
        const scope = await requireCaptainInScope(
            session.user.id,
            captainId,
            seasonId
        )
        if (!scope.status) return scope

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
        const session = await requireSession()
        requirePositiveInt(seasonId, "season")
        const scope = await requireCaptainInScope(
            session.user.id,
            captainId,
            seasonId
        )
        if (!scope.status) return scope

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
        const session = await requireSession()
        requirePositiveInt(seasonId, "season")
        const scope = await requireCaptainInScope(
            session.user.id,
            captainId,
            seasonId
        )
        if (!scope.status) return scope

        const divisionId = scope.data

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
        const roundMaps = buildHomeworkRoundMaps(divConfig.genderSplit)

        // 7. Build interleaved rounds and considering buckets
        const roundMap = new Map<number, DraftHomeworkDetailRound>()

        for (let mHw = 1; mHw <= maleRounds; mHw++) {
            const draftRound = roundMaps.male[mHw]
            if (draftRound === undefined) continue
            roundMap.set(draftRound, {
                draftRound,
                label: `Round ${draftRound} — Male (Pick ${mHw})`,
                isMale: true,
                players: []
            })
        }

        for (let fHw = 1; fHw <= nonMaleRounds; fHw++) {
            const draftRound = roundMaps.nonMale[fHw]
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
                ? roundMaps.male[row.round]
                : roundMaps.nonMale[row.round]

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
