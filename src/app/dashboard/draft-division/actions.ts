"use server"

import { formatSeasonLabel } from "@/lib/season-utils"
import { logger } from "@/lib/logger"
import { auth } from "@/lib/auth"
import { revalidateCalendarFeeds } from "@/next/calendar-invalidation"
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
import { ensureTeamRecipientGroup } from "@/lib/email-recipients"
import { buildDraftResultHtml } from "@/lib/email-html"
import {
    dispatchNotification,
    type NotificationRecipient
} from "@/lib/notifications/dispatch"
import { formatDisplayName } from "@/lib/utils"
import { buildHomeworkRoundMaps } from "@/lib/draft-round-maps"
import { getDraftSetupStatus, type DraftSetupStatus } from "@/lib/draft-setup"
import { fetchPlayerScores } from "@/lib/player-score"
import { isCommissionerBySession } from "@/next/session"
import {
    isAdminOrDirector,
    isCommissionerForCurrentSeason,
    isCaptainForSeason
} from "@/lib/rbac"
import {
    type ActionResult,
    fail,
    ok,
    requirePositiveInt,
    requireSession,
    withAction
} from "@/next/action-helpers"
import { hasDraftPageAccess } from "./data"

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

export interface DraftInitData {
    /** True once any drafts rows exist for this division's teams. */
    alreadySubmitted: boolean
    teams: TeamOption[]
    initialPicks: Record<string, string>
    pairMap: PairEntry[]
    /** Draft Setup readiness — the board must not open until `ready`. */
    setupStatus: DraftSetupStatus
}

export const getDraftInitData = withAction(
    async (
        seasonId: number,
        divisionId: number
    ): Promise<ActionResult<DraftInitData>> => {
        const hasAccess = await checkDraftReadAccess()
        if (!hasAccess) {
            return fail("You don't have permission to access this page.")
        }

        requirePositiveInt(seasonId, "season or division ID")
        requirePositiveInt(divisionId, "season or division ID")

        // Access (hasDraftPageAccess) is computed for the current season;
        // the season the queries run against must be the same one, or a
        // current captain could read another season's board as a
        // commissioner.
        const config = await getSeasonConfig()
        if (seasonId !== config.seasonId) {
            return fail("Draft data is only available for the current season.")
        }

        const access = await hasDraftPageAccess()
        if (!canReadDraftDivision(access, divisionId)) {
            return fail("You don't have permission to access this division.")
        }

        const [teamsList, captRounds, pairDiffs, signupPairs, setupStatus] =
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
                    ),
                getDraftSetupStatus(seasonId, divisionId)
            ])

        const DRAFT_ROUNDS = 8

        const existingDrafts =
            teamsList.length > 0
                ? await db
                      .select({ id: drafts.id })
                      .from(drafts)
                      .where(
                          inArray(
                              drafts.team,
                              teamsList.map((t) => t.id)
                          )
                      )
                      .limit(1)
                : []

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
                    pinnedRound === captainRound
                        ? captainRound < DRAFT_ROUNDS
                            ? captainRound + 1
                            : captainRound - 1
                        : pinnedRound
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

        return ok({
            alreadySubmitted: existingDrafts.length > 0,
            teams: teamsList.map(({ id, name, number }) => ({
                id,
                name,
                number
            })),
            initialPicks,
            pairMap: Array.from(pairMapEntries.values()),
            setupStatus
        })
    }
)

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

export const getDraftWatchlistData = withAction(
    async (
        seasonId: number,
        divisionId: number
    ): Promise<ActionResult<WatchlistData>> => {
        const hasAccess = await checkDraftReadAccess()
        if (!hasAccess) {
            return fail("You don't have permission to access this page.")
        }

        requirePositiveInt(seasonId, "season or division ID")
        requirePositiveInt(divisionId, "season or division ID")

        // Access (hasDraftPageAccess) is computed for the current season;
        // the season the queries run against must be the same one, or a
        // current captain could read another season's board as a
        // commissioner.
        const config = await getSeasonConfig()
        if (seasonId !== config.seasonId) {
            return fail("Draft data is only available for the current season.")
        }

        const session = await requireSession()
        const userId = session.user.id

        const access = await hasDraftPageAccess()
        if (!canReadDraftDivision(access, divisionId)) {
            return fail("You don't have permission to access this division.")
        }

        // Check if user is a captain in this specific division (captain view takes priority)
        const [[captainTeam], draftedRows] = await Promise.all([
            db
                .select({
                    id: teams.id,
                    captain: teams.captain,
                    captain2: teams.captain2
                })
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
            // Include both co-captains' homework for a shared team
            const captainIds = [
                captainTeam.captain,
                captainTeam.captain2
            ].filter((id): id is string => id !== null)
            return ok(
                await buildCaptainWatchlist(
                    captainIds,
                    seasonId,
                    divisionId,
                    draftedUserIds
                )
            )
        }
        return ok(
            await buildCommissionerWatchlist(
                seasonId,
                divisionId,
                draftedUserIds
            )
        )
    }
)

async function buildCaptainWatchlist(
    captainIds: string[],
    seasonId: number,
    divisionId: number,
    draftedUserIds: string[]
): Promise<WatchlistData> {
    const [indivDiv] = await db
        .select({ genderSplit: individual_divisions.gender_split })
        .from(individual_divisions)
        .where(
            and(
                eq(individual_divisions.season, seasonId),
                eq(individual_divisions.division, divisionId)
            )
        )
        .limit(1)
    const roundMaps = buildHomeworkRoundMaps(indivDiv?.genderSplit)

    const homeworkRows = await db
        .select({
            playerId: draftHomework.player,
            round: draftHomework.round,
            slot: draftHomework.slot,
            isMaleTab: draftHomework.is_male_tab,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            male: users.male
        })
        .from(draftHomework)
        .innerJoin(users, eq(draftHomework.player, users.id))
        .where(
            and(
                eq(draftHomework.season, seasonId),
                eq(draftHomework.division, divisionId),
                inArray(draftHomework.captain, captainIds)
            )
        )

    // Deduplicate: keep lowest mapped round (then lowest slot) per player
    const playerBest = new Map<
        string,
        { displayName: string; round: number; slot: number; isMale: boolean }
    >()
    for (const row of homeworkRows) {
        const isMale = row.male === true
        // Skip cross-gender entries (player gender must match the tab)
        if ((isMale && !row.isMaleTab) || (!isMale && row.isMaleTab)) continue
        const mappedRound = row.isMaleTab
            ? (roundMaps.male[row.round] ?? 9)
            : (roundMaps.nonMale[row.round] ?? 9)
        const existing = playerBest.get(row.playerId)
        if (
            !existing ||
            mappedRound < existing.round ||
            (mappedRound === existing.round && row.slot < existing.slot)
        ) {
            playerBest.set(row.playerId, {
                displayName: row.preferredName ?? row.firstName,
                round: mappedRound,
                slot: row.slot,
                isMale
            })
        }
    }

    // Order by expected draft round, then by the captain's own slot ranking
    const sorted = Array.from(playerBest.entries())
        .map(([uid, data]) => ({ userId: uid, ...data }))
        .sort((a, b) => a.round - b.round || a.slot - b.slot)

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
        malePlayers,
        nonMalePlayers,
        draftedUserIds,
        view: "captain" as const
    }
}

async function buildCommissionerWatchlist(
    seasonId: number,
    divisionId: number,
    draftedUserIds: string[]
): Promise<WatchlistData> {
    const [indivDiv] = await db
        .select({ genderSplit: individual_divisions.gender_split })
        .from(individual_divisions)
        .where(
            and(
                eq(individual_divisions.season, seasonId),
                eq(individual_divisions.division, divisionId)
            )
        )
        .limit(1)
    const roundMaps = buildHomeworkRoundMaps(indivDiv?.genderSplit)

    const [homeworkRows, signupRows, priorSeasonRows, divisionLevelRows] =
        await Promise.all([
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
                    preferredName: users.preferred_name,
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
                .limit(3),
            db
                .select({ divisionId: individual_divisions.division })
                .from(individual_divisions)
                .innerJoin(
                    divisions,
                    eq(individual_divisions.division, divisions.id)
                )
                .where(eq(individual_divisions.season, seasonId))
                .orderBy(desc(divisions.level))
                .limit(1)
        ])

    // In the season's last division every remaining player is draftable, so
    // score-only suggestions are not capped there.
    const isLastDivision = divisionLevelRows[0]?.divisionId === divisionId

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
            ? (roundMaps.male[hw.round] ?? 9)
            : (roundMaps.nonMale[hw.round] ?? 9)
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

    // Division signal: the player appears in some captain's homework for this
    // division (any round, including "Considering"), or has draft history in
    // this division within the 3 prior seasons.
    const homeworkPlacedIds = new Set(homeworkRows.map((hw) => hw.playerId))

    // Placement score (lower = better; a virtual overall pick number) — the
    // same ranking the Create Week pages and homework suggestions use. It
    // orders players within a round and surfaces division-below risers.
    const scoreByUser = await fetchPlayerScores(playerIds, seasonId)

    // How many players with no division signal to suggest per gender, ranked
    // purely by score (top players from the division below). Players already
    // drafted this season can never be suggestions, so they are excluded
    // before the cap. The last division is uncapped.
    const EXTRA_SUGGESTIONS = 10
    const draftedSet = new Set(draftedUserIds)

    const rankedPlayers = signupRows.map((player) => {
        const captainRounds = playerCaptainRoundsAgg.get(player.userId) ?? []
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
        const historyAvg = totalWeight > 0 ? weightedSum / totalWeight : null
        const recommendedRound =
            historyAvg !== null
                ? captainAvg * 0.6 + historyAvg * 0.4
                : captainAvg

        return {
            userId: player.userId,
            displayName: player.preferredName ?? player.firstName,
            isMale: player.male === true,
            round: Math.round(recommendedRound),
            score: scoreByUser.get(player.userId) ?? 200,
            hasDivisionSignal:
                homeworkPlacedIds.has(player.userId) ||
                draftHistMap.has(player.userId)
        }
    })

    const selectForGender = (isMale: boolean): WatchlistPlayer[] => {
        const pool = rankedPlayers.filter((p) => p.isMale === isMale)
        const withSignal = pool.filter((p) => p.hasDivisionSignal)
        const extras = pool
            .filter((p) => !p.hasDivisionSignal && !draftedSet.has(p.userId))
            .sort((a, b) => a.score - b.score)
            .slice(0, isLastDivision ? pool.length : EXTRA_SUGGESTIONS)
        return [...withSignal, ...extras]
            .sort((a, b) => a.round - b.round || a.score - b.score)
            .map(({ userId, displayName, round }) => ({
                userId,
                displayName,
                round
            }))
    }

    const malePlayers = selectForGender(true)
    const nonMalePlayers = selectForGender(false)

    return {
        malePlayers,
        nonMalePlayers,
        draftedUserIds,
        view: "commissioner" as const
    }
}

interface DraftPick {
    teamId: number
    teamNumber: number
    userId: string
    round: number
}

export const submitDraft = withAction(
    async (
        divisionLevel: number,
        picks: DraftPick[]
    ): Promise<ActionResult<void>> => {
        const hasAccess = await isCommissionerBySession()
        if (!hasAccess) {
            return fail("You don't have permission to perform this action.")
        }

        if (picks.length === 0) {
            return fail("No draft picks to submit.")
        }

        // Validate all picks have users selected
        for (const pick of picks) {
            if (!pick.userId) {
                return fail(
                    `Please select a player for Round ${pick.round}, Team ${pick.teamNumber}.`
                )
            }
        }

        const numTeams = new Set(picks.map((p) => p.teamId)).size

        try {
            const access = await hasDraftPageAccess()
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
                return fail(
                    "You don't have permission to submit this division's draft."
                )
            }

            // A division's draft is submitted exactly once. Lock the team
            // rows so two commissioners pressing Submit at the same moment are
            // serialized: the second one waits, then sees the first one's
            // picks and is refused instead of doubling every roster.
            const inserted = await db.transaction(async (tx) => {
                await tx
                    .select({ id: teams.id })
                    .from(teams)
                    .where(inArray(teams.id, teamIds))
                    .for("update")
                const existing = await tx
                    .select({ id: drafts.id })
                    .from(drafts)
                    .where(inArray(drafts.team, teamIds))
                    .limit(1)
                if (existing.length > 0) {
                    return false
                }

                // Calculate overall for each pick and insert
                // Snake draft: odd rounds go 1-N, even rounds go N-1
                await tx.insert(drafts).values(
                    picks.map((pick) => {
                        const isOddRound = pick.round % 2 === 1
                        const baseValue =
                            (divisionLevel - 1) * 50 +
                            (pick.round - 1) * numTeams
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
                return true
            })

            if (!inserted) {
                return fail(
                    "This division's draft has already been submitted. Reload the page to see the final board."
                )
            }

            const session = await auth.api.getSession({
                headers: await headers()
            })
            if (session) {
                await logAuditEntry({
                    userId: session.user.id,
                    action: "create",
                    entityType: "drafts",
                    summary: `Submitted ${picks.length} draft picks for division level ${divisionLevel}`
                })
            }

            // Ensure all drafted teams have recipient groups (fire-and-forget)
            const config = await getSeasonConfig()
            if (config.seasonId) {
                const draftedTeamIds = [...new Set(picks.map((p) => p.teamId))]
                for (const teamId of draftedTeamIds) {
                    ensureTeamRecipientGroup(teamId, config.seasonId).catch(
                        (err) =>
                            logger.error(
                                "[draft] Team recipient group sync failed",
                                { teamId },
                                err
                            )
                    )
                }
            }

            await sendDraftResultNotifications(picks, config, divisionIds[0])

            revalidateCalendarFeeds()
            return ok(
                undefined,
                `Successfully submitted ${picks.length} draft picks!`
            )
        } catch (error) {
            // Kept (not redundant): preserves this action's distinct
            // user-facing failure message instead of withAction's generic one.
            logger.error("Error submitting draft", undefined, error)
            return fail("Something went wrong while submitting the draft.")
        }
    }
)

/**
 * Emails every drafted player their team, division, and captain(s). Runs
 * after the picks are committed; dispatchNotification never throws, so a
 * mail outage can't fail the draft submission.
 */
async function sendDraftResultNotifications(
    picks: DraftPick[],
    config: Awaited<ReturnType<typeof getSeasonConfig>>,
    divisionId: number
): Promise<void> {
    const draftedTeamIds = [...new Set(picks.map((p) => p.teamId))]
    const draftedUserIds = [...new Set(picks.map((p) => p.userId))]

    const [teamRows, userRows] = await Promise.all([
        db
            .select({
                id: teams.id,
                name: teams.name,
                number: teams.number,
                divisionName: divisions.name,
                captain: teams.captain,
                captain2: teams.captain2
            })
            .from(teams)
            .innerJoin(divisions, eq(teams.division, divisions.id))
            .where(inArray(teams.id, draftedTeamIds)),
        db
            .select({
                id: users.id,
                email: users.email,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name
            })
            .from(users)
            .where(inArray(users.id, draftedUserIds))
    ])

    const captainIds = [
        ...new Set(
            teamRows.flatMap((t) => [t.captain, t.captain2]).filter(Boolean)
        )
    ] as string[]
    const captainRows =
        captainIds.length > 0
            ? await db
                  .select({
                      id: users.id,
                      firstName: users.first_name,
                      lastName: users.last_name,
                      preferredName: users.preferred_name
                  })
                  .from(users)
                  .where(inArray(users.id, captainIds))
            : []
    const captainById = new Map(captainRows.map((c) => [c.id, c]))

    const teamById = new Map(teamRows.map((t) => [t.id, t]))
    const userById = new Map(userRows.map((u) => [u.id, u]))
    const seasonLabel = formatSeasonLabel(config)

    const recipients: NotificationRecipient[] = []
    const htmlByUserId = new Map<string, string>()

    for (const pick of picks) {
        const user = userById.get(pick.userId)
        const team = teamById.get(pick.teamId)
        if (!user?.email || !team) continue

        const firstName =
            user.preferredName || user.firstName || user.email.split("@")[0]
        const captainNames = [team.captain, team.captain2]
            .map((id) => (id ? captainById.get(id) : null))
            .filter(Boolean)
            .map((c) =>
                formatDisplayName(c!.firstName, c!.lastName, c!.preferredName)
            )

        htmlByUserId.set(
            user.id,
            buildDraftResultHtml({
                firstName,
                teamName: team.name || `Team ${team.number ?? team.id}`,
                divisionName: team.divisionName,
                captainNames,
                seasonLabel
            })
        )
        recipients.push({ userId: user.id, email: user.email, firstName })
    }

    await dispatchNotification({
        type: "draft_results",
        recipients,
        subject: `You've been drafted — ${seasonLabel}`,
        htmlBody: (r) => htmlByUserId.get(r.userId) ?? "",
        tag: "draft-results",
        // One "you've been drafted" email per player per division draft, even
        // if the dispatch is ever repeated for the same division.
        dedupeKey: config.seasonId
            ? `draft-results-s${config.seasonId}-d${divisionId}`
            : undefined
    })
}
