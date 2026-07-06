"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import {
    inboundEmails,
    inboundEmailComments,
    inboundEmailReplies,
    inboundEmailReceived,
    users,
    userRoles
} from "@/database/schema"
import { eq, desc, or, asc } from "drizzle-orm"
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
async function requireEmailViewOrManage(): Promise<void> {
    const config = await requireSeasonConfig()
    const canView = await hasPermissionBySession("admin_emails:view", {
        seasonId: config.seasonId
    })
    if (canView) return
    const canManage = await hasPermissionBySession("admin_emails:manage", {
        seasonId: config.seasonId
    })
    if (!canManage) throw new ActionError("Unauthorized.")
}

export interface InboundEmailRow {
    id: number
    email_id: string
    from_address: string
    from_name: string | null
    from_user_id: string | null
    to_address: string
    subject: string
    body_text: string | null
    body_html: string | null
    status: string
    assigned_to: string | null
    assigned_to_name: string | null
    created_at: Date
    updated_at: Date
}

export interface InboundEmailComment {
    id: number
    email_id: number
    author_id: string
    author_name: string
    content: string
    created_at: Date
}

export interface InboundEmailReply {
    id: number
    email_id: number
    sent_by: string
    sent_by_name: string
    subject: string
    body_text: string
    sent_to: string
    sent_at: Date
}

export interface InboundEmailReceived {
    id: number
    email_id: number
    from_address: string
    from_name: string | null
    subject: string
    body_text: string | null
    body_html: string | null
    received_at: Date
}

export type ThreadItem =
    | ({ type: "comment" } & InboundEmailComment)
    | ({ type: "reply" } & InboundEmailReply)
    | ({ type: "received" } & InboundEmailReceived)

export interface AssignableAdmin {
    id: string
    name: string
}

export const getInboundEmails = withAction(
    async (): Promise<ActionResult<InboundEmailRow[]>> => {
        const config = await requireSeasonConfig()
        await requirePermission("admin_emails:view", {
            seasonId: config.seasonId
        })

        const rows = await db
            .select({
                id: inboundEmails.id,
                email_id: inboundEmails.email_id,
                from_address: inboundEmails.from_address,
                from_name: inboundEmails.from_name,
                from_user_id: users.id,
                to_address: inboundEmails.to_address,
                subject: inboundEmails.subject,
                body_text: inboundEmails.body_text,
                body_html: inboundEmails.body_html,
                status: inboundEmails.status,
                assigned_to: inboundEmails.assigned_to,
                created_at: inboundEmails.created_at,
                updated_at: inboundEmails.updated_at
            })
            .from(inboundEmails)
            .leftJoin(users, eq(inboundEmails.from_address, users.email))
            .orderBy(desc(inboundEmails.created_at))

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

        const result: InboundEmailRow[] = rows.map((r) => ({
            id: r.id,
            email_id: r.email_id,
            from_address: r.from_address,
            from_name: r.from_name,
            from_user_id: r.from_user_id ?? null,
            to_address: r.to_address,
            subject: r.subject,
            body_text: r.body_text,
            body_html: r.body_html,
            status: r.status,
            assigned_to: r.assigned_to,
            assigned_to_name: r.assigned_to
                ? (assigneeMap.get(r.assigned_to) ?? r.assigned_to)
                : null,
            created_at: r.created_at,
            updated_at: r.updated_at
        }))

        return ok(result)
    }
)

export const getEmailThread = withAction(
    async (emailId: number): Promise<ActionResult<ThreadItem[]>> => {
        const config = await requireSeasonConfig()
        await requirePermission("admin_emails:view", {
            seasonId: config.seasonId
        })

        const [commentRows, replyRows, receivedRows] = await Promise.all([
            db
                .select({
                    id: inboundEmailComments.id,
                    email_id: inboundEmailComments.email_id,
                    author_id: inboundEmailComments.author_id,
                    author_name: users.name,
                    content: inboundEmailComments.content,
                    created_at: inboundEmailComments.created_at
                })
                .from(inboundEmailComments)
                .leftJoin(users, eq(inboundEmailComments.author_id, users.id))
                .where(eq(inboundEmailComments.email_id, emailId))
                .orderBy(asc(inboundEmailComments.created_at)),
            db
                .select({
                    id: inboundEmailReplies.id,
                    email_id: inboundEmailReplies.email_id,
                    sent_by: inboundEmailReplies.sent_by,
                    sent_by_name: users.name,
                    subject: inboundEmailReplies.subject,
                    body_text: inboundEmailReplies.body_text,
                    sent_to: inboundEmailReplies.sent_to,
                    sent_at: inboundEmailReplies.sent_at
                })
                .from(inboundEmailReplies)
                .leftJoin(users, eq(inboundEmailReplies.sent_by, users.id))
                .where(eq(inboundEmailReplies.email_id, emailId))
                .orderBy(asc(inboundEmailReplies.sent_at)),
            db
                .select({
                    id: inboundEmailReceived.id,
                    email_id: inboundEmailReceived.email_id,
                    from_address: inboundEmailReceived.from_address,
                    from_name: inboundEmailReceived.from_name,
                    subject: inboundEmailReceived.subject,
                    body_text: inboundEmailReceived.body_text,
                    body_html: inboundEmailReceived.body_html,
                    received_at: inboundEmailReceived.received_at
                })
                .from(inboundEmailReceived)
                .where(eq(inboundEmailReceived.email_id, emailId))
                .orderBy(asc(inboundEmailReceived.received_at))
        ])

        const comments: ThreadItem[] = commentRows.map((r) => ({
            type: "comment" as const,
            id: r.id,
            email_id: r.email_id,
            author_id: r.author_id,
            author_name: r.author_name ?? r.author_id,
            content: r.content,
            created_at: r.created_at
        }))

        const replies: ThreadItem[] = replyRows.map((r) => ({
            type: "reply" as const,
            id: r.id,
            email_id: r.email_id,
            sent_by: r.sent_by,
            sent_by_name: r.sent_by_name ?? r.sent_by,
            subject: r.subject,
            body_text: r.body_text,
            sent_to: r.sent_to,
            sent_at: r.sent_at
        }))

        const received: ThreadItem[] = receivedRows.map((r) => ({
            type: "received" as const,
            id: r.id,
            email_id: r.email_id,
            from_address: r.from_address,
            from_name: r.from_name,
            subject: r.subject,
            body_text: r.body_text,
            body_html: r.body_html,
            received_at: r.received_at
        }))

        // Merge and sort chronologically
        const items = [...comments, ...replies, ...received].sort((a, b) => {
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

export const sendEmailReply = withAction(
    async (emailId: number, body: string): Promise<ActionResult> => {
        const session = await requireSession()
        await requireEmailViewOrManage()
        const userId = session.user.id

        requireNonEmptyString(body, "Reply")

        // Load the original email
        const [email] = await db
            .select({
                email_id: inboundEmails.email_id,
                from_address: inboundEmails.from_address,
                subject: inboundEmails.subject,
                status: inboundEmails.status
            })
            .from(inboundEmails)
            .where(eq(inboundEmails.id, emailId))
            .limit(1)

        if (!email) return fail("Email not found.")
        if (email.status !== "active") {
            return fail("Can only reply to active emails.")
        }

        const cleanSubject = email.subject.replace(/^(Re:\s*)+/i, "").trim()
        const replySubject = `Re: Email #${emailId}: ${cleanSubject}`

        const bodyHtml = `<div style="font-family:sans-serif;font-size:14px;white-space:pre-wrap">${body.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`

        const postmarkMessageId = await sendEmail({
            from: site.mailFrom,
            to: email.from_address,
            subject: replySubject,
            htmlBody: bodyHtml,
            textBody: body.trim(),
            inReplyTo: email.email_id,
            headers: [{ name: "X-BSD-Ticket-ID", value: `email-${emailId}` }]
        })

        await db.insert(inboundEmailReplies).values({
            email_id: emailId,
            sent_by: userId,
            subject: replySubject,
            body_text: body.trim(),
            sent_to: email.from_address,
            postmark_message_id: postmarkMessageId
        })

        await logAuditEntry({
            userId,
            action: "send_email_reply",
            entityType: "inbound_email",
            entityId: emailId,
            summary: `Sent a reply on inbound email #${emailId}`
        })

        revalidatePath("/dashboard/manage-emails")
        return ok(undefined, "Reply sent.")
    }
)

export const addInboundEmailComment = withAction(
    async (emailId: number, content: string): Promise<ActionResult> => {
        const session = await requireSession()
        await requireEmailViewOrManage()
        const userId = session.user.id

        requireNonEmptyString(content, "Comment")

        await db.insert(inboundEmailComments).values({
            email_id: emailId,
            author_id: userId,
            content: content.trim()
        })
        await logAuditEntry({
            userId,
            action: "add_email_comment",
            entityType: "inbound_email",
            entityId: emailId,
            summary: `Added a comment on inbound email #${emailId}`
        })
        revalidatePath("/dashboard/manage-emails")
        return ok(undefined, "Comment added.")
    }
)

export const assignInboundEmail = withAction(
    async (
        emailId: number,
        assigneeId: string | null
    ): Promise<ActionResult> => {
        const session = await requireSession()
        const config = await requireSeasonConfig()
        await requirePermission("admin_emails:manage", {
            seasonId: config.seasonId
        })
        const actorUserId = session.user.id

        const [actor] = await db
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, actorUserId))
            .limit(1)
        const actorName = actor?.name ?? actorUserId

        const [existing] = await db
            .select({
                status: inboundEmails.status,
                subject: inboundEmails.subject,
                from_address: inboundEmails.from_address,
                from_name: inboundEmails.from_name
            })
            .from(inboundEmails)
            .where(eq(inboundEmails.id, emailId))
            .limit(1)

        if (!existing) {
            return fail("Email not found.")
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
            existing.status === "new" && assigneeId !== null
        const nextStatus = shouldMoveToActive
            ? ("active" as const)
            : existing.status

        await db
            .update(inboundEmails)
            .set({
                assigned_to: assigneeId,
                status: nextStatus,
                updated_at: new Date()
            })
            .where(eq(inboundEmails.id, emailId))

        const assignmentComment = assigneeId
            ? shouldMoveToActive
                ? `${actorName} assigned this email to ${assigneeName} and changed status to active.`
                : `${actorName} assigned this email to ${assigneeName}.`
            : `${actorName} unassigned this email.`

        await db.insert(inboundEmailComments).values({
            email_id: emailId,
            author_id: actorUserId,
            content: assignmentComment
        })

        await logAuditEntry({
            userId: actorUserId,
            action: "assign_inbound_email",
            entityType: "inbound_email",
            entityId: emailId,
            summary: assigneeId
                ? `Assigned inbound email #${emailId} to ${assigneeName}`
                : `Unassigned inbound email #${emailId}`
        })

        if (assigneeId && assigneeId !== actorUserId && assigneeEmail) {
            const senderLabel = existing.from_name
                ? `${existing.from_name} <${existing.from_address}>`
                : existing.from_address
            const link = `${site.url}/dashboard/manage-emails`
            const subjectLine = `[BSD] An email has been assigned to you: ${existing.subject}`
            const textBody = [
                `Hi ${assigneeName ?? "there"},`,
                "",
                `${actorName} has assigned an email to you.`,
                "",
                `Subject: ${existing.subject}`,
                `From: ${senderLabel}`,
                "",
                `View it here: ${link}`
            ].join("\n")
            const htmlBody = `
                <div style="font-family:sans-serif;font-size:14px;line-height:1.5">
                    <p>Hi ${assigneeName ?? "there"},</p>
                    <p><strong>${actorName}</strong> has assigned an email to you.</p>
                    <p>
                        <strong>Subject:</strong> ${existing.subject}<br/>
                        <strong>From:</strong> ${senderLabel}
                    </p>
                    <p><a href="${link}">Open Manage Emails</a></p>
                </div>
            `
            try {
                await sendEmail({
                    from: site.mailFrom,
                    to: assigneeEmail,
                    subject: subjectLine,
                    htmlBody,
                    textBody,
                    tag: "email-assignment"
                })
            } catch (notifyError) {
                console.error(
                    "Failed to send email-assignment notification:",
                    notifyError
                )
            }
        }

        revalidatePath("/dashboard/manage-emails")
        return ok(undefined, "Email assigned.")
    }
)

async function setInboundEmailStatus(
    emailId: number,
    status: "closed" | "active" | "new" | "spam",
    commentText: (actorName: string) => string,
    auditAction: string,
    auditSummary: string,
    successMessage: string
): Promise<ActionResult> {
    const session = await requireSession()
    const config = await requireSeasonConfig()
    await requirePermission("admin_emails:manage", {
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
        .update(inboundEmails)
        .set({ status, updated_at: new Date() })
        .where(eq(inboundEmails.id, emailId))

    await db.insert(inboundEmailComments).values({
        email_id: emailId,
        author_id: actorUserId,
        content: commentText(actorName)
    })

    await logAuditEntry({
        userId: actorUserId,
        action: auditAction,
        entityType: "inbound_email",
        entityId: emailId,
        summary: auditSummary
    })

    revalidatePath("/dashboard/manage-emails")
    return ok(undefined, successMessage)
}

export const closeInboundEmail = withAction(
    async (emailId: number): Promise<ActionResult> => {
        await requireSession()
        return setInboundEmailStatus(
            emailId,
            "closed",
            (actorName) => `${actorName} closed this email.`,
            "close_inbound_email",
            `Closed inbound email #${emailId}`,
            "Email closed."
        )
    }
)

export const reopenInboundEmail = withAction(
    async (emailId: number): Promise<ActionResult> => {
        await requireSession()
        return setInboundEmailStatus(
            emailId,
            "active",
            (actorName) =>
                `${actorName} reopened this email and changed status to active.`,
            "reopen_inbound_email",
            `Reopened inbound email #${emailId}`,
            "Email reopened."
        )
    }
)

export const markInboundEmailAsSpam = withAction(
    async (emailId: number): Promise<ActionResult> => {
        await requireSession()
        return setInboundEmailStatus(
            emailId,
            "spam",
            (actorName) => `${actorName} marked this email as spam.`,
            "mark_inbound_email_spam",
            `Marked inbound email #${emailId} as spam`,
            "Email marked as spam."
        )
    }
)

export const unmarkInboundEmailAsSpam = withAction(
    async (emailId: number): Promise<ActionResult> => {
        await requireSession()
        return setInboundEmailStatus(
            emailId,
            "new",
            (actorName) =>
                `${actorName} removed the spam mark and returned this email to new.`,
            "unmark_inbound_email_spam",
            `Removed spam mark from inbound email #${emailId}`,
            "Email returned to new."
        )
    }
)

export async function getAssignableAdmins(): Promise<AssignableAdmin[]> {
    const config = await getSeasonConfig()
    const canView = config.seasonId
        ? await hasPermissionBySession("admin_emails:view", {
              seasonId: config.seasonId
          })
        : false
    if (!canView) return []

    try {
        const rows = await db
            .select({
                id: userRoles.user_id,
                name: users.name
            })
            .from(userRoles)
            .leftJoin(users, eq(userRoles.user_id, users.id))
            .where(eq(userRoles.role, "admin"))

        const seen = new Set<string>()
        const result: AssignableAdmin[] = []

        for (const r of rows) {
            if (!seen.has(r.id)) {
                seen.add(r.id)
                result.push({ id: r.id, name: r.name ?? r.id })
            }
        }

        return result.sort((a, b) => a.name.localeCompare(b.name))
    } catch (error) {
        console.error("Error fetching assignable admins:", error)
        return []
    }
}
