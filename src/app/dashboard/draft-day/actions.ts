"use server"

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
import { getIsCommissioner } from "@/app/dashboard/actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { getSeasonConfig } from "@/lib/site-config"
import { getCommissionerDivisionScope } from "@/lib/rbac"
import { logAuditEntry } from "@/lib/audit-log"
import { isGhostCaptain, getGhostDisplayName } from "@/lib/ghost-captain"

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
            const captainName =
                `${row.preferredName || row.firstName} ${row.lastName}`.trim()
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

export async function saveDraftOrder(
    assignments: { teamId: number; number: number }[]
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await getIsCommissioner()

    if (!hasAccess) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return { status: false, message: "No active season found." }
        }

        const seasonId = config.seasonId

        const session = await auth.api.getSession({ headers: await headers() })
        if (!session?.user) {
            return { status: false, message: "Unauthorized" }
        }

        const divisionAccess = await getCommissionerDivisionScope(
            session.user.id,
            seasonId
        )

        if (divisionAccess.type === "denied") {
            return { status: false, message: "Unauthorized" }
        }

        // Security: validate all teamIds belong to accessible divisions for this season
        const teamIds = assignments.map((a) => a.teamId)

        const validTeams = await db
            .select({ id: teams.id })
            .from(teams)
            .where(
                and(
                    eq(teams.season, seasonId),
                    inArray(teams.id, teamIds),
                    divisionAccess.type === "division_specific"
                        ? inArray(teams.division, divisionAccess.divisionIds)
                        : undefined
                )
            )

        const validTeamIds = new Set(validTeams.map((t) => t.id))

        for (const assignment of assignments) {
            if (!validTeamIds.has(assignment.teamId)) {
                return {
                    status: false,
                    message: "One or more teams are not accessible."
                }
            }
        }

        // Update each team's draft number
        for (const assignment of assignments) {
            await db
                .update(teams)
                .set({ number: assignment.number })
                .where(eq(teams.id, assignment.teamId))
        }

        await logAuditEntry({
            userId: session.user.id,
            action: "update",
            entityType: "teams",
            summary: `Saved draft order for ${assignments.length} teams in season ${seasonId}`
        })

        return { status: true, message: "Draft order saved successfully." }
    } catch (error) {
        console.error("Error saving draft order:", error)
        return { status: false, message: "Something went wrong." }
    }
}

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
                    name: `${u.preferredName || u.firstName} ${u.lastName}`.trim(),
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
            const captainName =
                `${row.preferredName || row.firstName} ${row.lastName}`.trim()

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
                    parts.length >= 2 ? parseInt(parts[1]) || 0 : 0
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
