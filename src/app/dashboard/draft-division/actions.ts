"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    users,
    divisions,
    individual_divisions,
    teams,
    drafts,
    draftCaptRounds,
    draftPairDiffs,
    draftHomework,
    signups,
    seasons
} from "@/database/schema"
import { eq, and, inArray, desc, lt, or } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import { getSeasonConfig } from "@/lib/site-config"
import {
    isAdminOrDirector,
    isCommissionerBySession,
    isCommissionerForCurrentSeason,
    isCaptainForSeason,
    getCommissionerDivisionScope
} from "@/lib/rbac"

export interface DivisionSplitConfig {
    divisionId: number
    genderSplit: string
}

export interface DivisionOption {
    id: number
    name: string
    level: number
}

export interface TeamOption {
    id: number
    name: string
    number: number | null
}

export interface PairEntry {
    playerId: string
    pairId: string
    pinnedRound: number
    playerIsPinned: boolean
}

export interface UserOption {
    id: string
    old_id: number | null
    first_name: string
    last_name: string
    preffered_name: string | null
    male: boolean | null
    picture: string | null
}

async function checkCommissionersAccess(): Promise<boolean> {
    return isCommissionerBySession()
}

async function checkDraftReadAccess(): Promise<boolean> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return false

    const userId = session.user.id
    const isAdmin = await isAdminOrDirector(userId)
    if (isAdmin) return true

    const config = await getSeasonConfig()
    if (!config.seasonId) return false

    const [isCommissioner, isCaptain] = await Promise.all([
        isCommissionerForCurrentSeason(userId),
        isCaptainForSeason(userId, config.seasonId)
    ])

    return isCommissioner || isCaptain
}

export async function hasDraftPageAccess(): Promise<{
    hasAccess: boolean
    isLeagueWideCommissioner: boolean
    accessibleDivisionIds: number[]
    divisionRoleById: Record<number, "commissioner" | "captain">
    captainTeamIdsByDivision: Record<number, number[]>
    defaultDivisionId: number | null
}> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return {
            hasAccess: false,
            isLeagueWideCommissioner: false,
            accessibleDivisionIds: [],
            divisionRoleById: {},
            captainTeamIdsByDivision: {},
            defaultDivisionId: null
        }
    }

    const userId = session.user.id
    const config = await getSeasonConfig()
    if (!config.seasonId) {
        return {
            hasAccess: false,
            isLeagueWideCommissioner: false,
            accessibleDivisionIds: [],
            divisionRoleById: {},
            captainTeamIdsByDivision: {},
            defaultDivisionId: null
        }
    }

    const seasonId = config.seasonId

    const isAdmin = await isAdminOrDirector(userId)
    if (isAdmin) {
        return {
            hasAccess: true,
            isLeagueWideCommissioner: true,
            accessibleDivisionIds: [],
            divisionRoleById: {},
            captainTeamIdsByDivision: {},
            defaultDivisionId: null
        }
    }

    const [isCommissioner, captainTeams] = await Promise.all([
        isCommissionerForCurrentSeason(userId),
        db
            .select({ id: teams.id, division: teams.division })
            .from(teams)
            .where(
                and(
                    eq(teams.season, seasonId),
                    or(eq(teams.captain, userId), eq(teams.captain2, userId))
                )
            )
    ])

    const captainTeamIdsByDivision: Record<number, number[]> = {}
    for (const team of captainTeams) {
        captainTeamIdsByDivision[team.division] = [
            ...(captainTeamIdsByDivision[team.division] ?? []),
            team.id
        ]
    }

    const captainDivisionIds = Object.keys(captainTeamIdsByDivision)
        .map((divisionId) => Number(divisionId))
        .sort((a, b) => a - b)
    const divisionRoleById: Record<number, "commissioner" | "captain"> = {}
    for (const divisionId of captainDivisionIds) {
        divisionRoleById[divisionId] = "captain"
    }

    if (isCommissioner) {
        const scope = await getCommissionerDivisionScope(userId, seasonId)

        if (scope.type === "league_wide") {
            return {
                hasAccess: true,
                isLeagueWideCommissioner: true,
                accessibleDivisionIds: captainDivisionIds,
                divisionRoleById,
                captainTeamIdsByDivision,
                defaultDivisionId: captainDivisionIds[0] ?? null
            }
        }

        if (scope.type === "division_specific") {
            for (const divisionId of scope.divisionIds) {
                divisionRoleById[divisionId] = "commissioner"
            }

            const accessibleDivisionIds = [
                ...new Set([...scope.divisionIds, ...captainDivisionIds])
            ].sort((a, b) => a - b)

            return {
                hasAccess: true,
                isLeagueWideCommissioner: false,
                accessibleDivisionIds,
                divisionRoleById,
                captainTeamIdsByDivision,
                defaultDivisionId: accessibleDivisionIds[0] ?? null
            }
        }
    }

    if (captainDivisionIds.length > 0) {
        return {
            hasAccess: true,
            isLeagueWideCommissioner: false,
            accessibleDivisionIds: captainDivisionIds,
            divisionRoleById,
            captainTeamIdsByDivision,
            defaultDivisionId: captainDivisionIds[0] ?? null
        }
    }

    return {
        hasAccess: false,
        isLeagueWideCommissioner: false,
        accessibleDivisionIds: [],
        divisionRoleById: {},
        captainTeamIdsByDivision: {},
        defaultDivisionId: null
    }
}

async function getDraftAccessContext() {
    return hasDraftPageAccess()
}

function canReadDraftDivision(
    access: Awaited<ReturnType<typeof hasDraftPageAccess>>,
    divisionId: number
): boolean {
    if (access.isLeagueWideCommissioner) return true
    return access.accessibleDivisionIds.includes(divisionId)
}

function canCommissionDraftDivision(
    access: Awaited<ReturnType<typeof hasDraftPageAccess>>,
    divisionId: number
): boolean {
    if (access.isLeagueWideCommissioner) return true
    return access.divisionRoleById[divisionId] === "commissioner"
}

export async function getDraftDivisionData(
    accessibleDivisionIds?: number[]
): Promise<{
    status: boolean
    message?: string
    currentSeasonId: number
    divisionSplits: DivisionSplitConfig[]
    divisions: DivisionOption[]
    users: UserOption[]
}> {
    const hasAccess = await checkDraftReadAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            currentSeasonId: 0,
            divisionSplits: [],
            divisions: [],
            users: []
        }
    }

    try {
        const config = await getSeasonConfig()
        const seasonId = config.seasonId || 0

        const [allDivisions, allUsers, splitRows] = await Promise.all([
            db
                .select({
                    id: divisions.id,
                    name: divisions.name,
                    level: divisions.level
                })
                .from(divisions)
                .orderBy(divisions.level),
            seasonId > 0
                ? db
                      .select({
                          id: users.id,
                          old_id: users.old_id,
                          first_name: users.first_name,
                          last_name: users.last_name,
                          preffered_name: users.preffered_name,
                          male: users.male,
                          picture: users.picture
                      })
                      .from(users)
                      .innerJoin(
                          signups,
                          and(
                              eq(signups.player, users.id),
                              eq(signups.season, seasonId)
                          )
                      )
                      .orderBy(users.last_name, users.first_name)
                : Promise.resolve([]),
            seasonId > 0
                ? db
                      .select({
                          divisionId: individual_divisions.division,
                          genderSplit: individual_divisions.gender_split
                      })
                      .from(individual_divisions)
                      .where(eq(individual_divisions.season, seasonId))
                : Promise.resolve([])
        ])

        const configuredDivisionIds = new Set(
            splitRows
                .filter((r) => r.divisionId !== null)
                .map((r) => r.divisionId as number)
        )

        const filteredDivisions = allDivisions.filter(
            (d) =>
                configuredDivisionIds.has(d.id) &&
                (accessibleDivisionIds === undefined ||
                    accessibleDivisionIds.includes(d.id))
        )

        return {
            status: true,
            currentSeasonId: seasonId,
            divisionSplits: splitRows
                .filter((r) => r.divisionId !== null)
                .map((r) => ({
                    divisionId: r.divisionId as number,
                    genderSplit: r.genderSplit ?? "5-3"
                })),
            divisions: filteredDivisions,
            users: allUsers
        }
    } catch (error) {
        console.error("Error fetching draft division data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            currentSeasonId: 0,
            divisionSplits: [],
            divisions: [],
            users: []
        }
    }
}

export async function getTeamsForSeasonAndDivision(
    seasonId: number,
    divisionId: number
): Promise<{
    status: boolean
    message?: string
    teams: TeamOption[]
}> {
    const hasAccess = await checkDraftReadAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            teams: []
        }
    }

    try {
        const access = await getDraftAccessContext()
        if (!canReadDraftDivision(access, divisionId)) {
            return {
                status: false,
                message: "You don't have permission to access this division.",
                teams: []
            }
        }

        const teamsList = await db
            .select({
                id: teams.id,
                name: teams.name,
                number: teams.number
            })
            .from(teams)
            .where(
                and(eq(teams.season, seasonId), eq(teams.division, divisionId))
            )
            .orderBy(teams.number)

        return {
            status: true,
            teams: teamsList
        }
    } catch (error) {
        console.error("Error fetching teams:", error)
        return {
            status: false,
            message: "Something went wrong.",
            teams: []
        }
    }
}

export async function getDraftInitData(
    seasonId: number,
    divisionId: number
): Promise<{
    status: boolean
    message?: string
    teams: TeamOption[]
    initialPicks: Record<string, string>
    pairMap: PairEntry[]
}> {
    const hasAccess = await checkDraftReadAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            teams: [],
            initialPicks: {},
            pairMap: []
        }
    }

    if (
        !Number.isInteger(seasonId) ||
        seasonId <= 0 ||
        !Number.isInteger(divisionId) ||
        divisionId <= 0
    ) {
        return {
            status: false,
            message: "Invalid season or division ID.",
            teams: [],
            initialPicks: {},
            pairMap: []
        }
    }

    try {
        const access = await getDraftAccessContext()
        if (!canReadDraftDivision(access, divisionId)) {
            return {
                status: false,
                message: "You don't have permission to access this division.",
                teams: [],
                initialPicks: {},
                pairMap: []
            }
        }

        const [teamsList, captRounds, pairDiffs, signupPairs] =
            await Promise.all([
                db
                    .select({
                        id: teams.id,
                        name: teams.name,
                        number: teams.number,
                        captain: teams.captain
                    })
                    .from(teams)
                    .where(
                        and(
                            eq(teams.season, seasonId),
                            eq(teams.division, divisionId)
                        )
                    )
                    .orderBy(teams.number),
                db
                    .select({
                        captain: draftCaptRounds.captain,
                        round: draftCaptRounds.round
                    })
                    .from(draftCaptRounds)
                    .where(
                        and(
                            eq(draftCaptRounds.season, seasonId),
                            eq(draftCaptRounds.division, divisionId)
                        )
                    ),
                db
                    .select({
                        player1: draftPairDiffs.player1,
                        player2: draftPairDiffs.player2,
                        diff: draftPairDiffs.diff
                    })
                    .from(draftPairDiffs)
                    .where(
                        and(
                            eq(draftPairDiffs.season, seasonId),
                            eq(draftPairDiffs.division, divisionId)
                        )
                    ),
                db
                    .select({
                        player: signups.player,
                        pair_pick: signups.pair_pick
                    })
                    .from(signups)
                    .where(
                        and(
                            eq(signups.season, seasonId),
                            eq(signups.pair, true)
                        )
                    )
            ])

        const DRAFT_ROUNDS = 8

        const captainRoundMap = new Map(
            captRounds.map((r) => [r.captain, r.round])
        )

        const pairPickMap = new Map<string, string>()
        for (const s of signupPairs) {
            if (s.pair_pick !== null) {
                pairPickMap.set(s.player, s.pair_pick)
            }
        }

        const pairDiffLookup = new Map<
            string,
            { round: number; higherPlayer: string }
        >()
        for (const pd of pairDiffs) {
            const info = { round: pd.diff, higherPlayer: pd.player1 }
            pairDiffLookup.set(`${pd.player1}:${pd.player2}`, info)
            pairDiffLookup.set(`${pd.player2}:${pd.player1}`, info)
        }

        const initialPicks: Record<string, string> = {}
        for (const team of teamsList) {
            const captainRound = captainRoundMap.get(team.captain)
            if (!captainRound) continue

            initialPicks[`${captainRound}-${team.id}`] = team.captain

            const pairId = pairPickMap.get(team.captain)
            if (pairId && pairId !== team.captain) {
                const key = `${team.captain}:${pairId}`
                const pinnedRound = pairDiffLookup.get(key)?.round ?? 8
                const pairRound =
                    captainRound < pinnedRound
                        ? pinnedRound
                        : Math.min(captainRound + 1, DRAFT_ROUNDS)
                if (!initialPicks[`${pairRound}-${team.id}`]) {
                    initialPicks[`${pairRound}-${team.id}`] = pairId
                }
            }
        }

        const pairMapEntries = new Map<string, PairEntry>()
        for (const s of signupPairs) {
            if (!s.pair_pick) continue
            const player = s.player
            const pairId = s.pair_pick

            const forwardKey = `${player}:${pairId}`
            if (!pairMapEntries.has(forwardKey)) {
                const info = pairDiffLookup.get(forwardKey)
                const pinnedRound = info?.round ?? 8
                const higherPlayer = info?.higherPlayer

                const playerIsCaptain = captainRoundMap.has(player)
                const pairIsCaptain = captainRoundMap.has(pairId)

                let playerIsPinned: boolean
                if (playerIsCaptain) {
                    playerIsPinned = false // captain is never pinned
                } else if (pairIsCaptain) {
                    playerIsPinned = true // non-captain is pinned
                } else {
                    // Non-captain pair: lower-rated player (NOT higherPlayer) is pinned
                    playerIsPinned = higherPlayer
                        ? player !== higherPlayer
                        : true
                }

                pairMapEntries.set(forwardKey, {
                    playerId: player,
                    pairId,
                    pinnedRound,
                    playerIsPinned
                })

                const reverseKey = `${pairId}:${player}`
                if (!pairMapEntries.has(reverseKey)) {
                    pairMapEntries.set(reverseKey, {
                        playerId: pairId,
                        pairId: player,
                        pinnedRound,
                        playerIsPinned: !playerIsPinned
                    })
                }
            }
        }

        return {
            status: true,
            teams: teamsList.map(({ id, name, number }) => ({
                id,
                name,
                number
            })),
            initialPicks,
            pairMap: Array.from(pairMapEntries.values())
        }
    } catch (error) {
        console.error("Error fetching draft init data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            teams: [],
            initialPicks: {},
            pairMap: []
        }
    }
}

// Maps homework round number → actual draft round number (same as prepare-for-draft)
const MALE_ROUND_MAP: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 6, 5: 7 }
const NON_MALE_ROUND_MAP: Record<number, number> = { 1: 3, 2: 5, 3: 8 }

export interface WatchlistPlayer {
    userId: string
    displayName: string
    round: number // mapped draft round (1–9)
}

export interface WatchlistData {
    malePlayers: WatchlistPlayer[] // all ranked males, sorted best-first
    nonMalePlayers: WatchlistPlayer[] // all ranked non-males, sorted best-first
    draftedUserIds: string[]
    view: "captain" | "commissioner"
}

export async function getDraftWatchlistData(
    seasonId: number,
    divisionId: number
): Promise<{ status: boolean; data?: WatchlistData; message?: string }> {
    const hasAccess = await checkDraftReadAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page."
        }
    }

    if (
        !Number.isInteger(seasonId) ||
        seasonId <= 0 ||
        !Number.isInteger(divisionId) ||
        divisionId <= 0
    ) {
        return { status: false, message: "Invalid season or division ID." }
    }

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { status: false, message: "Not authenticated." }
    const userId = session.user.id

    try {
        const access = await getDraftAccessContext()
        if (!canReadDraftDivision(access, divisionId)) {
            return {
                status: false,
                message: "You don't have permission to access this division."
            }
        }

        // Check if user is a captain in this specific division (captain view takes priority)
        const [[captainTeam], draftedRows] = await Promise.all([
            db
                .select({ id: teams.id })
                .from(teams)
                .where(
                    and(
                        eq(teams.season, seasonId),
                        eq(teams.division, divisionId),
                        or(
                            eq(teams.captain, userId),
                            eq(teams.captain2, userId)
                        )
                    )
                )
                .limit(1),
            db
                .select({ userId: drafts.user })
                .from(drafts)
                .innerJoin(teams, eq(drafts.team, teams.id))
                .where(eq(teams.season, seasonId))
        ])

        const draftedUserIds = [...new Set(draftedRows.map((r) => r.userId))]

        if (captainTeam) {
            return buildCaptainWatchlist(
                userId,
                seasonId,
                divisionId,
                draftedUserIds
            )
        }
        return buildCommissionerWatchlist(seasonId, divisionId, draftedUserIds)
    } catch (error) {
        console.error("Error fetching watchlist data:", error)
        return { status: false, message: "Something went wrong." }
    }
}

async function buildCaptainWatchlist(
    captainId: string,
    seasonId: number,
    divisionId: number,
    draftedUserIds: string[]
): Promise<{ status: boolean; data?: WatchlistData; message?: string }> {
    const homeworkRows = await db
        .select({
            playerId: draftHomework.player,
            round: draftHomework.round,
            isMaleTab: draftHomework.is_male_tab,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preffered_name,
            male: users.male
        })
        .from(draftHomework)
        .innerJoin(users, eq(draftHomework.player, users.id))
        .where(
            and(
                eq(draftHomework.season, seasonId),
                eq(draftHomework.division, divisionId),
                eq(draftHomework.captain, captainId)
            )
        )

    // Deduplicate: keep lowest mapped round per player
    const playerBest = new Map<
        string,
        { displayName: string; round: number; isMale: boolean }
    >()
    for (const row of homeworkRows) {
        const isMale = row.male === true
        // Skip cross-gender entries (player gender must match the tab)
        if ((isMale && !row.isMaleTab) || (!isMale && row.isMaleTab)) continue
        const mappedRound = row.isMaleTab
            ? (MALE_ROUND_MAP[row.round] ?? 9)
            : (NON_MALE_ROUND_MAP[row.round] ?? 9)
        const existing = playerBest.get(row.playerId)
        if (!existing || mappedRound < existing.round) {
            playerBest.set(row.playerId, {
                displayName: row.preferredName ?? row.firstName,
                round: mappedRound,
                isMale
            })
        }
    }

    const sorted = Array.from(playerBest.entries())
        .map(([uid, data]) => ({ userId: uid, ...data }))
        .sort((a, b) => a.round - b.round)

    const malePlayers = sorted
        .filter((p) => p.isMale)
        .map(({ userId, displayName, round }) => ({
            userId,
            displayName,
            round
        }))
    const nonMalePlayers = sorted
        .filter((p) => !p.isMale)
        .map(({ userId, displayName, round }) => ({
            userId,
            displayName,
            round
        }))

    return {
        status: true,
        data: {
            malePlayers,
            nonMalePlayers,
            draftedUserIds,
            view: "captain" as const
        }
    }
}

async function buildCommissionerWatchlist(
    seasonId: number,
    divisionId: number,
    draftedUserIds: string[]
): Promise<{ status: boolean; data?: WatchlistData; message?: string }> {
    const [homeworkRows, signupRows, priorSeasonRows] = await Promise.all([
        db
            .select({
                captainId: draftHomework.captain,
                playerId: draftHomework.player,
                round: draftHomework.round,
                isMaleTab: draftHomework.is_male_tab
            })
            .from(draftHomework)
            .where(
                and(
                    eq(draftHomework.season, seasonId),
                    eq(draftHomework.division, divisionId)
                )
            ),
        db
            .select({
                userId: users.id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preffered_name,
                male: users.male
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(eq(signups.season, seasonId)),
        db
            .select({ id: seasons.id })
            .from(seasons)
            .where(lt(seasons.id, seasonId))
            .orderBy(desc(seasons.id))
            .limit(3)
    ])

    const priorSeasonIds = priorSeasonRows.map((r) => r.id)
    const playerIds = signupRows.map((r) => r.userId)

    // Build player gender lookup for cross-tab validation
    const playerGenderMap = new Map(
        signupRows.map((r) => [r.userId, r.male === true])
    )

    // Weighted draft history
    const draftHistMap = new Map<string, Map<number, number>>()
    if (priorSeasonIds.length > 0 && playerIds.length > 0) {
        const priorDraftRows = await db
            .select({
                userId: drafts.user,
                seasonId: teams.season,
                round: drafts.round
            })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .where(
                and(
                    inArray(drafts.user, playerIds),
                    inArray(teams.season, priorSeasonIds),
                    eq(teams.division, divisionId)
                )
            )

        for (const row of priorDraftRows) {
            if (!draftHistMap.has(row.userId)) {
                draftHistMap.set(row.userId, new Map())
            }
            draftHistMap.get(row.userId)!.set(row.seasonId, row.round)
        }
    }

    // Build per-captain best round for each player (deduplicated)
    const captainPlayerBest = new Map<string, Map<string, number>>()
    for (const hw of homeworkRows) {
        const isMale = playerGenderMap.get(hw.playerId) ?? false
        if ((isMale && !hw.isMaleTab) || (!isMale && hw.isMaleTab)) continue
        const mappedRound = hw.isMaleTab
            ? (MALE_ROUND_MAP[hw.round] ?? 9)
            : (NON_MALE_ROUND_MAP[hw.round] ?? 9)
        if (!captainPlayerBest.has(hw.captainId)) {
            captainPlayerBest.set(hw.captainId, new Map())
        }
        const captainMap = captainPlayerBest.get(hw.captainId)!
        const existing = captainMap.get(hw.playerId)
        if (existing === undefined || mappedRound < existing) {
            captainMap.set(hw.playerId, mappedRound)
        }
    }

    // Aggregate to playerId → [one round per captain]
    const playerCaptainRoundsAgg = new Map<string, number[]>()
    for (const [, captainMap] of captainPlayerBest) {
        for (const [playerId, mappedRound] of captainMap) {
            if (!playerCaptainRoundsAgg.has(playerId)) {
                playerCaptainRoundsAgg.set(playerId, [])
            }
            playerCaptainRoundsAgg.get(playerId)!.push(mappedRound)
        }
    }

    const WEIGHTS = [3, 2, 1]

    const rankedPlayers = signupRows
        .map((player) => {
            const captainRounds =
                playerCaptainRoundsAgg.get(player.userId) ?? []
            const captainAvg =
                captainRounds.length > 0
                    ? captainRounds.reduce((sum, r) => sum + r, 0) /
                      captainRounds.length
                    : 9

            const playerHistory = draftHistMap.get(player.userId)
            let weightedSum = 0
            let totalWeight = 0
            if (playerHistory) {
                for (let i = 0; i < priorSeasonIds.length; i++) {
                    const round = playerHistory.get(priorSeasonIds[i])
                    if (round !== undefined) {
                        weightedSum += round * WEIGHTS[i]
                        totalWeight += WEIGHTS[i]
                    }
                }
            }
            const historyAvg =
                totalWeight > 0 ? weightedSum / totalWeight : null
            const recommendedRound =
                historyAvg !== null
                    ? captainAvg * 0.6 + historyAvg * 0.4
                    : captainAvg

            return {
                userId: player.userId,
                displayName: player.preferredName ?? player.firstName,
                isMale: player.male === true,
                round: Math.round(recommendedRound)
            }
        })
        .sort((a, b) => a.round - b.round)

    const malePlayers = rankedPlayers
        .filter((p) => p.isMale)
        .map(({ userId, displayName, round }) => ({
            userId,
            displayName,
            round
        }))
    const nonMalePlayers = rankedPlayers
        .filter((p) => !p.isMale)
        .map(({ userId, displayName, round }) => ({
            userId,
            displayName,
            round
        }))

    return {
        status: true,
        data: {
            malePlayers,
            nonMalePlayers,
            draftedUserIds,
            view: "commissioner" as const
        }
    }
}

interface DraftPick {
    teamId: number
    teamNumber: number
    userId: string
    round: number
}

export async function submitDraft(
    divisionLevel: number,
    picks: DraftPick[]
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await checkCommissionersAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to perform this action."
        }
    }

    if (picks.length === 0) {
        return {
            status: false,
            message: "No draft picks to submit."
        }
    }

    // Validate all picks have users selected
    for (const pick of picks) {
        if (!pick.userId) {
            return {
                status: false,
                message: `Please select a player for Round ${pick.round}, Team ${pick.teamNumber}.`
            }
        }
    }

    const numTeams = new Set(picks.map((p) => p.teamId)).size

    try {
        const access = await getDraftAccessContext()
        const teamIds = [...new Set(picks.map((pick) => pick.teamId))]
        const teamRows = await db
            .select({ id: teams.id, divisionId: teams.division })
            .from(teams)
            .where(inArray(teams.id, teamIds))
        const divisionIds = [
            ...new Set(teamRows.map((team) => team.divisionId))
        ]

        if (
            divisionIds.length !== 1 ||
            !canCommissionDraftDivision(access, divisionIds[0])
        ) {
            return {
                status: false,
                message:
                    "You don't have permission to submit this division's draft."
            }
        }

        // Calculate overall for each pick and insert
        // Snake draft: odd rounds go 1-N, even rounds go N-1
        await db.insert(drafts).values(
            picks.map((pick) => {
                const isOddRound = pick.round % 2 === 1
                const baseValue =
                    (divisionLevel - 1) * 50 + (pick.round - 1) * numTeams
                const positionValue = isOddRound
                    ? pick.teamNumber
                    : numTeams + 1 - pick.teamNumber
                return {
                    team: pick.teamId,
                    user: pick.userId,
                    round: pick.round,
                    overall: baseValue + positionValue
                }
            })
        )

        const session = await auth.api.getSession({ headers: await headers() })
        if (session) {
            await logAuditEntry({
                userId: session.user.id,
                action: "create",
                entityType: "drafts",
                summary: `Submitted ${picks.length} draft picks for division level ${divisionLevel}`
            })
        }

        return {
            status: true,
            message: `Successfully submitted ${picks.length} draft picks!`
        }
    } catch (error) {
        console.error("Error submitting draft:", error)
        return {
            status: false,
            message: "Something went wrong while submitting the draft."
        }
    }
}
