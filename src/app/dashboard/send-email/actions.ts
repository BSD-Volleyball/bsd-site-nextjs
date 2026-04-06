"use server"

import { db } from "@/database/db"
import {
    emailRecipientGroups,
    emailBroadcasts,
    emailTemplates,
    users,
    teams,
    divisions,
    seasons
} from "@/database/schema"
import { eq, desc } from "drizzle-orm"
import { withAction, requireSession, ok, fail } from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"
import { getSeasonConfig } from "@/lib/site-config"
import {
    isAdminOrDirectorBySession,
    isCommissionerBySession,
    getCommissionerDivisionScope,
    getSessionUserId
} from "@/lib/rbac"
import { site } from "@/config/site"
import { logAuditEntry } from "@/lib/audit-log"
import {
    type LexicalEmailTemplateContent,
    normalizeEmailTemplateContent,
    convertEmailTemplateContentToHtml
} from "@/lib/email-template-content"
import {
    sendBroadcastEmails,
    STREAM_BROADCAST,
    STREAM_IN_SEASON_UPDATES
} from "@/lib/postmark"

type BroadcastStream = typeof STREAM_BROADCAST | typeof STREAM_IN_SEASON_UPDATES
import {
    ensureRecipientGroup,
    getRecipientsForGroup,
    filterSuppressed
} from "@/lib/email-recipients"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DivisionOption {
    id: number
    name: string
}

export interface TeamOption {
    id: number
    name: string
    number: number | null
    divisionId: number
    divisionName: string
}

export interface TemplateOption {
    id: number
    name: string
    subject: string | null
    content: LexicalEmailTemplateContent
}

export interface BroadcastHistoryItem {
    id: number
    subject: string
    groupName: string
    groupId: number | null
    groupType: string | null
    divisionId: number | null
    teamId: number | null
    streamId: string | null
    lexicalContent: LexicalEmailTemplateContent
    sentByName: string
    status: string
    sentCount: number | null
    sentAt: Date | null
    createdAt: Date
}

export type SendToType = "everyone" | "season" | "division" | "team"

// ---------------------------------------------------------------------------
// getEmailFormData
// ---------------------------------------------------------------------------

/**
 * Returns divisions, teams (for the current season), and templates.
 * canSendToAll indicates whether the user may send to Everyone/Season-wide.
 * Commissioners see only their permitted divisions/teams.
 */
export async function getEmailFormData(): Promise<{
    canSendToAll: boolean
    divisions: DivisionOption[]
    teams: TeamOption[]
    templates: TemplateOption[]
}> {
    const isAdmin = await isAdminOrDirectorBySession()
    const isCommissioner = await isCommissionerBySession()

    if (!isAdmin && !isCommissioner) {
        return { canSendToAll: false, divisions: [], teams: [], templates: [] }
    }

    const config = await getSeasonConfig()

    let divisionRows: DivisionOption[] = []
    let teamRows: TeamOption[] = []

    if (config.seasonId) {
        // Fetch all teams + division info for the current season
        const rawTeams = await db
            .select({
                id: teams.id,
                name: teams.name,
                number: teams.number,
                divisionId: teams.division,
                divisionName: divisions.name
            })
            .from(teams)
            .innerJoin(divisions, eq(teams.division, divisions.id))
            .where(eq(teams.season, config.seasonId))
            .orderBy(divisions.name, teams.number)

        // Unique divisions from those teams
        const divMap = new Map<number, string>()
        for (const t of rawTeams) divMap.set(t.divisionId, t.divisionName)
        divisionRows = Array.from(divMap.entries()).map(([id, name]) => ({
            id,
            name
        }))

        // Commissioner RBAC: filter to permitted divisions only
        if (!isAdmin && isCommissioner) {
            const userId = await getSessionUserId()
            if (userId) {
                const scope = await getCommissionerDivisionScope(
                    userId,
                    config.seasonId
                )
                if (scope.type === "division_specific") {
                    divisionRows = divisionRows.filter((d) =>
                        scope.divisionIds.includes(d.id)
                    )
                    teamRows = rawTeams.filter((t) =>
                        scope.divisionIds.includes(t.divisionId)
                    )
                } else {
                    teamRows = rawTeams
                }
            }
        } else {
            teamRows = rawTeams
        }
    }

    const templateRows = await db
        .select({
            id: emailTemplates.id,
            name: emailTemplates.name,
            subject: emailTemplates.subject,
            content: emailTemplates.content
        })
        .from(emailTemplates)
        .orderBy(emailTemplates.name)

    const templates: TemplateOption[] = templateRows.map((t) => ({
        id: t.id,
        name: t.name,
        subject: t.subject,
        content: normalizeEmailTemplateContent(t.content)
    }))

    return {
        canSendToAll: isAdmin,
        divisions: divisionRows,
        teams: teamRows,
        templates
    }
}

// ---------------------------------------------------------------------------
// getBroadcastHistory
// ---------------------------------------------------------------------------

export async function getBroadcastHistory(): Promise<BroadcastHistoryItem[]> {
    const isAdmin = await isAdminOrDirectorBySession()
    const isCommissioner = await isCommissionerBySession()
    if (!isAdmin && !isCommissioner) return []

    const rows = await db
        .select({
            id: emailBroadcasts.id,
            subject: emailBroadcasts.subject,
            groupName: emailRecipientGroups.name,
            groupId: emailBroadcasts.recipient_group_id,
            groupType: emailRecipientGroups.group_type,
            divisionId: emailRecipientGroups.division_id,
            teamId: emailRecipientGroups.team_id,
            streamId: emailBroadcasts.stream_id,
            lexicalContent: emailBroadcasts.lexical_content,
            sentByFirstName: users.first_name,
            sentByLastName: users.last_name,
            sentByPreferredName: users.preferred_name,
            status: emailBroadcasts.status,
            sentCount: emailBroadcasts.sent_count,
            sentAt: emailBroadcasts.sent_at,
            createdAt: emailBroadcasts.created_at
        })
        .from(emailBroadcasts)
        .leftJoin(
            emailRecipientGroups,
            eq(emailBroadcasts.recipient_group_id, emailRecipientGroups.id)
        )
        .innerJoin(users, eq(emailBroadcasts.sent_by, users.id))
        .orderBy(desc(emailBroadcasts.created_at))
        .limit(50)

    return rows.map((r) => ({
        id: r.id,
        subject: r.subject,
        groupName: r.groupName ?? "Unknown",
        groupId: r.groupId,
        groupType: r.groupType ?? null,
        divisionId: r.divisionId ?? null,
        teamId: r.teamId ?? null,
        streamId: r.streamId,
        lexicalContent: normalizeEmailTemplateContent(r.lexicalContent),
        sentByName: r.sentByPreferredName
            ? `${r.sentByPreferredName} ${r.sentByLastName}`
            : `${r.sentByFirstName} ${r.sentByLastName}`,
        status: r.status,
        sentCount: r.sentCount,
        sentAt: r.sentAt,
        createdAt: r.createdAt
    }))
}

// ---------------------------------------------------------------------------
// createAndSendBroadcast
// ---------------------------------------------------------------------------

export interface SendBroadcastInput {
    sendToType: SendToType
    divisionId?: number
    teamId?: number
    subject: string
    lexicalContent: LexicalEmailTemplateContent
}

/** Resolves/creates the recipient group and infers the stream from sendToType. */
async function resolveGroup(
    sendToType: SendToType,
    seasonId: number | null,
    divisionId?: number,
    teamId?: number
): Promise<{ groupId: number; groupName: string; stream: BroadcastStream }> {
    if (sendToType === "everyone") {
        const groupId = await ensureRecipientGroup("all_users", {
            name: "All Users"
        })
        return { groupId, groupName: "All Users", stream: STREAM_BROADCAST }
    }

    if (!seasonId) throw new Error("No active season configured.")

    // Load season label once
    const [seasonRow] = await db
        .select({ year: seasons.year, season: seasons.season })
        .from(seasons)
        .where(eq(seasons.id, seasonId))
        .limit(1)
    const seasonLabel = seasonRow
        ? `${seasonRow.season.charAt(0).toUpperCase()}${seasonRow.season.slice(1)} ${seasonRow.year}`
        : "Current Season"

    if (sendToType === "season") {
        const groupId = await ensureRecipientGroup("season_signups", {
            seasonId,
            name: `${seasonLabel} – All Season Players`
        })
        return {
            groupId,
            groupName: `${seasonLabel} – All Season Players`,
            stream: STREAM_IN_SEASON_UPDATES
        }
    }

    if (sendToType === "division") {
        if (!divisionId) throw new Error("Division is required.")
        const [divRow] = await db
            .select({ name: divisions.name })
            .from(divisions)
            .where(eq(divisions.id, divisionId))
            .limit(1)
        if (!divRow) throw new Error("Division not found.")
        const groupId = await ensureRecipientGroup("season_division", {
            seasonId,
            divisionId,
            name: `${seasonLabel} – ${divRow.name}`
        })
        return {
            groupId,
            groupName: `${seasonLabel} – ${divRow.name}`,
            stream: STREAM_IN_SEASON_UPDATES
        }
    }

    // team
    if (!teamId) throw new Error("Team is required.")
    const [teamRow] = await db
        .select({ name: teams.name })
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1)
    if (!teamRow) throw new Error("Team not found.")
    const groupId = await ensureRecipientGroup("season_team", {
        seasonId,
        teamId,
        name: `${seasonLabel} – Team ${teamRow.name}`
    })
    return {
        groupId,
        groupName: `${seasonLabel} – Team ${teamRow.name}`,
        stream: STREAM_IN_SEASON_UPDATES
    }
}

export const createAndSendBroadcast = withAction(
    async (
        input: SendBroadcastInput
    ): Promise<ActionResult<{ broadcastId: number }>> => {
        const session = await requireSession()
        const isAdmin = await isAdminOrDirectorBySession()
        const isCommissioner = await isCommissionerBySession()
        if (!isAdmin && !isCommissioner) return fail("Unauthorized.")

        const { sendToType, divisionId, teamId, subject, lexicalContent } =
            input

        if (!subject.trim()) return fail("Subject is required.")
        if (!sendToType) return fail("Recipient selection is required.")

        // Only admins can send to everyone or all season players
        if (
            !isAdmin &&
            (sendToType === "everyone" || sendToType === "season")
        ) {
            return fail(
                "Unauthorized: only admins can send league-wide emails."
            )
        }

        const config = await getSeasonConfig()

        let group: {
            groupId: number
            groupName: string
            stream: BroadcastStream
        }
        try {
            group = await resolveGroup(
                sendToType,
                config.seasonId ?? null,
                divisionId,
                teamId
            )
        } catch (err) {
            return fail(
                err instanceof Error ? err.message : "Failed to resolve group."
            )
        }

        const { groupId, groupName, stream } = group

        // Render HTML
        const bodyHtml = convertEmailTemplateContentToHtml(lexicalContent)
        const htmlWithFooter = `${bodyHtml}<p style="margin-top:2rem;font-size:12px;color:#666;"><a href="{{{pm:unsubscribe}}}">Unsubscribe</a></p>`

        // Insert broadcast record (draft status)
        const [broadcast] = await db
            .insert(emailBroadcasts)
            .values({
                recipient_group_id: groupId,
                stream_id: stream,
                subject: subject.trim(),
                html_content: htmlWithFooter,
                lexical_content: lexicalContent as unknown as Record<
                    string,
                    unknown
                >,
                sent_by: session.user.id,
                status: "draft"
            })
            .returning({ id: emailBroadcasts.id })

        try {
            const allRecipients = await getRecipientsForGroup(groupId)
            const recipients = await filterSuppressed(allRecipients, stream)

            if (recipients.length === 0) {
                await db
                    .update(emailBroadcasts)
                    .set({
                        status: "sent",
                        sent_count: 0,
                        failed_count: 0,
                        sent_at: new Date(),
                        updated_at: new Date()
                    })
                    .where(eq(emailBroadcasts.id, broadcast.id))
                return ok({ broadcastId: broadcast.id })
            }

            const result = await sendBroadcastEmails({
                from: site.mailFrom,
                subject: subject.trim(),
                htmlBody: htmlWithFooter,
                recipients: recipients.map((r) => ({ email: r.email })),
                stream,
                tag: "broadcast"
            })

            await db
                .update(emailBroadcasts)
                .set({
                    status: "sent",
                    sent_count: result.sent,
                    failed_count: result.failed,
                    sent_at: new Date(),
                    updated_at: new Date()
                })
                .where(eq(emailBroadcasts.id, broadcast.id))

            await logAuditEntry({
                userId: session.user.id,
                action: "create",
                entityType: "email_broadcast",
                entityId: broadcast.id,
                summary: `Sent broadcast "${subject.trim()}" to "${groupName}" via ${stream} (${result.sent} sent, ${result.failed} failed)`
            })

            return ok({ broadcastId: broadcast.id })
        } catch (err) {
            await db
                .update(emailBroadcasts)
                .set({ status: "failed", updated_at: new Date() })
                .where(eq(emailBroadcasts.id, broadcast.id))
            console.error("[send-email] broadcast failed", err)
            return fail("Failed to send emails. Please try again.")
        }
    }
)
