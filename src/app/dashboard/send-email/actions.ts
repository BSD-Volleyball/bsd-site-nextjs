"use server"

import { db } from "@/database/db"
import {
    emailRecipientGroups,
    emailBroadcasts,
    emailTemplates,
    users
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
import type { MessageStream } from "@/lib/postmark"
import { getRecipientsForGroup, filterSuppressed } from "@/lib/email-recipients"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecipientGroupOption {
    id: number
    name: string
    groupType: string
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
    streamId: string | null
    lexicalContent: LexicalEmailTemplateContent
    sentByName: string
    status: string
    sentCount: number | null
    sentAt: Date | null
    createdAt: Date
}

// ---------------------------------------------------------------------------
// getAvailableRecipientGroups
// ---------------------------------------------------------------------------

/**
 * Returns recipient groups the current user can target.
 * Admins see all groups.
 * Commissioners see only their division's group (and teams in that division).
 */
export async function getAvailableRecipientGroups(): Promise<{
    groups: RecipientGroupOption[]
    templates: TemplateOption[]
}> {
    const isAdmin = await isAdminOrDirectorBySession()
    const isCommissioner = await isCommissionerBySession()

    if (!isAdmin && !isCommissioner) {
        return { groups: [], templates: [] }
    }

    const allGroups = await db
        .select({
            id: emailRecipientGroups.id,
            name: emailRecipientGroups.name,
            group_type: emailRecipientGroups.group_type,
            season_id: emailRecipientGroups.season_id,
            division_id: emailRecipientGroups.division_id
        })
        .from(emailRecipientGroups)
        .orderBy(emailRecipientGroups.group_type, emailRecipientGroups.name)

    let filteredGroups = allGroups

    if (!isAdmin && isCommissioner) {
        const config = await getSeasonConfig()
        const userId = await getSessionUserId()

        if (userId && config.seasonId) {
            const scope = await getCommissionerDivisionScope(
                userId,
                config.seasonId
            )

            if (scope.type === "division_specific") {
                filteredGroups = allGroups.filter(
                    (g) =>
                        g.group_type === "all_users" ||
                        (g.group_type === "season_division" &&
                            scope.divisionIds.includes(g.division_id ?? -1)) ||
                        g.group_type === "season_team"
                )
            }
        }
    }

    const groups: RecipientGroupOption[] = filteredGroups.map((g) => ({
        id: g.id,
        name: g.name,
        groupType: g.group_type
    }))

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

    return { groups, templates }
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
    recipientGroupId: number
    streamId: string
    subject: string
    lexicalContent: LexicalEmailTemplateContent
}

export const createAndSendBroadcast = withAction(
    async (
        input: SendBroadcastInput
    ): Promise<ActionResult<{ broadcastId: number }>> => {
        const session = await requireSession()
        const isAdmin = await isAdminOrDirectorBySession()
        const isCommissioner = await isCommissionerBySession()
        if (!isAdmin && !isCommissioner) {
            return fail("Unauthorized.")
        }

        const { recipientGroupId, streamId, subject, lexicalContent } = input

        if (!subject.trim()) {
            return fail("Subject is required.")
        }

        // Validate stream
        const validStreams = [STREAM_BROADCAST, STREAM_IN_SEASON_UPDATES]
        if (!validStreams.includes(streamId as MessageStream)) {
            return fail("Invalid message stream.")
        }

        // Load recipient group
        const [group] = await db
            .select({
                id: emailRecipientGroups.id,
                name: emailRecipientGroups.name
            })
            .from(emailRecipientGroups)
            .where(eq(emailRecipientGroups.id, recipientGroupId))
            .limit(1)

        if (!group) {
            return fail("Recipient group not found.")
        }

        // Render HTML from Lexical content
        const bodyHtml = convertEmailTemplateContentToHtml(lexicalContent)

        // Append unsubscribe footer (Postmark handles the link for broadcast streams)
        const htmlWithFooter = `${bodyHtml}<p style="margin-top:2rem;font-size:12px;color:#666;"><a href="{{{pm:unsubscribe}}}">Unsubscribe</a></p>`

        // Insert broadcast record (draft status)
        const [broadcast] = await db
            .insert(emailBroadcasts)
            .values({
                recipient_group_id: recipientGroupId,
                stream_id: streamId,
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
            // Get recipients and filter suppressions
            const allRecipients = await getRecipientsForGroup(recipientGroupId)
            const recipients = await filterSuppressed(allRecipients, streamId)

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

            // Send via Postmark batch API
            const result = await sendBroadcastEmails({
                from: site.mailFrom,
                subject: subject.trim(),
                htmlBody: htmlWithFooter,
                recipients: recipients.map((r) => ({ email: r.email })),
                stream: streamId as
                    | typeof STREAM_BROADCAST
                    | typeof STREAM_IN_SEASON_UPDATES,
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
                summary: `Sent broadcast "${subject.trim()}" to "${group.name}" via ${streamId} (${result.sent} sent, ${result.failed} failed)`
            })

            return ok({ broadcastId: broadcast.id })
        } catch (err) {
            await db
                .update(emailBroadcasts)
                .set({
                    status: "failed",
                    error_message:
                        err instanceof Error ? err.message : "Unknown error",
                    updated_at: new Date()
                })
                .where(eq(emailBroadcasts.id, broadcast.id))

            throw err
        }
    }
)
