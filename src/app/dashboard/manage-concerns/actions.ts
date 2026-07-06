"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import {
    concerns,
    concernComments,
    concernReplies,
    concernReceived,
    users,
    userRoles
} from "@/database/schema"
import { eq, desc, or } from "drizzle-orm"
import { hasPermissionBySession } from "@/lib/rbac"
import { getSeasonConfig } from "@/lib/site-config"
import { logAuditEntry } from "@/lib/audit-log"
import { sendEmail } from "@/lib/postmark"
import { site } from "@/config/site"
import {
    withAction,
    ok,
    fail,
    requireSession,
    requireSeasonConfig,
    requirePermission,
    requireNonEmptyString,
    ActionError
} from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"

// Repliers/commenters may hold either permission; status changes need manage.
async function requireConcernViewOrManage(): Promise<void> {
    const config = await requireSeasonConfig()
    const canView = await hasPermissionBySession("concerns:view", {
        seasonId: config.seasonId
    })
    if (canView) return
    const canManage = await hasPermissionBySession("concerns:manage", {
        seasonId: config.seasonId
    })
    if (!canManage) throw new ActionError("Unauthorized.")
}

export interface ConcernRow {
    id: number
    user_id: string | null
    anonymous: boolean
    contact_name: string | null
    contact_email: string | null
    contact_phone: string | null
    want_followup: boolean
    incident_date: string
    location: string
    person_involved: string
    witnesses: string | null
    team_match: string | null
    description: string
    status: string
    assigned_to: string | null
    assigned_to_name: string | null
    submitter_name: string | null
    submitter_email: string | null
    source: string
    created_at: Date
    updated_at: Date
}

export interface ConcernComment {
    id: number
    concern_id: number
    author_id: string
    author_name: string
    content: string
    created_at: Date
}

export interface ConcernReply {
    id: number
    concern_id: number
    sent_by: string
    sent_by_name: string
    subject: string
    body_text: string
    sent_to: string
    sent_at: Date
}

export interface ConcernReceived {
    id: number
    concern_id: number
    from_address: string
    from_name: string | null
    subject: string
    body_text: string | null
    body_html: string | null
    received_at: Date
}

export type ConcernThreadItem =
    | ({ type: "comment" } & ConcernComment)
    | ({ type: "reply" } & ConcernReply)
    | ({ type: "received" } & ConcernReceived)

export interface AssignableUser {
    id: string
    name: string
    role: string
}

export const getConcerns = withAction(
    async (): Promise<ActionResult<ConcernRow[]>> => {
        const config = await requireSeasonConfig()
        await requirePermission("concerns:view", {
            seasonId: config.seasonId
        })

        const rows = await db
            .select({
                id: concerns.id,
                anonymous: concerns.anonymous,
                contact_name: concerns.contact_name,
                contact_email: concerns.contact_email,
                contact_phone: concerns.contact_phone,
                want_followup: concerns.want_followup,
                incident_date: concerns.incident_date,
                location: concerns.location,
                person_involved: concerns.person_involved,
                witnesses: concerns.witnesses,
                team_match: concerns.team_match,
                description: concerns.description,
                status: concerns.status,
                assigned_to: concerns.assigned_to,
                source: concerns.source,
                created_at: concerns.created_at,
                updated_at: concerns.updated_at,
                user_id: concerns.user_id,
                submitter_name: users.name,
                submitter_email: users.email
            })
            .from(concerns)
            .leftJoin(users, eq(concerns.user_id, users.id))
            .orderBy(desc(concerns.created_at))

        const assigneeIds = [
            ...new Set(rows.map((r) => r.assigned_to).filter(Boolean))
        ] as string[]
        const assigneeMap = new Map<string, string>()

        if (assigneeIds.length > 0) {
            const assignees = await db
                .select({ id: users.id, name: users.name })
                .from(users)
                .where(
                    assigneeIds.length === 1
                        ? eq(users.id, assigneeIds[0])
                        : or(...assigneeIds.map((id) => eq(users.id, id)))
                )
            for (const a of assignees) {
                assigneeMap.set(a.id, a.name ?? a.id)
            }
        }

        const result: ConcernRow[] = rows.map((r) => ({
            id: r.id,
            user_id: r.user_id,
            anonymous: r.anonymous,
            contact_name: r.contact_name,
            contact_email: r.contact_email,
            contact_phone: r.contact_phone,
            want_followup: r.want_followup,
            incident_date: r.incident_date,
            location: r.location,
            person_involved: r.person_involved,
            witnesses: r.witnesses,
            team_match: r.team_match,
            description: r.description,
            status: r.status,
            assigned_to: r.assigned_to,
            assigned_to_name: r.assigned_to
                ? (assigneeMap.get(r.assigned_to) ?? r.assigned_to)
                : null,
            submitter_name: r.anonymous ? null : (r.submitter_name ?? null),
            submitter_email: r.anonymous ? null : (r.submitter_email ?? null),
            source: r.source,
            created_at: r.created_at,
            updated_at: r.updated_at
        }))

        return ok(result)
    }
)

export const getConcernComments = withAction(
    async (concernId: number): Promise<ActionResult<ConcernComment[]>> => {
        const config = await requireSeasonConfig()
        await requirePermission("concerns:view", {
            seasonId: config.seasonId
        })

        const rows = await db
            .select({
                id: concernComments.id,
                concern_id: concernComments.concern_id,
                author_id: concernComments.author_id,
                author_name: users.name,
                content: concernComments.content,
                created_at: concernComments.created_at
            })
            .from(concernComments)
            .leftJoin(users, eq(concernComments.author_id, users.id))
            .where(eq(concernComments.concern_id, concernId))
            .orderBy(desc(concernComments.created_at))

        return ok(
            rows.map((r) => ({
                id: r.id,
                concern_id: r.concern_id,
                author_id: r.author_id,
                author_name: r.author_name ?? r.author_id,
                content: r.content,
                created_at: r.created_at
            }))
        )
    }
)

export const getConcernThread = withAction(
    async (concernId: number): Promise<ActionResult<ConcernThreadItem[]>> => {
        const config = await requireSeasonConfig()
        await requirePermission("concerns:view", {
            seasonId: config.seasonId
        })

        const [commentRows, replyRows, receivedRows] = await Promise.all([
            db
                .select({
                    id: concernComments.id,
                    concern_id: concernComments.concern_id,
                    author_id: concernComments.author_id,
                    author_name: users.name,
                    content: concernComments.content,
                    created_at: concernComments.created_at
                })
                .from(concernComments)
                .leftJoin(users, eq(concernComments.author_id, users.id))
                .where(eq(concernComments.concern_id, concernId)),
            db
                .select({
                    id: concernReplies.id,
                    concern_id: concernReplies.concern_id,
                    sent_by: concernReplies.sent_by,
                    sent_by_name: users.name,
                    subject: concernReplies.subject,
                    body_text: concernReplies.body_text,
                    sent_to: concernReplies.sent_to,
                    sent_at: concernReplies.sent_at
                })
                .from(concernReplies)
                .leftJoin(users, eq(concernReplies.sent_by, users.id))
                .where(eq(concernReplies.concern_id, concernId)),
            db
                .select({
                    id: concernReceived.id,
                    concern_id: concernReceived.concern_id,
                    from_address: concernReceived.from_address,
                    from_name: concernReceived.from_name,
                    subject: concernReceived.subject,
                    body_text: concernReceived.body_text,
                    body_html: concernReceived.body_html,
                    received_at: concernReceived.received_at
                })
                .from(concernReceived)
                .where(eq(concernReceived.concern_id, concernId))
        ])

        const items: ConcernThreadItem[] = [
            ...commentRows.map((r) => ({
                type: "comment" as const,
                id: r.id,
                concern_id: r.concern_id,
                author_id: r.author_id,
                author_name: r.author_name ?? r.author_id,
                content: r.content,
                created_at: r.created_at
            })),
            ...replyRows.map((r) => ({
                type: "reply" as const,
                id: r.id,
                concern_id: r.concern_id,
                sent_by: r.sent_by,
                sent_by_name: r.sent_by_name ?? r.sent_by,
                subject: r.subject,
                body_text: r.body_text,
                sent_to: r.sent_to,
                sent_at: r.sent_at
            })),
            ...receivedRows.map((r) => ({
                type: "received" as const,
                id: r.id,
                concern_id: r.concern_id,
                from_address: r.from_address,
                from_name: r.from_name,
                subject: r.subject,
                body_text: r.body_text,
                body_html: r.body_html,
                received_at: r.received_at
            }))
        ]

        items.sort((a, b) => {
            const aTime =
                a.type === "comment"
                    ? a.created_at.getTime()
                    : a.type === "reply"
                      ? a.sent_at.getTime()
                      : a.received_at.getTime()
            const bTime =
                b.type === "comment"
                    ? b.created_at.getTime()
                    : b.type === "reply"
                      ? b.sent_at.getTime()
                      : b.received_at.getTime()
            return aTime - bTime
        })

        return ok(items)
    }
)

export const sendConcernReply = withAction(
    async (concernId: number, body: string): Promise<ActionResult> => {
        const session = await requireSession()
        await requireConcernViewOrManage()
        const userId = session.user.id

        requireNonEmptyString(body, "Reply")

        const fromAddress = process.env.INBOUND_CONCERN_ADDRESS
        const fromName = process.env.INBOUND_CONCERN_FROM_NAME
        if (!fromAddress) {
            return fail("Concern reply address is not configured.")
        }

        const [concern] = await db
            .select()
            .from(concerns)
            .where(eq(concerns.id, concernId))
            .limit(1)

        if (!concern) {
            return fail("Concern not found.")
        }
        if (concern.status !== "active") {
            return fail("Can only reply to active concerns.")
        }

        let replyTo: string | null = null

        if (concern.source === "email") {
            replyTo = concern.contact_email ?? null
        } else if (!concern.anonymous && concern.user_id) {
            const [userRow] = await db
                .select({ email: users.email })
                .from(users)
                .where(eq(users.id, concern.user_id))
                .limit(1)
            replyTo = userRow?.email ?? null
        } else if (concern.contact_email) {
            replyTo = concern.contact_email
        }

        if (!replyTo) {
            return fail("No reply address available for this concern.")
        }

        // Find the most recent reply's postmark_message_id to chain the email
        // thread. Fall back to the original inbound email's ID if no replies exist.
        const [lastReply] = await db
            .select({
                postmark_message_id: concernReplies.postmark_message_id
            })
            .from(concernReplies)
            .where(eq(concernReplies.concern_id, concernId))
            .orderBy(desc(concernReplies.sent_at))
            .limit(1)

        const inReplyTo =
            lastReply?.postmark_message_id ??
            concern.source_email_id ??
            undefined

        // Use the original inbound email's subject when the concern came from email;
        // fall back to the generic "Re: Concern #N" for web-submitted concerns.
        const baseSubject =
            concern.source === "email" && concern.person_involved
                ? concern.person_involved.replace(/^(Re:\s*)+/i, "").trim()
                : `Concern #${concernId}`
        const subject = `Re: ${baseSubject}`

        const postmarkMessageId = await sendEmail({
            from: fromAddress,
            fromName: fromName || undefined,
            to: replyTo,
            subject,
            htmlBody: `<p>${body.trim().replace(/\n/g, "<br>")}</p>`,
            textBody: body.trim(),
            stream: "outbound",
            inReplyTo,
            headers: [
                { name: "X-BSD-Ticket-ID", value: `concern-${concernId}` }
            ]
        })

        await db.insert(concernReplies).values({
            concern_id: concernId,
            sent_by: userId,
            subject,
            body_text: body.trim(),
            sent_to: replyTo,
            postmark_message_id: postmarkMessageId
        })

        await logAuditEntry({
            userId,
            action: "send_concern_reply",
            entityType: "concern",
            entityId: concernId,
            summary: `Sent a reply on concern #${concernId}`
        })

        revalidatePath("/dashboard/manage-concerns")
        return ok(undefined, "Reply sent.")
    }
)

export const addConcernComment = withAction(
    async (concernId: number, content: string): Promise<ActionResult> => {
        const session = await requireSession()
        await requireConcernViewOrManage()
        const userId = session.user.id

        requireNonEmptyString(content, "Comment")

        await db.insert(concernComments).values({
            concern_id: concernId,
            author_id: userId,
            content: content.trim()
        })
        await logAuditEntry({
            userId,
            action: "add_concern_comment",
            entityType: "concern",
            entityId: concernId,
            summary: `Added a comment on concern #${concernId}`
        })
        revalidatePath("/dashboard/manage-concerns")
        return ok(undefined, "Comment added.")
    }
)

export const updateConcernStatus = withAction(
    async (
        concernId: number,
        status: "new" | "active" | "closed" | "spam"
    ): Promise<ActionResult> => {
        const session = await requireSession()
        const config = await requireSeasonConfig()
        await requirePermission("concerns:manage", {
            seasonId: config.seasonId
        })

        await db
            .update(concerns)
            .set({ status, updated_at: new Date() })
            .where(eq(concerns.id, concernId))
        await logAuditEntry({
            userId: session.user.id,
            action: "update_concern_status",
            entityType: "concern",
            entityId: concernId,
            summary: `Set concern #${concernId} status to ${status}`
        })
        revalidatePath("/dashboard/manage-concerns")
        return ok(undefined, "Status updated.")
    }
)

export const assignConcern = withAction(
    async (
        concernId: number,
        assigneeId: string | null
    ): Promise<ActionResult> => {
        const session = await requireSession()
        const config = await requireSeasonConfig()
        await requirePermission("concerns:manage", {
            seasonId: config.seasonId
        })
        const actorUserId = session.user.id

        const [actor] = await db
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, actorUserId))
            .limit(1)
        const actorName = actor?.name ?? actorUserId

        const [existingConcern] = await db
            .select({
                status: concerns.status,
                source: concerns.source,
                anonymous: concerns.anonymous,
                contact_name: concerns.contact_name,
                contact_email: concerns.contact_email,
                person_involved: concerns.person_involved,
                location: concerns.location,
                incident_date: concerns.incident_date
            })
            .from(concerns)
            .where(eq(concerns.id, concernId))
            .limit(1)

        if (!existingConcern) {
            return fail("Concern not found.")
        }

        let assigneeName: string | null = null
        let assigneeEmail: string | null = null
        if (assigneeId) {
            const [assignee] = await db
                .select({ name: users.name, email: users.email })
                .from(users)
                .where(eq(users.id, assigneeId))
                .limit(1)
            assigneeName = assignee?.name ?? assigneeId
            assigneeEmail = assignee?.email ?? null
        }

        const shouldMoveToActive =
            existingConcern.status === "new" && assigneeId !== null
        const nextStatus = shouldMoveToActive
            ? ("active" as const)
            : existingConcern.status

        await db
            .update(concerns)
            .set({
                assigned_to: assigneeId,
                status: nextStatus,
                updated_at: new Date()
            })
            .where(eq(concerns.id, concernId))

        const assignmentComment = assigneeId
            ? shouldMoveToActive
                ? `${actorName} assigned this concern to ${assigneeName} and changed status to active.`
                : `${actorName} assigned this concern to ${assigneeName}.`
            : `${actorName} unassigned this concern.`

        await db.insert(concernComments).values({
            concern_id: concernId,
            author_id: actorUserId,
            content: assignmentComment
        })

        await logAuditEntry({
            userId: actorUserId,
            action: "assign_concern",
            entityType: "concern",
            entityId: concernId,
            summary: assigneeId
                ? `Assigned concern #${concernId} to ${assigneeName}`
                : `Unassigned concern #${concernId}`
        })

        if (assigneeId && assigneeId !== actorUserId && assigneeEmail) {
            const submitterLabel = existingConcern.anonymous
                ? "Anonymous submission"
                : existingConcern.contact_email
                  ? existingConcern.contact_name
                      ? `${existingConcern.contact_name} <${existingConcern.contact_email}>`
                      : existingConcern.contact_email
                  : (existingConcern.contact_name ?? "Unknown submitter")
            const sourceLabel =
                existingConcern.source === "email"
                    ? "Email submission"
                    : "Web submission"
            const conciseSubject = `Concern #${concernId}: ${existingConcern.person_involved}`
            const link = `${site.url}/dashboard/manage-concerns`
            const subjectLine = `[BSD] A concern has been assigned to you: ${conciseSubject}`
            const textBody = [
                `Hi ${assigneeName ?? "there"},`,
                "",
                `${actorName} has assigned a concern to you.`,
                "",
                `Subject: ${conciseSubject}`,
                `From: ${submitterLabel} (${sourceLabel})`,
                "",
                `View it here: ${link}`
            ].join("\n")
            const htmlBody = `
                <div style="font-family:sans-serif;font-size:14px;line-height:1.5">
                    <p>Hi ${assigneeName ?? "there"},</p>
                    <p><strong>${actorName}</strong> has assigned a concern to you.</p>
                    <p>
                        <strong>Subject:</strong> ${conciseSubject}<br/>
                        <strong>From:</strong> ${submitterLabel} (${sourceLabel})
                    </p>
                    <p><a href="${link}">Open Manage Concerns</a></p>
                </div>
            `
            try {
                await sendEmail({
                    from: site.mailFrom,
                    to: assigneeEmail,
                    subject: subjectLine,
                    htmlBody,
                    textBody,
                    tag: "concern-assignment"
                })
            } catch (notifyError) {
                console.error(
                    "Failed to send concern-assignment notification:",
                    notifyError
                )
            }
        }

        revalidatePath("/dashboard/manage-concerns")
        return ok(undefined, "Concern assigned.")
    }
)

async function setConcernStatus(
    concernId: number,
    status: "closed" | "active" | "new" | "spam",
    commentText: (actorName: string) => string,
    auditAction: string,
    auditSummary: string,
    successMessage: string
): Promise<ActionResult> {
    const session = await requireSession()
    const config = await requireSeasonConfig()
    await requirePermission("concerns:manage", {
        seasonId: config.seasonId
    })
    const actorUserId = session.user.id

    const [actor] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, actorUserId))
        .limit(1)
    const actorName = actor?.name ?? actorUserId

    await db
        .update(concerns)
        .set({ status, updated_at: new Date() })
        .where(eq(concerns.id, concernId))

    await db.insert(concernComments).values({
        concern_id: concernId,
        author_id: actorUserId,
        content: commentText(actorName)
    })

    await logAuditEntry({
        userId: actorUserId,
        action: auditAction,
        entityType: "concern",
        entityId: concernId,
        summary: auditSummary
    })

    revalidatePath("/dashboard/manage-concerns")
    return ok(undefined, successMessage)
}

export const closeConcern = withAction(
    async (concernId: number): Promise<ActionResult> => {
        await requireSession()
        return setConcernStatus(
            concernId,
            "closed",
            (actorName) => `${actorName} closed this concern.`,
            "close_concern",
            `Closed concern #${concernId}`,
            "Concern closed."
        )
    }
)

export const reopenConcern = withAction(
    async (concernId: number): Promise<ActionResult> => {
        await requireSession()
        return setConcernStatus(
            concernId,
            "active",
            (actorName) =>
                `${actorName} reopened this concern and changed status to active.`,
            "reopen_concern",
            `Reopened concern #${concernId}`,
            "Concern reopened."
        )
    }
)

export const markConcernAsSpam = withAction(
    async (concernId: number): Promise<ActionResult> => {
        await requireSession()
        return setConcernStatus(
            concernId,
            "spam",
            (actorName) => `${actorName} marked this concern as spam.`,
            "mark_concern_spam",
            `Marked concern #${concernId} as spam`,
            "Concern marked as spam."
        )
    }
)

export const unmarkConcernAsSpam = withAction(
    async (concernId: number): Promise<ActionResult> => {
        await requireSession()
        return setConcernStatus(
            concernId,
            "new",
            (actorName) =>
                `${actorName} removed the spam mark and returned this concern to new.`,
            "unmark_concern_spam",
            `Removed spam mark from concern #${concernId}`,
            "Concern returned to new."
        )
    }
)

export async function getAssignableUsers(): Promise<AssignableUser[]> {
    const config = await getSeasonConfig()
    const canView = config.seasonId
        ? await hasPermissionBySession("concerns:view", {
              seasonId: config.seasonId
          })
        : false
    if (!canView) return []

    try {
        // Get only users with the ombudsman role
        const rows = await db
            .select({
                id: userRoles.user_id,
                role: userRoles.role,
                name: users.name
            })
            .from(userRoles)
            .leftJoin(users, eq(userRoles.user_id, users.id))
            .where(eq(userRoles.role, "ombudsman"))

        const seen = new Set<string>()
        const result: AssignableUser[] = []

        for (const r of rows) {
            if (!seen.has(r.id)) {
                seen.add(r.id)
                result.push({ id: r.id, name: r.name ?? r.id, role: r.role })
            }
        }

        return result.sort((a, b) => a.name.localeCompare(b.name))
    } catch (error) {
        console.error("Error fetching assignable users:", error)
        return []
    }
}
