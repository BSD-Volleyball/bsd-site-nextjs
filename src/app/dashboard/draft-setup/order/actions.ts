"use server"

import type { ActionResult } from "@/lib/action-helpers"
import { withAction, ok, fail } from "@/lib/action-helpers"
import { db } from "@/database/db"
import {
    users,
    teams,
    divisions,
    individual_divisions,
    draftCaptRounds,
    draftPairDiffs,
    signups
} from "@/database/schema"
import { eq, and, sql, inArray } from "drizzle-orm"
import { getIsCommissioner } from "@/app/dashboard/access-actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { getSeasonConfig } from "@/lib/site-config"
import {
    commissionerCanWriteDivision,
    getCommissionerDivisionScope
} from "@/lib/rbac"
import { getDraftSetupStatus } from "@/lib/draft-setup"
import { logAuditEntry } from "@/lib/audit-log"
import { isGhostCaptain, getGhostDisplayName } from "@/lib/ghost-captain"
import { formatDisplayName } from "@/lib/utils"

export interface CaptainRow {
    teamId: number
    teamName: string
    teamNumber: number | null
    captainId: string
    captainName: string
}

export interface DivisionData {
    divisionId: number
    divisionName: string
    captains: CaptainRow[]
}

export interface DraftDayData {
    status: boolean
    message?: string
    seasonLabel: string
    divisions: DivisionData[]
    commissionerDivisionId: number | null
}

export async function getDraftDayData(
    divisionId?: number
): Promise<DraftDayData> {
    const hasAccess = await getIsCommissioner()

    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            seasonLabel: "",
            divisions: [],
            commissionerDivisionId: null
        }
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return {
                status: false,
                message: "No active season found.",
                seasonLabel: "",
                divisions: [],
                commissionerDivisionId: null
            }
        }

        const seasonId = config.seasonId
        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

        const session = await auth.api.getSession({ headers: await headers() })
        if (!session?.user) {
            return {
                status: false,
                message: "Unauthorized",
                seasonLabel: "",
                divisions: [],
                commissionerDivisionId: null
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
                divisions: [],
                commissionerDivisionId: null
            }
        }

        const commissionerDivisionId =
            divisionAccess.type === "division_specific" &&
            divisionAccess.divisionIds.length === 1
                ? divisionAccess.divisionIds[0]
                : null
        const allowedDivisionIds =
            divisionAccess.type === "division_specific"
                ? divisionAccess.divisionIds
                : null
        const targetDivisionId =
            divisionId !== undefined &&
            (allowedDivisionIds === null ||
                allowedDivisionIds.includes(divisionId))
                ? divisionId
                : undefined

        const rows = await db
            .select({
                teamId: teams.id,
                teamName: teams.name,
                teamNumber: teams.number,
                captainId: teams.captain,
                divisionId: divisions.id,
                divisionName: divisions.name,
                divisionLevel: divisions.level,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name
            })
            .from(teams)
            .innerJoin(divisions, eq(teams.division, divisions.id))
            .innerJoin(users, eq(teams.captain, users.id))
            .where(
                and(
                    eq(teams.season, seasonId),
                    allowedDivisionIds !== null
                        ? inArray(teams.division, allowedDivisionIds)
                        : undefined,
                    targetDivisionId !== undefined
                        ? eq(teams.division, targetDivisionId)
                        : undefined
                )
            )
            .orderBy(divisions.level, sql`${teams.number} asc nulls last`)

        // Group by division
        const divisionMap = new Map<
            number,
            {
                divisionName: string
                divisionLevel: number
                captains: CaptainRow[]
            }
        >()

        for (const row of rows) {
            const existing = divisionMap.get(row.divisionId)
            const captainName = formatDisplayName(
                row.firstName,
                row.lastName,
                row.preferredName
            )
            const captainRow: CaptainRow = {
                teamId: row.teamId,
                teamName: row.teamName,
                teamNumber: row.teamNumber,
                captainId: row.captainId,
                captainName
            }
            if (!existing) {
                divisionMap.set(row.divisionId, {
                    divisionName: row.divisionName,
                    divisionLevel: row.divisionLevel,
                    captains: [captainRow]
                })
            } else {
                existing.captains.push(captainRow)
            }
        }

        // Assign ghost display names per-division (Ghost vs Ghost 1/Ghost 2)
        for (const div of divisionMap.values()) {
            const ghostIndices = div.captains
                .map((c, i) => (isGhostCaptain(c.captainId) ? i : -1))
                .filter((i) => i !== -1)
            const totalGhosts = ghostIndices.length
            ghostIndices.forEach((idx, ghostIdx) => {
                div.captains[idx].captainName = getGhostDisplayName(
                    ghostIdx,
                    totalGhosts
                )
            })
        }

        const divisionList: DivisionData[] = [...divisionMap.entries()]
            .sort((a, b) => a[1].divisionLevel - b[1].divisionLevel)
            .map(([divId, div]) => ({
                divisionId: divId,
                divisionName: div.divisionName,
                captains: div.captains
            }))

        return {
            status: true,
            seasonLabel,
            divisions: divisionList,
            commissionerDivisionId
        }
    } catch (error) {
        console.error("Error fetching draft day data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            seasonLabel: "",
            divisions: [],
            commissionerDivisionId: null
        }
    }
}

/**
 * Step 2 save + lock. Writes `teams.number` for every team in the division
 * and stamps `draft_order_locked_at/by`. Gated on Step 1 being locked so the
 * order can never be "done" while captains are unseated.
 */
export const saveDraftOrder = withAction(
    async (
        divisionId: number,
        assignments: { teamId: number; number: number }[]
    ): Promise<ActionResult> => {
        const hasAccess = await getIsCommissioner()

        if (!hasAccess) {
            return fail("Unauthorized")
        }
        if (!Number.isInteger(divisionId) || divisionId <= 0) {
            return fail("Invalid divisionId")
        }

        try {
            const config = await getSeasonConfig()

            if (!config.seasonId) {
                return fail("No active season found.")
            }

            const seasonId = config.seasonId

            const session = await auth.api.getSession({
                headers: await headers()
            })
            if (!session?.user) {
                return fail("Unauthorized")
            }

            if (
                !(await commissionerCanWriteDivision(
                    session.user.id,
                    seasonId,
                    divisionId
                ))
            ) {
                return fail("You don't have permission for this division.")
            }

            const setup = await getDraftSetupStatus(seasonId, divisionId)
            if (setup.rounds.state !== "locked") {
                return fail(
                    "Step 1 (seat the captains) must be locked before the draft order."
                )
            }

            // Every team in the division must be assigned exactly one
            // number 1..n — a partial order would leave stale numbers behind.
            const divisionTeams = await db
                .select({ id: teams.id })
                .from(teams)
                .where(
                    and(
                        eq(teams.season, seasonId),
                        eq(teams.division, divisionId)
                    )
                )
            const expectedIds = new Set(divisionTeams.map((t) => t.id))
            const seenIds = new Set<number>()
            const seenNumbers = new Set<number>()
            for (const a of assignments) {
                if (!expectedIds.has(a.teamId) || seenIds.has(a.teamId)) {
                    return fail("One or more teams are not in this division.")
                }
                if (
                    !Number.isInteger(a.number) ||
                    a.number < 1 ||
                    a.number > expectedIds.size ||
                    seenNumbers.has(a.number)
                ) {
                    return fail("Draft order numbers must be unique 1..n.")
                }
                seenIds.add(a.teamId)
                seenNumbers.add(a.number)
            }
            if (seenIds.size !== expectedIds.size) {
                return fail("Every team in the division must be ordered.")
            }

            const now = new Date()
            await db.transaction(async (tx) => {
                for (const assignment of assignments) {
                    await tx
                        .update(teams)
                        .set({ number: assignment.number })
                        .where(eq(teams.id, assignment.teamId))
                }
                await tx
                    .update(individual_divisions)
                    .set({
                        draft_order_locked_at: now,
                        draft_order_locked_by: session.user.id
                    })
                    .where(
                        and(
                            eq(individual_divisions.season, seasonId),
                            eq(individual_divisions.division, divisionId)
                        )
                    )
            })

            await logAuditEntry({
                userId: session.user.id,
                action: "lock_draft_order",
                entityType: "teams",
                summary: `Locked draft order for ${assignments.length} teams (division ${divisionId}, season ${seasonId})`
            })

            return ok(undefined, "Draft order locked.")
        } catch (error) {
            console.error("Error saving draft order:", error)
            return fail("Something went wrong.")
        }
    }
)

export interface PickEntry {
    round: number
    playerName: string
    isCaptain: boolean
    oldId: number | null
    isMale: boolean | null
}

export interface TeamSheetData {
    teamId: number
    teamNumber: number | null
    teamName: string
    captainName: string
    captainOldId: number | null
    captainIsMale: boolean | null
    additionalCoaches: { name: string; oldId: number | null }[]
    picks: PickEntry[]
}

export interface DivisionSheetData {
    divisionId: number
    divisionName: string
    nonMaleCount: number
    teamCount: number
    isCoaches: boolean
    teams: TeamSheetData[]
}

export interface DraftSheetPayload {
    status: boolean
    message?: string
    seasonLabel: string
    divisions: DivisionSheetData[]
}

export async function getDraftSheetData(
    divisionId?: number
): Promise<DraftSheetPayload> {
    const hasAccess = await getIsCommissioner()
    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            seasonLabel: "",
            divisions: []
        }
    }

    try {
        const config = await getSeasonConfig()
        if (!config.seasonId) {
            return {
                status: false,
                message: "No active season found.",
                seasonLabel: "",
                divisions: []
            }
        }

        const seasonId = config.seasonId
        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

        const session = await auth.api.getSession({ headers: await headers() })
        if (!session?.user) {
            return {
                status: false,
                message: "Unauthorized",
                seasonLabel: "",
                divisions: []
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
                divisions: []
            }
        }

        const allowedDivisionIds =
            divisionAccess.type === "division_specific"
                ? divisionAccess.divisionIds
                : null
        const targetDivisionId =
            divisionId !== undefined &&
            (allowedDivisionIds === null ||
                allowedDivisionIds.includes(divisionId))
                ? divisionId
                : undefined

        // Fetch teams with captain and division info
        const teamRows = await db
            .select({
                teamId: teams.id,
                teamName: teams.name,
                teamNumber: teams.number,
                captainId: teams.captain,
                divisionId: divisions.id,
                divisionName: divisions.name,
                divisionLevel: divisions.level,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                captainOldId: users.old_id,
                captainIsMale: users.male
            })
            .from(teams)
            .innerJoin(divisions, eq(teams.division, divisions.id))
            .innerJoin(users, eq(teams.captain, users.id))
            .where(
                and(
                    eq(teams.season, seasonId),
                    allowedDivisionIds !== null
                        ? inArray(teams.division, allowedDivisionIds)
                        : undefined,
                    targetDivisionId !== undefined
                        ? eq(teams.division, targetDivisionId)
                        : undefined
                )
            )
            .orderBy(divisions.level, sql`${teams.number} asc nulls last`)

        const divisionIds = [...new Set(teamRows.map((r) => r.divisionId))]

        // Fetch supporting data in parallel
        const [indDivRows, captRoundRows, pairDiffRows, signupPairRows] =
            await Promise.all([
                db
                    .select({
                        divisionId: individual_divisions.division,
                        genderSplit: individual_divisions.gender_split,
                        teamCount: individual_divisions.teams,
                        isCoaches: individual_divisions.coaches
                    })
                    .from(individual_divisions)
                    .where(
                        and(
                            eq(individual_divisions.season, seasonId),
                            divisionIds.length > 0
                                ? inArray(
                                      individual_divisions.division,
                                      divisionIds
                                  )
                                : undefined
                        )
                    ),
                db
                    .select({
                        captain: draftCaptRounds.captain,
                        round: draftCaptRounds.round,
                        divisionId: draftCaptRounds.division
                    })
                    .from(draftCaptRounds)
                    .where(
                        and(
                            eq(draftCaptRounds.season, seasonId),
                            divisionIds.length > 0
                                ? inArray(draftCaptRounds.division, divisionIds)
                                : undefined
                        )
                    ),
                db
                    .select({
                        player1: draftPairDiffs.player1,
                        player2: draftPairDiffs.player2,
                        diff: draftPairDiffs.diff,
                        divisionId: draftPairDiffs.division
                    })
                    .from(draftPairDiffs)
                    .where(
                        and(
                            eq(draftPairDiffs.season, seasonId),
                            divisionIds.length > 0
                                ? inArray(draftPairDiffs.division, divisionIds)
                                : undefined
                        )
                    ),
                db
                    .select({
                        player: signups.player,
                        pairPick: signups.pair_pick
                    })
                    .from(signups)
                    .where(
                        and(
                            eq(signups.season, seasonId),
                            eq(signups.pair, true)
                        )
                    )
            ])

        // Build lookup maps
        const indDivMap = new Map(
            indDivRows.map((r) => [
                r.divisionId,
                {
                    genderSplit: r.genderSplit,
                    teamCount: r.teamCount,
                    isCoaches: r.isCoaches
                }
            ])
        )
        const captRoundMap = new Map(
            captRoundRows.map((r) => [r.captain, r.round])
        )
        const pairPickMap = new Map<string, string>()
        for (const s of signupPairRows) {
            if (s.pairPick !== null) pairPickMap.set(s.player, s.pairPick)
        }
        const pairDiffMap = new Map<
            string,
            { round: number; higherPlayer: string }
        >()
        for (const pd of pairDiffRows) {
            const info = { round: pd.diff, higherPlayer: pd.player1 }
            pairDiffMap.set(`${pd.player1}:${pd.player2}`, info)
            pairDiffMap.set(`${pd.player2}:${pd.player1}`, info)
        }

        // Collect all pair player IDs so we can batch-fetch their names
        const pairPlayerIds = new Set<string>()
        for (const row of teamRows) {
            const pairId = pairPickMap.get(row.captainId)
            if (pairId && pairId !== row.captainId) pairPlayerIds.add(pairId)
        }

        const pairUserRows =
            pairPlayerIds.size > 0
                ? await db
                      .select({
                          id: users.id,
                          firstName: users.first_name,
                          lastName: users.last_name,
                          preferredName: users.preferred_name,
                          oldId: users.old_id,
                          isMale: users.male
                      })
                      .from(users)
                      .where(inArray(users.id, [...pairPlayerIds]))
                : []

        const pairInfoMap = new Map(
            pairUserRows.map((u) => [
                u.id,
                {
                    name: formatDisplayName(
                        u.firstName,
                        u.lastName,
                        u.preferredName
                    ),
                    oldId: u.oldId,
                    isMale: u.isMale
                }
            ])
        )

        const DRAFT_ROUNDS = 8

        // Group teams by division; for coaches divisions, merge rows sharing the same teamNumber
        const divisionMap = new Map<
            number,
            {
                divisionName: string
                divisionLevel: number
                teams: TeamSheetData[]
            }
        >()
        // key: "divisionId:teamName" → index in teams array (coaches dedup)
        const coachTeamIndex = new Map<string, number>()
        // Track ghost indices per division for naming
        const divisionGhostTeamIndices = new Map<number, number[]>()

        for (const row of teamRows) {
            const captainName = formatDisplayName(
                row.firstName,
                row.lastName,
                row.preferredName
            )

            const divIsCoaches =
                indDivMap.get(row.divisionId)?.isCoaches ?? false

            // For coaches divisions, merge rows sharing the same team name
            if (divIsCoaches) {
                const key = `${row.divisionId}:${row.teamName}`
                const existingIdx = coachTeamIndex.get(key)
                if (existingIdx !== undefined) {
                    const divEntry = divisionMap.get(row.divisionId)
                    if (divEntry) {
                        divEntry.teams[existingIdx].additionalCoaches.push({
                            name: captainName,
                            oldId: row.captainOldId
                        })
                    }
                    continue
                }
            }

            const picks: PickEntry[] = []
            const captainRound = !divIsCoaches
                ? captRoundMap.get(row.captainId)
                : undefined
            if (captainRound) {
                picks.push({
                    round: captainRound,
                    playerName: captainName,
                    isCaptain: true,
                    oldId: row.captainOldId,
                    isMale: row.captainIsMale
                })

                const pairId = pairPickMap.get(row.captainId)
                if (pairId && pairId !== row.captainId) {
                    const key = `${row.captainId}:${pairId}`
                    const pinnedRound =
                        pairDiffMap.get(key)?.round ?? DRAFT_ROUNDS
                    const pairRound =
                        pinnedRound === captainRound
                            ? captainRound < DRAFT_ROUNDS
                                ? captainRound + 1
                                : captainRound - 1
                            : pinnedRound
                    const pairInfo = pairInfoMap.get(pairId)
                    if (pairInfo?.name) {
                        picks.push({
                            round: pairRound,
                            playerName: pairInfo.name,
                            isCaptain: false,
                            oldId: pairInfo.oldId,
                            isMale: pairInfo.isMale
                        })
                    }
                }
            }

            const ghostCaptain = isGhostCaptain(row.captainId)
            const teamData: TeamSheetData = {
                teamId: row.teamId,
                teamNumber: row.teamNumber,
                teamName: row.teamName,
                // captainName placeholder — ghost names resolved after grouping
                captainName: ghostCaptain ? "" : captainName,
                captainOldId: ghostCaptain ? null : row.captainOldId,
                captainIsMale: ghostCaptain ? null : row.captainIsMale,
                additionalCoaches: [],
                picks
            }

            const existing = divisionMap.get(row.divisionId)
            if (!existing) {
                divisionMap.set(row.divisionId, {
                    divisionName: row.divisionName,
                    divisionLevel: row.divisionLevel,
                    teams: [teamData]
                })
                if (divIsCoaches) {
                    coachTeamIndex.set(`${row.divisionId}:${row.teamName}`, 0)
                }
                if (ghostCaptain) {
                    divisionGhostTeamIndices.set(row.divisionId, [0])
                }
            } else {
                const idx = existing.teams.length
                existing.teams.push(teamData)
                if (divIsCoaches) {
                    coachTeamIndex.set(`${row.divisionId}:${row.teamName}`, idx)
                }
                if (ghostCaptain) {
                    const ghostList =
                        divisionGhostTeamIndices.get(row.divisionId) ?? []
                    ghostList.push(idx)
                    divisionGhostTeamIndices.set(row.divisionId, ghostList)
                }
            }
        }

        // Assign ghost captain display names per-division
        for (const [divId, ghostIndices] of divisionGhostTeamIndices) {
            const div = divisionMap.get(divId)
            if (!div) continue
            const totalGhosts = ghostIndices.length
            ghostIndices.forEach((idx, ghostIdx) => {
                div.teams[idx].captainName = getGhostDisplayName(
                    ghostIdx,
                    totalGhosts
                )
            })
        }

        const divisionList: DivisionSheetData[] = [...divisionMap.entries()]
            .sort((a, b) => a[1].divisionLevel - b[1].divisionLevel)
            .map(([divId, div]) => {
                const indDiv = indDivMap.get(divId)
                const genderSplit = indDiv?.genderSplit ?? ""
                const parts = genderSplit.split("-")
                const nonMaleCount =
                    parts.length >= 2 ? parseInt(parts[1], 10) || 0 : 0
                return {
                    divisionId: divId,
                    divisionName: div.divisionName,
                    nonMaleCount,
                    teamCount: indDiv?.teamCount ?? div.teams.length,
                    isCoaches: indDiv?.isCoaches ?? false,
                    teams: div.teams
                }
            })

        return { status: true, seasonLabel, divisions: divisionList }
    } catch (error) {
        console.error("Error fetching draft sheet data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            seasonLabel: "",
            divisions: []
        }
    }
}
