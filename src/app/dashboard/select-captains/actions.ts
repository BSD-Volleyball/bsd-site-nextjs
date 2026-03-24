"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    users,
    divisions,
    individual_divisions,
    teams,
    signups,
    emailTemplates,
    commissioners
} from "@/database/schema"
import { eq, and, inArray, asc, ne } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import { getIsCommissioner } from "@/app/dashboard/actions"
import { getSeasonConfig, type SeasonConfig } from "@/lib/site-config"
import {
    getCommissionerDivisionAccess,
    grantRole,
    revokeRole
} from "@/lib/rbac"
import {
    type LexicalEmailTemplateContent,
    extractPlainTextFromEmailTemplateContent,
    normalizeEmailTemplateContent
} from "@/lib/email-template-content"
import { GHOST_CAPTAIN_ID, isGhostCaptain } from "@/lib/ghost-captain"

export interface DivisionOption {
    id: number
    name: string
    level: number
    gender_split: string | null
    coaches: boolean
}

export interface ExistingTeam {
    id: number
    number: number
    captainId: string
    captain2Id: string | null
    teamName: string
}

export interface DivisionCommissioner {
    divisionId: number
    userId: string
    name: string
}

export interface UserOption {
    id: string
    old_id: number | null
    first_name: string
    last_name: string
    preferred_name: string | null
    email: string
}

export async function getCreateTeamsData(): Promise<{
    status: boolean
    message?: string
    seasonId: number
    seasonLabel: string
    divisions: DivisionOption[]
    users: UserOption[]
    allUsers: UserOption[]
    emailTemplate: string
    emailTemplateContent: LexicalEmailTemplateContent | null
    emailSubject: string
    seasonConfig: SeasonConfig | null
    divisionCommissioners: DivisionCommissioner[]
    existingTeamsByDivision: Record<number, ExistingTeam[]>
}> {
    const hasAccess = await getIsCommissioner()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            seasonId: 0,
            seasonLabel: "",
            divisions: [],
            users: [],
            allUsers: [],
            emailTemplate: "",
            emailTemplateContent: null,
            emailSubject: "",
            seasonConfig: null,
            divisionCommissioners: [],
            existingTeamsByDivision: {}
        }
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return {
                status: false,
                message: "No current season found.",
                seasonId: 0,
                seasonLabel: "",
                divisions: [],
                users: [],
                allUsers: [],
                emailTemplate: "",
                emailTemplateContent: null,
                emailSubject: "",
                seasonConfig: null,
                divisionCommissioners: [],
                existingTeamsByDivision: {}
            }
        }

        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

        const session = await auth.api.getSession({ headers: await headers() })
        if (!session?.user) {
            return {
                status: false,
                message: "Not authenticated.",
                seasonId: 0,
                seasonLabel: "",
                divisions: [],
                users: [],
                allUsers: [],
                emailTemplate: "",
                emailTemplateContent: null,
                emailSubject: "",
                seasonConfig: null,
                divisionCommissioners: [],
                existingTeamsByDivision: {}
            }
        }

        const divisionAccess = await getCommissionerDivisionAccess(
            session.user.id,
            config.seasonId
        )
        if (divisionAccess.type === "denied") {
            return {
                status: false,
                message: "You don't have permission to access this page.",
                seasonId: 0,
                seasonLabel: "",
                divisions: [],
                users: [],
                allUsers: [],
                emailTemplate: "",
                emailTemplateContent: null,
                emailSubject: "",
                seasonConfig: null,
                divisionCommissioners: [],
                existingTeamsByDivision: {}
            }
        }

        const [
            allDivisions,
            signedUpUsers,
            allUsersRows,
            commissionerRows,
            existingTeamRows
        ] = await Promise.all([
            db
                .select({
                    id: divisions.id,
                    name: divisions.name,
                    level: divisions.level,
                    gender_split: individual_divisions.gender_split,
                    coaches: individual_divisions.coaches
                })
                .from(divisions)
                .leftJoin(
                    individual_divisions,
                    and(
                        eq(individual_divisions.division, divisions.id),
                        eq(individual_divisions.season, config.seasonId)
                    )
                )
                .where(
                    divisionAccess.type === "division_specific"
                        ? and(
                              eq(divisions.active, true),
                              eq(divisions.id, divisionAccess.divisionId)
                          )
                        : eq(divisions.active, true)
                )
                .orderBy(divisions.level)
                .then((rows) =>
                    rows.map((d) => ({ ...d, coaches: d.coaches ?? false }))
                ),
            db
                .selectDistinct({
                    id: users.id,
                    old_id: users.old_id,
                    first_name: users.first_name,
                    last_name: users.last_name,
                    preferred_name: users.preferred_name,
                    email: users.email
                })
                .from(signups)
                .innerJoin(users, eq(signups.player, users.id))
                .where(eq(signups.season, config.seasonId))
                .orderBy(users.last_name, users.first_name),
            db
                .select({
                    id: users.id,
                    old_id: users.old_id,
                    first_name: users.first_name,
                    last_name: users.last_name,
                    preferred_name: users.preferred_name,
                    email: users.email
                })
                .from(users)
                .where(ne(users.id, GHOST_CAPTAIN_ID))
                .orderBy(users.last_name, users.first_name),
            db
                .select({
                    divisionId: commissioners.division,
                    userId: commissioners.commissioner,
                    firstName: users.first_name,
                    preferredName: users.preferred_name
                })
                .from(commissioners)
                .innerJoin(users, eq(commissioners.commissioner, users.id))
                .where(eq(commissioners.season, config.seasonId)),
            db
                .select({
                    id: teams.id,
                    number: teams.number,
                    captain: teams.captain,
                    captain2: teams.captain2,
                    name: teams.name,
                    division: teams.division
                })
                .from(teams)
                .where(eq(teams.season, config.seasonId))
                .orderBy(teams.number)
        ])

        const divisionCommissioners: DivisionCommissioner[] =
            commissionerRows.map((row) => ({
                divisionId: row.divisionId,
                userId: row.userId,
                name: row.preferredName || row.firstName
            }))

        const existingTeamsByDivision: Record<number, ExistingTeam[]> = {}
        for (const team of existingTeamRows) {
            if (!existingTeamsByDivision[team.division]) {
                existingTeamsByDivision[team.division] = []
            }
            existingTeamsByDivision[team.division].push({
                id: team.id,
                number: team.number ?? 0,
                captainId: team.captain,
                captain2Id: team.captain2,
                teamName: team.name
            })
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
                .where(eq(emailTemplates.name, "captains selected"))
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
                "Error fetching captains selected template:",
                templateError
            )
        }

        return {
            status: true,
            seasonId: config.seasonId,
            seasonLabel,
            divisions: allDivisions,
            users: signedUpUsers,
            allUsers: allUsersRows,
            emailTemplate,
            emailTemplateContent,
            emailSubject,
            seasonConfig: config,
            divisionCommissioners,
            existingTeamsByDivision
        }
    } catch (error) {
        console.error("Error fetching create teams data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            seasonId: 0,
            seasonLabel: "",
            divisions: [],
            users: [],
            allUsers: [],
            emailTemplate: "",
            emailTemplateContent: null,
            emailSubject: "",
            seasonConfig: null,
            divisionCommissioners: [],
            existingTeamsByDivision: {}
        }
    }
}

interface TeamToCreate {
    captainId: string
    coach2Id?: string
    teamName: string
}

export async function createTeams(
    divisionId: number,
    teamsToCreate: TeamToCreate[]
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await getIsCommissioner()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to perform this action."
        }
    }

    if (!divisionId) {
        return {
            status: false,
            message: "Please select a division."
        }
    }

    if (teamsToCreate.length === 0) {
        return {
            status: false,
            message: "Please select at least one captain."
        }
    }

    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return {
            status: false,
            message: "No current season found."
        }
    }

    const [selectedDivision] = await db
        .select({ id: divisions.id, name: divisions.name })
        .from(divisions)
        .where(eq(divisions.id, divisionId))
        .limit(1)

    if (!selectedDivision) {
        return {
            status: false,
            message: "Invalid division selected."
        }
    }

    const numTeams = selectedDivision.name.trim().toUpperCase() === "BB" ? 4 : 6

    // Look up whether this division uses coaches mode
    const [indivDiv] = await db
        .select({ coaches: individual_divisions.coaches })
        .from(individual_divisions)
        .where(
            and(
                eq(individual_divisions.season, config.seasonId),
                eq(individual_divisions.division, divisionId)
            )
        )
        .limit(1)

    const isCoachesDiv = indivDiv?.coaches ?? false

    if (!isCoachesDiv) {
        // Strict validation for standard captain mode
        if (teamsToCreate.length !== numTeams) {
            return {
                status: false,
                message: `Division ${selectedDivision.name} requires ${numTeams} teams.`
            }
        }

        for (let i = 0; i < teamsToCreate.length; i++) {
            const team = teamsToCreate[i]
            if (!team.teamName.trim()) {
                return {
                    status: false,
                    message: `Please enter a name for team ${i + 1}.`
                }
            }
        }

        // Only enforce uniqueness and signup checks for real (non-ghost) captains
        const allCaptainIds = teamsToCreate
            .flatMap((t) => [t.captainId || GHOST_CAPTAIN_ID, t.coach2Id ?? ""])
            .filter((id) => id && !isGhostCaptain(id))
        const uniqueAllCaptainIds = new Set(allCaptainIds)

        if (uniqueAllCaptainIds.size !== allCaptainIds.length) {
            return {
                status: false,
                message: "Each captain must be unique across all teams."
            }
        }

        const realPrimaryCaptainIds = teamsToCreate
            .map((team) => team.captainId || GHOST_CAPTAIN_ID)
            .filter((id) => !isGhostCaptain(id))
        const uniqueRealPrimaryCaptainIds = new Set(realPrimaryCaptainIds)

        if (uniqueRealPrimaryCaptainIds.size > 0) {
            const signedUpCaptains = await db
                .select({ playerId: signups.player })
                .from(signups)
                .where(
                    and(
                        eq(signups.season, config.seasonId),
                        inArray(signups.player, [
                            ...uniqueRealPrimaryCaptainIds
                        ])
                    )
                )

            if (signedUpCaptains.length !== uniqueRealPrimaryCaptainIds.size) {
                return {
                    status: false,
                    message:
                        "All selected primary captains must be signed up for the current season."
                }
            }
        }
    } else {
        // Lenient validation for coaches mode — partial saves are allowed
        for (let i = 0; i < teamsToCreate.length; i++) {
            const team = teamsToCreate[i]
            const hasAnyCoach = team.captainId || team.coach2Id
            if (hasAnyCoach && !team.teamName.trim()) {
                return {
                    status: false,
                    message: `Please enter a name for team ${i + 1}.`
                }
            }
        }

        const allCoachIds = teamsToCreate.flatMap((t) =>
            [t.captainId, t.coach2Id ?? ""].filter(Boolean)
        )
        const uniqueCoachIds = new Set(allCoachIds)

        if (uniqueCoachIds.size !== allCoachIds.length) {
            return {
                status: false,
                message: "Each coach must be unique across all teams."
            }
        }

        // Coaches are drawn from the full user population — no sign-up check needed
    }

    try {
        // Fetch existing teams for this division+season to support upsert
        const existingTeams = await db
            .select({
                id: teams.id,
                number: teams.number,
                captain: teams.captain,
                captain2: teams.captain2
            })
            .from(teams)
            .where(
                and(
                    eq(teams.season, config.seasonId),
                    eq(teams.division, divisionId)
                )
            )
            .orderBy(asc(teams.number))

        const oldCaptainIds = new Set<string>(
            existingTeams
                .flatMap((t) => [t.captain, t.captain2 ?? ""])
                .filter((id): id is string => !!id && !isGhostCaptain(id))
        )

        const existingByNumber = new Map<number, number>()
        for (const team of existingTeams) {
            if (team.number !== null) {
                existingByNumber.set(team.number, team.id)
            }
        }

        // Unified storage: all divisions use captain2 column instead of duplicate rows
        for (let i = 0; i < teamsToCreate.length; i++) {
            const team = teamsToCreate[i]
            const number = i + 1

            if (isCoachesDiv) {
                // Coaches mode: both coaches optional, skip team if neither is set
                const hasAnyCoach = team.captainId || team.coach2Id
                if (!hasAnyCoach) continue

                const existingId = existingByNumber.get(number)
                if (existingId !== undefined) {
                    await db
                        .update(teams)
                        .set({
                            captain: team.captainId || GHOST_CAPTAIN_ID,
                            captain2: team.coach2Id || null,
                            name: team.teamName.trim()
                        })
                        .where(eq(teams.id, existingId))
                    existingByNumber.delete(number)
                } else {
                    await db.insert(teams).values({
                        season: config.seasonId,
                        captain: team.captainId || GHOST_CAPTAIN_ID,
                        captain2: team.coach2Id || null,
                        division: divisionId,
                        name: team.teamName.trim(),
                        number
                    })
                }
            } else {
                // Standard captain mode
                const existingId = existingByNumber.get(number)
                const captainId = team.captainId || GHOST_CAPTAIN_ID

                if (existingId !== undefined) {
                    await db
                        .update(teams)
                        .set({
                            captain: captainId,
                            captain2: team.coach2Id || null,
                            name: team.teamName.trim()
                        })
                        .where(eq(teams.id, existingId))
                    existingByNumber.delete(number)
                } else {
                    await db.insert(teams).values({
                        season: config.seasonId,
                        captain: captainId,
                        captain2: team.coach2Id || null,
                        division: divisionId,
                        name: team.teamName.trim(),
                        number
                    })
                }
            }
        }

        // Delete any stale teams (slots no longer filled)
        const staleIds = [...existingByNumber.values()]
        if (staleIds.length > 0) {
            await db.delete(teams).where(inArray(teams.id, staleIds))
        }

        // Sync RBAC captain roles: grant for new captains, revoke for removed captains
        const newCaptainIds = new Set<string>(
            teamsToCreate
                .flatMap((t) => [t.captainId, t.coach2Id ?? ""])
                .filter((id): id is string => !!id && !isGhostCaptain(id))
        )

        const session = await auth.api.getSession({ headers: await headers() })

        for (const captainId of newCaptainIds) {
            if (!oldCaptainIds.has(captainId)) {
                await grantRole(captainId, "captain", {
                    seasonId: config.seasonId,
                    divisionId,
                    grantedBy: session?.user?.id
                })
            }
        }

        for (const captainId of oldCaptainIds) {
            if (!newCaptainIds.has(captainId)) {
                await revokeRole(captainId, "captain", {
                    seasonId: config.seasonId,
                    divisionId
                })
            }
        }

        const isUpdate = existingTeams.length > 0
        if (session) {
            await logAuditEntry({
                userId: session.user.id,
                action: isUpdate ? "update" : "create",
                entityType: "teams",
                summary: `${isUpdate ? "Updated" : "Created"} teams for current season ${config.seasonId}, division ${divisionId}${isCoachesDiv ? " (coaches mode)" : ""}`
            })
        }

        return {
            status: true,
            message: `Successfully ${isUpdate ? "updated" : "created"} teams!`
        }
    } catch (error) {
        console.error("Error saving teams:", error)
        return {
            status: false,
            message: "Something went wrong while saving teams."
        }
    }
}
