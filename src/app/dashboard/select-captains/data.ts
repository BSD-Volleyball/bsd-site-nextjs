import "server-only"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { db } from "@/database/db"
import {
    users,
    divisions,
    individual_divisions,
    teams,
    signups,
    emailTemplates,
    userRoles
} from "@/database/schema"
import { eq, and, ne, isNotNull } from "drizzle-orm"
import { getSeasonConfig, type SeasonConfig } from "@/lib/site-config"
import { getSessionUserId, isCommissionerBySession } from "@/next/session"
import { getCommissionerDivisionAccess } from "@/lib/rbac"
import {
    type LexicalEmailTemplateContent,
    extractPlainTextFromEmailTemplateContent,
    normalizeEmailTemplateContent
} from "@/lib/email-template-content"
import { GHOST_CAPTAIN_ID } from "@/lib/ghost-captain"

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

export interface CreateTeamsData {
    seasonId: number
    seasonLabel: string
    divisions: DivisionOption[]
    users: UserOption[]
    allUsers: UserOption[]
    emailTemplate: string
    emailTemplateContent: LexicalEmailTemplateContent | null
    emailSubject: string
    seasonConfig: SeasonConfig
    divisionCommissioners: DivisionCommissioner[]
    existingTeamsByDivision: Record<number, ExistingTeam[]>
}

export const getCreateTeamsData = withAction(
    async (): Promise<ActionResult<CreateTeamsData>> => {
        const hasAccess = await isCommissionerBySession()
        if (!hasAccess) {
            return fail("You don't have permission to access this page.")
        }

        try {
            const config = await getSeasonConfig()

            if (!config.seasonId) {
                return fail("No current season found.")
            }

            const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

            const userId = await getSessionUserId()
            if (!userId) {
                return fail("Not authenticated.")
            }

            const divisionAccess = await getCommissionerDivisionAccess(
                userId,
                config.seasonId
            )
            if (divisionAccess.type === "denied") {
                return fail("You don't have permission to access this page.")
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
                        divisionId: userRoles.division_id,
                        userId: userRoles.user_id,
                        firstName: users.first_name,
                        preferredName: users.preferred_name
                    })
                    .from(userRoles)
                    .innerJoin(users, eq(userRoles.user_id, users.id))
                    .where(
                        and(
                            eq(userRoles.role, "commissioner"),
                            eq(userRoles.season_id, config.seasonId),
                            isNotNull(userRoles.division_id)
                        )
                    ),
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
                commissionerRows
                    .filter(
                        (row): row is typeof row & { divisionId: number } =>
                            row.divisionId !== null
                    )
                    .map((row) => ({
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
                logger.error(
                    "Error fetching captains selected template",
                    undefined,
                    templateError
                )
            }

            return ok({
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
            })
        } catch (error) {
            logger.error("Error fetching create teams data", undefined, error)
            return fail("Something went wrong.")
        }
    }
)
