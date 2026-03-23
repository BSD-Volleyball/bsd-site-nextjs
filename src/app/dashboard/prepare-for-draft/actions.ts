"use server"

import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import {
    divisions,
    draftCaptRounds,
    draftHomework,
    draftPairDiffs,
    drafts,
    emailTemplates,
    individual_divisions,
    seasons,
    signups,
    teams,
    users
} from "@/database/schema"
import { getSeasonConfig } from "@/lib/site-config"
import {
    type LexicalEmailTemplateContent,
    normalizeEmailTemplateContent,
    extractPlainTextFromEmailTemplateContent
} from "@/lib/email-template-content"
import { fetchPlayerScores } from "@/lib/player-score"
import {
    getCommissionerDivisionScope,
    isCommissionerBySession
} from "@/lib/rbac"
import { isGhostCaptain } from "@/lib/ghost-captain"

// Maps homework round number → actual draft round number
const MALE_ROUND_MAP: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 6, 5: 7 }
const NON_MALE_ROUND_MAP: Record<number, number> = { 1: 3, 2: 5, 3: 8 }
// Any round not in these maps (including "Considering") → 9

export interface CaptainInfo {
    userId: string
    displayName: string
    lastName: string
    email: string
}

export interface PlayerRow {
    userId: string
    displayName: string
    lastName: string
    isMale: boolean
    isPairPick: boolean
    captainRounds: {
        captainId: string
        mappedRound: number
        captainCompletedHomework: boolean
    }[]
    captainAverage: number
    draftHistoryAverage: number | null
    recommendedRound: number
}

export interface DivisionOption {
    id: number
    name: string
}

export interface PairDifferential {
    player1UserId: string // higher-rated player (lower recommendedRound)
    player1DisplayName: string
    player1LastName: string
    player1Round: number
    player2UserId: string // lower-rated player
    player2DisplayName: string
    player2LastName: string
    player2Round: number
    captainIsLower: boolean // true when captain is the lower-rated (player2), so player1 is pinned
}

export interface ConsideredButUndraftedPlayer {
    userId: string
    displayName: string
    lastName: string
    pairDisplayName: string | null
    score: number
    consideredInDivisions: string[]
    considerationCount: number
}

export interface PrepareForDraftData {
    seasonId: number
    seasonLabel: string
    divisionId: number
    divisionName: string
    captains: CaptainInfo[]
    players: PlayerRow[]
    pairDifferentials: PairDifferential[]
    availableDivisions: DivisionOption[]
    isLeagueWide: boolean
    savedCaptainRounds: Record<string, number>
    savedPairDiffs: Record<string, number>
    emailTemplate: string
    emailTemplateContent: LexicalEmailTemplateContent | null
    emailSubject: string
    consideredButUndrafted: {
        isRelevant: boolean
        message: string
        players: ConsideredButUndraftedPlayer[]
    }
}

type AccessResult =
    | {
          type: "allowed"
          availableDivisions: DivisionOption[]
          isLeagueWide: boolean
      }
    | { type: "denied" }

async function loadAvailableDivisions(
    seasonId: number
): Promise<DivisionOption[]> {
    return db
        .select({ id: divisions.id, name: divisions.name })
        .from(individual_divisions)
        .innerJoin(divisions, eq(individual_divisions.division, divisions.id))
        .where(eq(individual_divisions.season, seasonId))
        .orderBy(asc(divisions.level))
}

async function resolveCommissionerDivisionAccess(
    userId: string,
    seasonId: number
): Promise<AccessResult> {
    const scope = await getCommissionerDivisionScope(userId, seasonId)

    if (scope.type === "denied") {
        return { type: "denied" }
    }

    if (scope.type === "league_wide") {
        const availableDivisions = await loadAvailableDivisions(seasonId)
        return { type: "allowed", availableDivisions, isLeagueWide: true }
    }

    const availableDivisions = (await loadAvailableDivisions(seasonId)).filter(
        (division) => scope.divisionIds.includes(division.id)
    )
    return { type: "allowed", availableDivisions, isLeagueWide: false }
}

export async function getPrepareForDraftData(
    divisionIdParam?: number
): Promise<{
    status: boolean
    message: string
    data?: PrepareForDraftData
}> {
    // 1. Auth check
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return { status: false, message: "Not authenticated" }
    }

    // 2. Season check
    const config = await getSeasonConfig()
    if (!config.seasonId) {
        return { status: false, message: "No active season found" }
    }
    const seasonId = config.seasonId

    // 3. Resolve access
    const access = await resolveCommissionerDivisionAccess(
        session.user.id,
        seasonId
    )
    if (access.type === "denied") {
        return {
            status: false,
            message: "You are not authorized to access this page."
        }
    }

    // 4. Resolve divisionId and league-wide state
    let divisionId: number
    const isLeagueWide =
        access.isLeagueWide || access.availableDivisions.length > 1
    let availableDivisions: DivisionOption[] = []

    availableDivisions = access.availableDivisions

    const validParam =
        divisionIdParam !== undefined &&
        Number.isInteger(divisionIdParam) &&
        divisionIdParam > 0
    if (
        validParam &&
        availableDivisions.some((division) => division.id === divisionIdParam)
    ) {
        divisionId = divisionIdParam!
    } else if (availableDivisions.length > 0) {
        divisionId = availableDivisions[0].id
    } else {
        return {
            status: false,
            message: "No divisions found for this season."
        }
    }

    // Season label
    const [seasonRow] = await db
        .select({ year: seasons.year, season: seasons.season })
        .from(seasons)
        .where(eq(seasons.id, seasonId))
        .limit(1)

    const seasonLabel = seasonRow
        ? `${seasonRow.season.charAt(0).toUpperCase() + seasonRow.season.slice(1)} ${seasonRow.year}`
        : String(seasonId)

    // Division name
    const [divisionRow] = await db
        .select({ name: divisions.name })
        .from(divisions)
        .where(eq(divisions.id, divisionId))
        .limit(1)

    const divisionName = divisionRow?.name ?? ""

    const seasonDivisionRows = await db
        .select({
            id: divisions.id,
            name: divisions.name,
            level: divisions.level
        })
        .from(individual_divisions)
        .innerJoin(divisions, eq(individual_divisions.division, divisions.id))
        .where(eq(individual_divisions.season, seasonId))
        .orderBy(asc(divisions.level))

    const currentDivisionConfig =
        seasonDivisionRows.find((row) => row.id === divisionId) ?? null
    const higherDivisionRows = currentDivisionConfig
        ? seasonDivisionRows.filter(
              (row) => row.level < currentDivisionConfig.level
          )
        : []
    const immediatelyHigherDivision =
        higherDivisionRows.length > 0
            ? higherDivisionRows[higherDivisionRows.length - 1]
            : null

    // numTeams determines completion threshold: 5 male rounds + 3 non-male rounds = 8 slots per team
    const [indivDiv] = await db
        .select({ numTeams: individual_divisions.teams })
        .from(individual_divisions)
        .where(
            and(
                eq(individual_divisions.season, seasonId),
                eq(individual_divisions.division, divisionId)
            )
        )
        .limit(1)

    const completionThreshold = (indivDiv?.numTeams ?? 0) * 8

    // Query A: Draft homework entries for this season + division
    const homeworkRows = await db
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
        )

    // Build homework lookup: `${captainId}:${playerId}` → { round, isMaleTab }
    // Use the first entry per captain+player pair
    const homeworkMap = new Map<string, { round: number; isMaleTab: boolean }>()
    // Count raw rows per captain to determine completion (8 × numTeams slots total)
    const captainRowCount = new Map<string, number>()
    for (const row of homeworkRows) {
        const key = `${row.captainId}:${row.playerId}`
        if (!homeworkMap.has(key)) {
            homeworkMap.set(key, { round: row.round, isMaleTab: row.isMaleTab })
        }
        captainRowCount.set(
            row.captainId,
            (captainRowCount.get(row.captainId) ?? 0) + 1
        )
    }

    // A captain's unrated players count as 9 only if they've fully completed their homework
    const captainsFullyCompleted = new Set(
        [...captainRowCount.entries()]
            .filter(
                ([, count]) =>
                    completionThreshold > 0 && count >= completionThreshold
            )
            .map(([captainId]) => captainId)
    )

    // Query B: All signups for the season with user info
    const signupRows = await db
        .select({
            userId: users.id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preffered_name,
            male: users.male,
            pairPick: signups.pair_pick
        })
        .from(signups)
        .innerJoin(users, eq(signups.player, users.id))
        .where(eq(signups.season, seasonId))

    // Build set of player IDs that have been nominated as someone's pair pick
    const pairPickSet = new Set(
        signupRows
            .map((r) => r.pairPick)
            .filter((id): id is string => id !== null)
    )

    // Query C: Captains for this division+season
    const captainRows = await db
        .select({
            captainId: teams.captain,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preffered_name,
            email: users.email
        })
        .from(teams)
        .innerJoin(users, eq(teams.captain, users.id))
        .where(and(eq(teams.season, seasonId), eq(teams.division, divisionId)))

    const captains: CaptainInfo[] = captainRows
        .filter((r) => !isGhostCaptain(r.captainId))
        .map((r) => ({
            userId: r.captainId,
            displayName: r.preferredName ?? r.firstName,
            lastName: r.lastName,
            email: r.email
        }))

    // Query D1: 3 most recent prior season IDs (weighted: index 0 = ×3, 1 = ×2, 2 = ×1)
    const priorSeasonRows = await db
        .select({ id: seasons.id })
        .from(seasons)
        .where(lt(seasons.id, seasonId))
        .orderBy(desc(seasons.id))
        .limit(3)

    const priorSeasonIds = priorSeasonRows.map((r) => r.id)

    // Query D2: Draft picks for prior seasons in this division for signed-up players
    const playerIds = signupRows.map((r) => r.userId)
    // userId → seasonId → draft round
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

    const WEIGHTS = [3, 2, 1]

    function buildPlayerRow(player: (typeof signupRows)[0]): PlayerRow {
        const isMale = player.male === true

        const captainRounds = captains.map((captain) => {
            const key = `${captain.userId}:${player.userId}`
            const hw = homeworkMap.get(key)
            let mappedRound = 9
            if (hw) {
                if (isMale && hw.isMaleTab) {
                    mappedRound = MALE_ROUND_MAP[hw.round] ?? 9
                } else if (!isMale && !hw.isMaleTab) {
                    mappedRound = NON_MALE_ROUND_MAP[hw.round] ?? 9
                }
            }
            return {
                captainId: captain.userId,
                mappedRound,
                captainCompletedHomework: captainsFullyCompleted.has(
                    captain.userId
                )
            }
        })

        // Only average over captains who have fully completed their homework.
        // Fully completed captains who didn't rank this player contribute 9.
        // Captains with partial or no homework are excluded from the average.
        const activeCaptainRounds = captainRounds.filter((cr) =>
            captainsFullyCompleted.has(cr.captainId)
        )
        const captainAverage =
            activeCaptainRounds.length > 0
                ? activeCaptainRounds.reduce(
                      (sum, r) => sum + r.mappedRound,
                      0
                  ) / activeCaptainRounds.length
                : 9

        // Weighted draft history average
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
        const draftHistoryAverage =
            totalWeight > 0 ? weightedSum / totalWeight : null

        const recommendedRound =
            draftHistoryAverage !== null
                ? captainAverage * 0.6 + draftHistoryAverage * 0.4
                : captainAverage

        return {
            userId: player.userId,
            displayName: player.preferredName ?? player.firstName,
            lastName: player.lastName,
            isMale,
            isPairPick: pairPickSet.has(player.userId),
            captainRounds,
            captainAverage,
            draftHistoryAverage,
            recommendedRound
        }
    }

    const sortPlayerRows = (a: PlayerRow, b: PlayerRow) => {
        const diff = a.recommendedRound - b.recommendedRound
        return diff !== 0 ? diff : a.lastName.localeCompare(b.lastName)
    }

    const players = signupRows
        .map(buildPlayerRow)
        // Only include players that at least one captain placed in their homework
        .filter((p) => p.captainRounds.some((r) => r.mappedRound !== 9))
        .sort(sortPlayerRows)

    // Build lookup maps for pair differentials
    const recommendedRoundById = new Map(
        players.map((p) => [p.userId, p.recommendedRound])
    )
    const nameById = new Map(
        signupRows.map((r) => [
            r.userId,
            {
                displayName: r.preferredName ?? r.firstName,
                lastName: r.lastName
            }
        ])
    )
    const pairPickById = new Map(
        signupRows.map((r) => [r.userId, r.pairPick ?? null])
    )

    // Build pair differentials — one entry per unique pair, only for rated players
    const captainIdSet = new Set(captains.map((c) => c.userId))
    const seenPairs = new Set<string>()
    const pairDifferentials: PairDifferential[] = []

    for (const player of players) {
        const pairPickId = pairPickById.get(player.userId) ?? null
        if (!pairPickId) continue

        // Deduplicate: A→B and B→A both produce the same sorted key
        const pairKey = [player.userId, pairPickId].sort().join(":")
        if (seenPairs.has(pairKey)) continue
        seenPairs.add(pairKey)

        const pairName = nameById.get(pairPickId)
        if (!pairName) continue // pair pick not in signups for this season

        const roundA = player.recommendedRound
        const roundB = recommendedRoundById.get(pairPickId) ?? 9

        // player1 = higher-rated (lower recommendedRound), player2 = lower-rated
        // Tiebreaker: alphabetical userId
        const aIsHigher =
            roundA < roundB || (roundA === roundB && player.userId < pairPickId)
        const p1UserId = aIsHigher ? player.userId : pairPickId
        const p1Round = aIsHigher ? roundA : roundB
        const p1Name = aIsHigher
            ? { displayName: player.displayName, lastName: player.lastName }
            : pairName
        const p2UserId = aIsHigher ? pairPickId : player.userId
        const p2Round = aIsHigher ? roundB : roundA
        const p2Name = aIsHigher
            ? pairName
            : { displayName: player.displayName, lastName: player.lastName }

        // captainIsLower: the captain is the lower-rated player (player2).
        // In this edge case, the non-captain (player1, higher-rated) is pinned instead.
        const captainIsLower =
            captainIdSet.has(p2UserId) && !captainIdSet.has(p1UserId)

        pairDifferentials.push({
            player1UserId: p1UserId,
            player1DisplayName: p1Name.displayName,
            player1LastName: p1Name.lastName,
            player1Round: p1Round,
            player2UserId: p2UserId,
            player2DisplayName: p2Name.displayName,
            player2LastName: p2Name.lastName,
            player2Round: p2Round,
            captainIsLower
        })
    }

    pairDifferentials.sort((a, b) =>
        a.player1LastName.localeCompare(b.player1LastName)
    )

    // Query E — saved captain rounds
    const captainIds = captains.map((c) => c.userId)
    const savedRoundRows =
        captainIds.length > 0
            ? await db
                  .select({
                      captain: draftCaptRounds.captain,
                      round: draftCaptRounds.round
                  })
                  .from(draftCaptRounds)
                  .where(
                      and(
                          eq(draftCaptRounds.season, seasonId),
                          eq(draftCaptRounds.division, divisionId),
                          inArray(draftCaptRounds.captain, captainIds)
                      )
                  )
            : []
    const savedCaptainRounds: Record<string, number> = {}
    for (const row of savedRoundRows) {
        savedCaptainRounds[row.captain] = row.round
    }

    // Query F — saved pair diffs
    const pairPlayerIds = [
        ...new Set(
            pairDifferentials.flatMap((p) => [p.player1UserId, p.player2UserId])
        )
    ]
    const savedDiffRows =
        pairPlayerIds.length > 0
            ? await db
                  .select({
                      player1: draftPairDiffs.player1,
                      player2: draftPairDiffs.player2,
                      diff: draftPairDiffs.diff
                  })
                  .from(draftPairDiffs)
                  .where(
                      and(
                          eq(draftPairDiffs.season, seasonId),
                          eq(draftPairDiffs.division, divisionId),
                          inArray(draftPairDiffs.player1, pairPlayerIds)
                      )
                  )
            : []
    const savedPairDiffs: Record<string, number> = {}
    for (const row of savedDiffRows) {
        savedPairDiffs[`${row.player1}:${row.player2}`] = row.diff
    }

    let emailTemplate = ""
    let emailTemplateContent: LexicalEmailTemplateContent | null = null
    let emailSubject = ""

    try {
        const [template] = await db
            .select({
                content: emailTemplates.content,
                subject: emailTemplates.subject
            })
            .from(emailTemplates)
            .where(eq(emailTemplates.name, "predraft to captains"))
            .limit(1)

        if (template) {
            emailTemplateContent = normalizeEmailTemplateContent(
                template.content
            )
            emailTemplate = extractPlainTextFromEmailTemplateContent(
                template.content
            )
            emailSubject = template.subject || ""
        }
    } catch (templateError) {
        console.error(
            "Error fetching predraft to captains template:",
            templateError
        )
    }

    let consideredButUndrafted: PrepareForDraftData["consideredButUndrafted"] =
        {
            isRelevant: false,
            message:
                "This section is only relevant after the next higher division has drafted and before this division has drafted.",
            players: []
        }

    if (!currentDivisionConfig || !immediatelyHigherDivision) {
        consideredButUndrafted.message =
            "This section is not relevant for this division right now."
    } else {
        const [currentDivisionDraftRows, higherDivisionDraftRows] =
            await Promise.all([
                db
                    .select({ id: drafts.id })
                    .from(drafts)
                    .innerJoin(teams, eq(drafts.team, teams.id))
                    .where(
                        and(
                            eq(teams.season, seasonId),
                            eq(teams.division, divisionId)
                        )
                    )
                    .limit(1),
                db
                    .select({ id: drafts.id })
                    .from(drafts)
                    .innerJoin(teams, eq(drafts.team, teams.id))
                    .where(
                        and(
                            eq(teams.season, seasonId),
                            eq(teams.division, immediatelyHigherDivision.id)
                        )
                    )
                    .limit(1)
            ])

        const isCurrentDivisionDrafted = currentDivisionDraftRows.length > 0
        const isImmediatelyHigherDivisionDrafted =
            higherDivisionDraftRows.length > 0

        if (!isImmediatelyHigherDivisionDrafted) {
            consideredButUndrafted.message =
                "This section will become relevant after the next higher division has drafted."
        } else if (isCurrentDivisionDrafted) {
            consideredButUndrafted.message =
                "This section is no longer relevant because this division has already drafted."
        } else {
            const higherDivisionIds = higherDivisionRows.map((row) => row.id)
            const higherDivisionNameById = new Map(
                higherDivisionRows.map((row) => [row.id, row.name])
            )
            const pairPickById = new Map(
                signupRows.map((row) => [row.userId, row.pairPick ?? null])
            )
            const playerNameById = new Map(
                signupRows.map((row) => [
                    row.userId,
                    `${row.preferredName ?? row.firstName} ${row.lastName}`
                ])
            )

            const [higherHomeworkRows, draftedThisSeasonRows] =
                await Promise.all([
                    higherDivisionIds.length > 0
                        ? db
                              .select({
                                  userId: users.id,
                                  firstName: users.first_name,
                                  lastName: users.last_name,
                                  preferredName: users.preffered_name,
                                  divisionId: draftHomework.division
                              })
                              .from(draftHomework)
                              .innerJoin(
                                  users,
                                  eq(draftHomework.player, users.id)
                              )
                              .where(
                                  and(
                                      eq(draftHomework.season, seasonId),
                                      inArray(
                                          draftHomework.division,
                                          higherDivisionIds
                                      )
                                  )
                              )
                        : Promise.resolve([]),
                    db
                        .select({ userId: drafts.user })
                        .from(drafts)
                        .innerJoin(teams, eq(drafts.team, teams.id))
                        .where(eq(teams.season, seasonId))
                ])

            const draftedThisSeason = new Set(
                draftedThisSeasonRows.map((row) => row.userId)
            )
            const consideredMap = new Map<
                string,
                {
                    userId: string
                    displayName: string
                    lastName: string
                    pairDisplayName: string | null
                    score: number
                    consideredInDivisions: Set<string>
                    considerationCount: number
                }
            >()

            const scoreByUser = await fetchPlayerScores(
                signupRows.map((row) => row.userId),
                seasonId
            )

            for (const row of higherHomeworkRows) {
                if (draftedThisSeason.has(row.userId)) continue

                const existing = consideredMap.get(row.userId)
                const divisionName =
                    higherDivisionNameById.get(row.divisionId) ?? "Unknown"

                if (existing) {
                    existing.consideredInDivisions.add(divisionName)
                    existing.considerationCount += 1
                    continue
                }

                consideredMap.set(row.userId, {
                    userId: row.userId,
                    displayName: row.preferredName ?? row.firstName,
                    lastName: row.lastName,
                    pairDisplayName:
                        playerNameById.get(
                            pairPickById.get(row.userId) ?? ""
                        ) ?? null,
                    score: scoreByUser.get(row.userId) ?? 200,
                    consideredInDivisions: new Set([divisionName]),
                    considerationCount: 1
                })
            }

            const players = Array.from(consideredMap.values())
                .map((player) => ({
                    userId: player.userId,
                    displayName: player.displayName,
                    lastName: player.lastName,
                    pairDisplayName: player.pairDisplayName,
                    score: player.score,
                    consideredInDivisions: [...player.consideredInDivisions],
                    considerationCount: player.considerationCount
                }))
                .sort((a, b) => {
                    const considerationDiff =
                        b.considerationCount - a.considerationCount
                    if (considerationDiff !== 0) return considerationDiff
                    const scoreDiff = a.score - b.score
                    if (scoreDiff !== 0) return scoreDiff
                    const lastNameDiff = a.lastName.localeCompare(b.lastName)
                    if (lastNameDiff !== 0) return lastNameDiff
                    return a.displayName.localeCompare(b.displayName)
                })

            consideredButUndrafted = {
                isRelevant: true,
                message:
                    players.length > 0
                        ? "Players from higher-division draft homework who are still undrafted this season."
                        : "No players from higher-division draft homework remain undrafted right now.",
                players
            }
        }
    }

    return {
        status: true,
        message: "Success",
        data: {
            seasonId,
            seasonLabel,
            divisionId,
            divisionName,
            captains,
            players,
            pairDifferentials,
            availableDivisions,
            isLeagueWide,
            savedCaptainRounds,
            savedPairDiffs,
            emailTemplate,
            emailTemplateContent,
            emailSubject,
            consideredButUndrafted
        }
    }
}

export async function setCaptainRound(input: {
    captainId: string
    round: number
    divisionId: number
}): Promise<{ status: boolean; message: string }> {
    if (!(await isCommissionerBySession())) {
        return { status: false, message: "Not authorized" }
    }
    if (!Number.isInteger(input.round) || input.round < 1 || input.round > 8) {
        return { status: false, message: "Invalid round (must be 1–8)" }
    }
    if (!Number.isInteger(input.divisionId) || input.divisionId <= 0) {
        return { status: false, message: "Invalid divisionId" }
    }

    const session = await auth.api.getSession({ headers: await headers() })
    const userId = session!.user.id

    const config = await getSeasonConfig()
    const seasonId = config.seasonId!

    await db
        .insert(draftCaptRounds)
        .values({
            season: seasonId,
            division: input.divisionId,
            saved_by: userId,
            captain: input.captainId,
            round: input.round,
            updated_at: new Date()
        })
        .onConflictDoUpdate({
            target: [
                draftCaptRounds.season,
                draftCaptRounds.division,
                draftCaptRounds.captain
            ],
            set: {
                round: input.round,
                saved_by: userId,
                updated_at: new Date()
            }
        })

    return { status: true, message: "Saved" }
}

export async function setPairDiff(input: {
    player1Id: string
    player2Id: string
    diff: number
    divisionId: number
}): Promise<{ status: boolean; message: string }> {
    if (!(await isCommissionerBySession())) {
        return { status: false, message: "Not authorized" }
    }
    if (!Number.isInteger(input.diff) || input.diff < 1 || input.diff > 8) {
        return { status: false, message: "Invalid diff (must be 1–8)" }
    }
    if (!Number.isInteger(input.divisionId) || input.divisionId <= 0) {
        return { status: false, message: "Invalid divisionId" }
    }

    const session = await auth.api.getSession({ headers: await headers() })
    const userId = session!.user.id

    const config = await getSeasonConfig()
    const seasonId = config.seasonId!

    // Delete both possible orderings to handle rating-order changes from prior saves
    await db
        .delete(draftPairDiffs)
        .where(
            and(
                eq(draftPairDiffs.season, seasonId),
                eq(draftPairDiffs.division, input.divisionId),
                or(
                    and(
                        eq(draftPairDiffs.player1, input.player1Id),
                        eq(draftPairDiffs.player2, input.player2Id)
                    ),
                    and(
                        eq(draftPairDiffs.player1, input.player2Id),
                        eq(draftPairDiffs.player2, input.player1Id)
                    )
                )
            )
        )

    // Insert with player1 = higher-rated, player2 = lower-rated
    await db.insert(draftPairDiffs).values({
        season: seasonId,
        division: input.divisionId,
        saved_by: userId,
        player1: input.player1Id,
        player2: input.player2Id,
        diff: input.diff,
        updated_at: new Date()
    })

    return { status: true, message: "Saved" }
}
