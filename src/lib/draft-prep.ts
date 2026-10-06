import { isGhostCaptain } from "@/lib/ghost-captain"
import { formatDisplayName } from "@/lib/utils"

/**
 * Pure building blocks for the Draft Setup "Prepare for Draft" (rounds) page.
 *
 * The loader in `src/app/dashboard/draft-setup/rounds/data.ts` fetches the
 * rows and hands them to these functions, which turn captains' draft homework,
 * prior draft history and pair picks into the recommended-round table.
 */

export interface CaptainInfo {
    userId: string
    displayName: string
    lastName: string
    email: string
    teamId: number
}

export interface TeamInfo {
    teamId: number
    teamName: string
    teamNumber: number | null
    captain1: CaptainInfo
    captain1Completed: boolean
    captain2: CaptainInfo | null
    captain2Completed: boolean
    coachesTotal: number
    coachesCompleted: number
}

export interface PlayerRow {
    userId: string
    displayName: string
    lastName: string
    isMale: boolean
    isPairPick: boolean
    teamRounds: {
        teamId: number
        mappedRound: number
        teamCompletedHomework: boolean
    }[]
    captainAverage: number
    draftHistoryAverage: number | null
    recommendedRound: number
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

/** A season signup joined to its user, as the rounds loader reads it. */
export interface DraftPrepSignup {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    pairPick: string | null
}

export interface SeasonDivisionRow {
    id: number
    name: string
    level: number
}

/** Round given to a player a captain did not place (or placed on the wrong tab). */
const UNPLACED_ROUND = 9

/** Weights for the 3 most recent prior seasons, newest first. */
const DRAFT_HISTORY_WEIGHTS = [3, 2, 1]

/**
 * Locates the requested division among the season's divisions (ordered by
 * level) and the divisions above it. The immediately higher division is the
 * last of those, since a lower level number means a higher division.
 */
export function resolveDivisionHierarchy(
    seasonDivisionRows: SeasonDivisionRow[],
    divisionId: number
) {
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
    return {
        currentDivisionConfig,
        higherDivisionRows,
        immediatelyHigherDivision
    }
}

export interface HomeworkPick {
    round: number
    isMaleTab: boolean
}

export interface HomeworkIndex {
    /** `${captainId}:${playerId}` → that captain's first pick of the player */
    picks: Map<string, HomeworkPick>
    /** Captains whose homework row count reaches the completion threshold */
    captainsFullyCompleted: Set<string>
}

/**
 * Indexes draft homework rows. The first row per captain+player pair wins;
 * a captain counts as fully completed once their raw row count reaches
 * `completionThreshold` (homework rounds × numTeams slots in total). A
 * threshold of 0 means nobody completes.
 */
export function indexHomework(
    homeworkRows: {
        captainId: string
        playerId: string
        round: number
        isMaleTab: boolean
    }[],
    completionThreshold: number
): HomeworkIndex {
    const picks = new Map<string, HomeworkPick>()
    const captainRowCount = new Map<string, number>()
    for (const row of homeworkRows) {
        const key = `${row.captainId}:${row.playerId}`
        if (!picks.has(key)) {
            picks.set(key, {
                round: row.round,
                isMaleTab: row.isMaleTab
            })
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

    return { picks, captainsFullyCompleted }
}

export interface DraftPrepTeamRow {
    teamId: number
    teamName: string
    teamNumber: number | null
    captainId: string
    captain2Id: string | null
    c1FirstName: string
    c1LastName: string
    c1PreferredName: string | null
    c1Email: string
}

export interface Captain2User {
    firstName: string
    lastName: string
    preferredName: string | null
    email: string
}

/** Non-ghost co-captain ids that need their user row looked up. */
export function captain2IdsToLoad(teamRows: DraftPrepTeamRow[]): string[] {
    return teamRows
        .map((r) => r.captain2Id)
        .filter((id): id is string => !!id && !isGhostCaptain(id))
}

/**
 * Builds the team list and the flat captain list (captain1 then captain2 per
 * team, in team order). Ghost-captained teams are skipped, as are ghost or
 * unknown co-captains.
 */
export function buildTeamInfos(
    teamRows: DraftPrepTeamRow[],
    captain2UserMap: Map<string, Captain2User>,
    captainsFullyCompleted: Set<string>
): { teams: TeamInfo[]; captains: CaptainInfo[] } {
    const teams: TeamInfo[] = []
    const captains: CaptainInfo[] = []

    for (const r of teamRows) {
        if (isGhostCaptain(r.captainId)) continue

        const cap1: CaptainInfo = {
            userId: r.captainId,
            displayName: r.c1PreferredName ?? r.c1FirstName,
            lastName: r.c1LastName,
            email: r.c1Email,
            teamId: r.teamId
        }
        captains.push(cap1)

        let cap2: CaptainInfo | null = null
        if (r.captain2Id && !isGhostCaptain(r.captain2Id)) {
            const c2User = captain2UserMap.get(r.captain2Id)
            if (c2User) {
                cap2 = {
                    userId: r.captain2Id,
                    displayName: c2User.preferredName ?? c2User.firstName,
                    lastName: c2User.lastName,
                    email: c2User.email,
                    teamId: r.teamId
                }
                captains.push(cap2)
            }
        }

        const captain1Completed = captainsFullyCompleted.has(cap1.userId)
        const captain2Completed =
            cap2 !== null && captainsFullyCompleted.has(cap2.userId)
        const coachesTotal = cap2 ? 2 : 1
        const coachesCompleted =
            (captain1Completed ? 1 : 0) + (captain2Completed ? 1 : 0)

        teams.push({
            teamId: r.teamId,
            teamName: r.teamName,
            teamNumber: r.teamNumber,
            captain1: cap1,
            captain1Completed,
            captain2: cap2,
            captain2Completed,
            coachesTotal,
            coachesCompleted
        })
    }

    return { teams, captains }
}

/** Groups prior draft picks as userId → seasonId → draft round. */
export function groupDraftHistory(
    rows: { userId: string; seasonId: number; round: number }[]
): Map<string, Map<number, number>> {
    const draftHistMap = new Map<string, Map<number, number>>()
    for (const row of rows) {
        if (!draftHistMap.has(row.userId)) {
            draftHistMap.set(row.userId, new Map())
        }
        draftHistMap.get(row.userId)!.set(row.seasonId, row.round)
    }
    return draftHistMap
}

export interface PlayerRowContext {
    teams: TeamInfo[]
    homework: HomeworkIndex
    roundMaps: {
        male: Record<number, number>
        nonMale: Record<number, number>
    }
    /** userId → seasonId → draft round, for this division */
    draftHistory: Map<string, Map<number, number>>
    /** Up to 3 prior season ids, newest first (weighted 3, 2, 1) */
    priorSeasonIds: number[]
}

/**
 * The draft round a captain's homework implies for a player: the homework
 * round mapped through the division's round maps, or 9 when the captain did
 * not place the player on the tab matching the player's gender.
 */
function mappedRoundFor(
    ctx: PlayerRowContext,
    captainUserId: string,
    playerUserId: string,
    isMale: boolean
): number {
    const hw = ctx.homework.picks.get(`${captainUserId}:${playerUserId}`)
    if (!hw) return UNPLACED_ROUND
    if (isMale && hw.isMaleTab)
        return ctx.roundMaps.male[hw.round] ?? UNPLACED_ROUND
    if (!isMale && !hw.isMaleTab)
        return ctx.roundMaps.nonMale[hw.round] ?? UNPLACED_ROUND
    return UNPLACED_ROUND
}

/** One team's round for a player, averaging captain1 + captain2 homework. */
function teamRoundFor(
    ctx: PlayerRowContext,
    team: TeamInfo,
    playerUserId: string,
    isMale: boolean
): PlayerRow["teamRounds"][number] {
    const completed = ctx.homework.captainsFullyCompleted
    const cap1Round = mappedRoundFor(
        ctx,
        team.captain1.userId,
        playerUserId,
        isMale
    )
    const cap1Completed = completed.has(team.captain1.userId)

    if (team.captain2) {
        const cap2Round = mappedRoundFor(
            ctx,
            team.captain2.userId,
            playerUserId,
            isMale
        )
        const cap2Completed = completed.has(team.captain2.userId)
        const bothCompleted = cap1Completed && cap2Completed
        const eitherCompleted = cap1Completed || cap2Completed

        let avgRound: number
        if (cap1Completed && cap2Completed) {
            avgRound = (cap1Round + cap2Round) / 2
        } else if (cap1Completed) {
            avgRound = cap1Round
        } else if (cap2Completed) {
            avgRound = cap2Round
        } else {
            // Neither completed — use raw average
            avgRound = (cap1Round + cap2Round) / 2
        }

        return {
            teamId: team.teamId,
            mappedRound: avgRound,
            teamCompletedHomework: bothCompleted || eitherCompleted
        }
    }

    return {
        teamId: team.teamId,
        mappedRound: cap1Round,
        teamCompletedHomework: cap1Completed
    }
}

/**
 * Weighted average of a player's draft rounds over the prior seasons
 * (newest ×3, then ×2, ×1), or null with no history in the window.
 */
function weightedDraftHistoryAverage(
    ctx: PlayerRowContext,
    playerUserId: string
): number | null {
    const playerHistory = ctx.draftHistory.get(playerUserId)
    let weightedSum = 0
    let totalWeight = 0
    if (playerHistory) {
        for (let i = 0; i < ctx.priorSeasonIds.length; i++) {
            const round = playerHistory.get(ctx.priorSeasonIds[i])
            if (round !== undefined) {
                weightedSum += round * DRAFT_HISTORY_WEIGHTS[i]
                totalWeight += DRAFT_HISTORY_WEIGHTS[i]
            }
        }
    }
    return totalWeight > 0 ? weightedSum / totalWeight : null
}

function buildPlayerRow(
    ctx: PlayerRowContext,
    player: DraftPrepSignup,
    pairPickSet: Set<string>
): PlayerRow {
    const isMale = player.male === true

    const teamRounds = ctx.teams.map((team) =>
        teamRoundFor(ctx, team, player.userId, isMale)
    )

    // Only average over teams where at least one captain has fully completed their homework.
    const activeTeamRounds = teamRounds.filter((tr) => tr.teamCompletedHomework)
    const captainAverage =
        activeTeamRounds.length > 0
            ? activeTeamRounds.reduce((sum, r) => sum + r.mappedRound, 0) /
              activeTeamRounds.length
            : UNPLACED_ROUND

    const draftHistoryAverage = weightedDraftHistoryAverage(ctx, player.userId)

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
        teamRounds,
        captainAverage,
        draftHistoryAverage,
        recommendedRound
    }
}

/**
 * One row per signup that at least one team placed in its homework, sorted
 * by recommended round, then last name.
 */
export function buildPlayerRows(
    signupRows: DraftPrepSignup[],
    ctx: PlayerRowContext
): PlayerRow[] {
    // Players that have been nominated as someone's pair pick
    const pairPickSet = new Set(
        signupRows
            .map((r) => r.pairPick)
            .filter((id): id is string => id !== null)
    )

    return (
        signupRows
            .map((player) => buildPlayerRow(ctx, player, pairPickSet))
            // Only include players that at least one team placed in their homework
            .filter((p) => p.teamRounds.some((r) => r.mappedRound !== 9))
            .sort((a, b) => {
                const diff = a.recommendedRound - b.recommendedRound
                return diff !== 0 ? diff : a.lastName.localeCompare(b.lastName)
            })
    )
}

/**
 * One entry per unique pair among rated players whose pair pick signed up,
 * with the higher-rated player (lower recommended round, ties broken by
 * userId) as player1. Sorted by player1's last name.
 */
export function buildPairDifferentials(
    players: PlayerRow[],
    signupRows: DraftPrepSignup[],
    captains: CaptainInfo[]
): PairDifferential[] {
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

    return pairDifferentials
}

export interface HigherHomeworkRow {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    divisionId: number
}

/**
 * Players placed in a higher division's draft homework who have not been
 * drafted anywhere this season, one entry per player with the divisions that
 * considered them. Sorted by consideration count (desc), score, last name,
 * display name. Players without a score get 200.
 */
export function buildConsideredButUndrafted(
    higherHomeworkRows: HigherHomeworkRow[],
    {
        draftedThisSeason,
        higherDivisionRows,
        signupRows,
        scoreByUser
    }: {
        draftedThisSeason: Set<string>
        higherDivisionRows: SeasonDivisionRow[]
        signupRows: DraftPrepSignup[]
        scoreByUser: Map<string, number>
    }
): ConsideredButUndraftedPlayer[] {
    const higherDivisionNameById = new Map(
        higherDivisionRows.map((row) => [row.id, row.name])
    )
    const pairPickById = new Map(
        signupRows.map((row) => [row.userId, row.pairPick ?? null])
    )
    const playerNameById = new Map(
        signupRows.map((row) => [
            row.userId,
            formatDisplayName(row.firstName, row.lastName, row.preferredName)
        ])
    )

    const consideredMap = new Map<
        string,
        Omit<ConsideredButUndraftedPlayer, "consideredInDivisions"> & {
            consideredInDivisions: Set<string>
        }
    >()

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
                playerNameById.get(pairPickById.get(row.userId) ?? "") ?? null,
            score: scoreByUser.get(row.userId) ?? 200,
            consideredInDivisions: new Set([divisionName]),
            considerationCount: 1
        })
    }

    return Array.from(consideredMap.values())
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
}
