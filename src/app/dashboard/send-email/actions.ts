"use server"

import { db } from "@/database/db"
import {
    resendSegments,
    resendTopics,
    emailBroadcasts,
    emailTemplates,
    users
} from "@/database/schema"
import { eq, desc } from "drizzle-orm"
import {
    withAction,
    requireSession,
    requireAdmin,
    ok,
    fail
} from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"
import { resend } from "@/lib/resend"
import { fullResync } from "@/lib/resend-sync"
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SegmentOption {
    id: number
    name: string
    segmentType: string
    resendSegmentId: string
}

export interface TopicOption {
    id: number
    name: string
    topicType: string
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
    segmentName: string
    segmentId: number
    topicId: number | null
    topicName: string | null
    lexicalContent: LexicalEmailTemplateContent
    sentByName: string
    status: string
    sentAt: Date | null
    createdAt: Date
}

// ---------------------------------------------------------------------------
// getAvailableSegments
// ---------------------------------------------------------------------------

/**
 * Returns Resend segments the current user can target.
 * Admins see all segments.
 * Commissioners see only their division's segment (and teams in that division).
 */
export async function getAvailableSegments(): Promise<{
    segments: SegmentOption[]
    topics: TopicOption[]
    templates: TemplateOption[]
}> {
    const isAdmin = await isAdminOrDirectorBySession()
    const isCommissioner = await isCommissionerBySession()

    if (!isAdmin && !isCommissioner) {
        return { segments: [], topics: [], templates: [] }
    }

    // Load all current segments
    const allSegments = await db
        .select({
            id: resendSegments.id,
            name: resendSegments.name,
            segment_type: resendSegments.segment_type,
            resend_segment_id: resendSegments.resend_segment_id,
            season_id: resendSegments.season_id,
            division_id: resendSegments.division_id
        })
        .from(resendSegments)
        .orderBy(resendSegments.segment_type, resendSegments.name)

    let filteredSegments = allSegments

    // Commissioners see only their division's segments
    if (!isAdmin && isCommissioner) {
        const config = await getSeasonConfig()
        const userId = await getSessionUserId()

        if (userId && config.seasonId) {
            const scope = await getCommissionerDivisionScope(
                userId,
                config.seasonId
            )

            if (scope.type === "division_specific") {
                filteredSegments = allSegments.filter(
                    (s) =>
                        // Allow: all_users segment
                        s.segment_type === "all_users" ||
                        // Allow: their division segment
                        (s.segment_type === "season_division" &&
                            scope.divisionIds.includes(s.division_id ?? -1)) ||
                        // Allow: team segments within their division
                        s.segment_type === "season_team"
                )
            }
            // league_wide commissioners see all segments
        }
    }

    const segments: SegmentOption[] = filteredSegments.map((s) => ({
        id: s.id,
        name: s.name,
        segmentType: s.segment_type,
        resendSegmentId: s.resend_segment_id
    }))

    // Load topics
    const topicRows = await db
        .select({
            id: resendTopics.id,
            name: resendTopics.name,
            topic_type: resendTopics.topic_type
        })
        .from(resendTopics)
        .orderBy(resendTopics.name)

    const topics: TopicOption[] = topicRows.map((t) => ({
        id: t.id,
        name: t.name,
        topicType: t.topic_type
    }))

    // Load email templates
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

    return { segments, topics, templates }
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
            segmentName: resendSegments.name,
            segmentId: emailBroadcasts.segment_id,
            topicId: emailBroadcasts.topic_id,
            topicName: resendTopics.name,
            lexicalContent: emailBroadcasts.lexical_content,
            sentByFirstName: users.first_name,
            sentByLastName: users.last_name,
            sentByPreferredName: users.preferred_name,
            status: emailBroadcasts.status,
            sentAt: emailBroadcasts.sent_at,
            createdAt: emailBroadcasts.created_at
        })
        .from(emailBroadcasts)
        .innerJoin(
            resendSegments,
            eq(emailBroadcasts.segment_id, resendSegments.id)
        )
        .innerJoin(users, eq(emailBroadcasts.sent_by, users.id))
        .leftJoin(resendTopics, eq(emailBroadcasts.topic_id, resendTopics.id))
        .orderBy(desc(emailBroadcasts.created_at))
        .limit(50)

    return rows.map((r) => ({
        id: r.id,
        subject: r.subject,
        segmentName: r.segmentName,
        segmentId: r.segmentId,
        topicId: r.topicId,
        topicName: r.topicName ?? null,
        lexicalContent: normalizeEmailTemplateContent(r.lexicalContent),
        sentByName: r.sentByPreferredName
            ? `${r.sentByPreferredName} ${r.sentByLastName}`
            : `${r.sentByFirstName} ${r.sentByLastName}`,
        status: r.status,
        sentAt: r.sentAt,
        createdAt: r.createdAt
    }))
}

// ---------------------------------------------------------------------------
// createAndSendBroadcast
// ---------------------------------------------------------------------------

export interface SendBroadcastInput {
    segmentDbId: number
    topicDbId?: number | null
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

        const { segmentDbId, topicDbId, subject, lexicalContent } = input

        if (!subject.trim()) {
            return fail("Subject is required.")
        }

        // Load segment
        const [segment] = await db
            .select({
                id: resendSegments.id,
                resend_segment_id: resendSegments.resend_segment_id,
                name: resendSegments.name
            })
            .from(resendSegments)
            .where(eq(resendSegments.id, segmentDbId))
            .limit(1)

        if (!segment) {
            return fail("Segment not found.")
        }

        // Load topic if provided
        let resendTopicId: string | null = null
        if (topicDbId) {
            const [topic] = await db
                .select({ resend_topic_id: resendTopics.resend_topic_id })
                .from(resendTopics)
                .where(eq(resendTopics.id, topicDbId))
                .limit(1)
            resendTopicId = topic?.resend_topic_id ?? null
        }

        // Render HTML from Lexical content
        const bodyHtml = convertEmailTemplateContentToHtml(lexicalContent)

        // Always append the unsubscribe footer
        const htmlWithFooter = `${bodyHtml}<p style="margin-top:2rem;font-size:12px;color:#666;"><a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a></p>`

        // Insert broadcast record (draft status)
        const [broadcast] = await db
            .insert(emailBroadcasts)
            .values({
                segment_id: segmentDbId,
                topic_id: topicDbId ?? null,
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
            // Create and send broadcast via Resend
            const created = await resend.broadcasts.create({
                segmentId: segment.resend_segment_id,
                from: site.mailFrom,
                subject: subject.trim(),
                html: htmlWithFooter,
                name: `BSD - ${subject.trim()}`,
                ...(resendTopicId ? { topicId: resendTopicId } : {}),
                send: true
            })

            if (!created.data?.id) {
                await db
                    .update(emailBroadcasts)
                    .set({
                        status: "failed",
                        error_message:
                            created.error?.message ?? "Unknown Resend error",
                        updated_at: new Date()
                    })
                    .where(eq(emailBroadcasts.id, broadcast.id))

                return fail(
                    created.error?.message ??
                        "Failed to send broadcast via Resend."
                )
            }

            // Update record with Resend broadcast ID and sent status
            await db
                .update(emailBroadcasts)
                .set({
                    resend_broadcast_id: created.data.id,
                    status: "sent",
                    sent_at: new Date(),
                    updated_at: new Date()
                })
                .where(eq(emailBroadcasts.id, broadcast.id))

            await logAuditEntry({
                userId: session.user.id,
                action: "create",
                entityType: "email_broadcast",
                entityId: broadcast.id,
                summary: `Sent broadcast "${subject.trim()}" to segment "${segment.name}" (Resend ID: ${created.data.id})`
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

// ---------------------------------------------------------------------------
// triggerFullResync
// ---------------------------------------------------------------------------

export const triggerFullResync = withAction(
    async (): Promise<ActionResult<{ synced: number; failed: number }>> => {
        await requireAdmin()
        const result = await fullResync()
        return ok(result)
    }
)
