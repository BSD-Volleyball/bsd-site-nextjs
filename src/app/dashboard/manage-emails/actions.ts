"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import {
    inboundEmails,
    inboundEmailComments,
    inboundEmailReplies,
    users,
    userRoles
} from "@/database/schema"
import { eq, desc, or, asc } from "drizzle-orm"
import { hasPermissionBySession, getSessionUserId } from "@/lib/rbac"
import { getSeasonConfig } from "@/lib/site-config"
import { sendEmail } from "@/lib/postmark"
import { site } from "@/config/site"

async function hasAdminEmailPermission(
    permission: "admin_emails:view" | "admin_emails:manage"
): Promise<boolean> {
    const config = await getSeasonConfig()
    if (!config.seasonId) return false
    return hasPermissionBySession(permission, { seasonId: config.seasonId })
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
    sent_at: Date
}

export type ThreadItem =
    | ({ type: "comment" } & InboundEmailComment)
    | ({ type: "reply" } & InboundEmailReply)

export interface AssignableAdmin {
    id: string
    name: string
}

export async function getInboundEmails(): Promise<{
    status: boolean
    message?: string
    emails: InboundEmailRow[]
}> {
    const canView = await hasAdminEmailPermission("admin_emails:view")
    if (!canView) {
        return { status: false, message: "Unauthorized.", emails: [] }
    }

    try {
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

        return { status: true, emails: result }
    } catch (error) {
        console.error("Error fetching inbound emails:", error)
        return {
            status: false,
            message: "Failed to load emails.",
            emails: []
        }
    }
}

export async function getEmailThread(
    emailId: number
): Promise<{ status: boolean; items: ThreadItem[] }> {
    const canView = await hasAdminEmailPermission("admin_emails:view")
    if (!canView) return { status: false, items: [] }

    try {
        const [commentRows, replyRows] = await Promise.all([
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
                    sent_at: inboundEmailReplies.sent_at
                })
                .from(inboundEmailReplies)
                .leftJoin(users, eq(inboundEmailReplies.sent_by, users.id))
                .where(eq(inboundEmailReplies.email_id, emailId))
                .orderBy(asc(inboundEmailReplies.sent_at))
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
            sent_at: r.sent_at
        }))

        // Merge and sort chronologically
        const items = [...comments, ...replies].sort((a, b) => {
            const aTime =
                a.type === "comment"
                    ? a.created_at.getTime()
                    : a.sent_at.getTime()
            const bTime =
                b.type === "comment"
                    ? b.created_at.getTime()
                    : b.sent_at.getTime()
            return aTime - bTime
        })

        return { status: true, items }
    } catch (error) {
        console.error("Error fetching email thread:", error)
        return { status: false, items: [] }
    }
}

export async function sendEmailReply(
    emailId: number,
    body: string
): Promise<{ status: boolean; message: string }> {
    const canManage = await hasAdminEmailPermission("admin_emails:manage")
    const canView = await hasAdminEmailPermission("admin_emails:view")
    if (!canManage && !canView)
        return { status: false, message: "Unauthorized." }

    const userId = await getSessionUserId()
    if (!userId) return { status: false, message: "Not authenticated." }

    if (!body?.trim())
        return { status: false, message: "Reply cannot be empty." }

    // Load the original email
    const [email] = await db
        .select({
            from_address: inboundEmails.from_address,
            subject: inboundEmails.subject,
            status: inboundEmails.status
        })
        .from(inboundEmails)
        .where(eq(inboundEmails.id, emailId))
        .limit(1)

    if (!email) return { status: false, message: "Email not found." }
    if (email.status !== "active")
        return { status: false, message: "Can only reply to active emails." }

    const replySubject = email.subject.startsWith("Re:")
        ? email.subject
        : `Re: ${email.subject}`

    const bodyHtml = `<div style="font-family:sans-serif;font-size:14px;white-space:pre-wrap">${body.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`

    try {
        await sendEmail({
            from: site.mailFrom,
            to: email.from_address,
            subject: replySubject,
            htmlBody: bodyHtml,
            textBody: body.trim()
        })

        await db.insert(inboundEmailReplies).values({
            email_id: emailId,
            sent_by: userId,
            subject: replySubject,
            body_text: body.trim()
        })

        revalidatePath("/dashboard/manage-emails")
        return { status: true, message: "Reply sent." }
    } catch (error) {
        console.error("Error sending reply:", error)
        return { status: false, message: "Failed to send reply." }
    }
}

export async function addInboundEmailComment(
    emailId: number,
    content: string
): Promise<{ status: boolean; message: string }> {
    const canManage = await hasAdminEmailPermission("admin_emails:manage")
    const canView = await hasAdminEmailPermission("admin_emails:view")
    if (!canManage && !canView) {
        return { status: false, message: "Unauthorized." }
    }

    const userId = await getSessionUserId()
    if (!userId) {
        return { status: false, message: "Not authenticated." }
    }

    if (!content?.trim()) {
        return { status: false, message: "Comment cannot be empty." }
    }

    try {
        await db.insert(inboundEmailComments).values({
            email_id: emailId,
            author_id: userId,
            content: content.trim()
        })
        revalidatePath("/dashboard/manage-emails")
        return { status: true, message: "Comment added." }
    } catch (error) {
        console.error("Error adding email comment:", error)
        return { status: false, message: "Failed to add comment." }
    }
}

export async function assignInboundEmail(
    emailId: number,
    assigneeId: string | null
): Promise<{ status: boolean; message: string }> {
    const canManage = await hasAdminEmailPermission("admin_emails:manage")
    if (!canManage) {
        return { status: false, message: "Unauthorized." }
    }

    const actorUserId = await getSessionUserId()
    if (!actorUserId) {
        return { status: false, message: "Not authenticated." }
    }

    try {
        const [actor] = await db
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, actorUserId))
            .limit(1)
        const actorName = actor?.name ?? actorUserId

        const [existing] = await db
            .select({ status: inboundEmails.status })
            .from(inboundEmails)
            .where(eq(inboundEmails.id, emailId))
            .limit(1)

        if (!existing) {
            return { status: false, message: "Email not found." }
        }

        let assigneeName: string | null = null
        if (assigneeId) {
            const [assignee] = await db
                .select({ name: users.name })
                .from(users)
                .where(eq(users.id, assigneeId))
                .limit(1)
            assigneeName = assignee?.name ?? assigneeId
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

        revalidatePath("/dashboard/manage-emails")
        return { status: true, message: "Email assigned." }
    } catch (error) {
        console.error("Error assigning email:", error)
        return { status: false, message: "Failed to assign email." }
    }
}

export async function closeInboundEmail(
    emailId: number
): Promise<{ status: boolean; message: string }> {
    const canManage = await hasAdminEmailPermission("admin_emails:manage")
    if (!canManage) {
        return { status: false, message: "Unauthorized." }
    }

    const actorUserId = await getSessionUserId()
    if (!actorUserId) {
        return { status: false, message: "Not authenticated." }
    }

    try {
        const [actor] = await db
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, actorUserId))
            .limit(1)
        const actorName = actor?.name ?? actorUserId

        await db
            .update(inboundEmails)
            .set({ status: "closed", updated_at: new Date() })
            .where(eq(inboundEmails.id, emailId))

        await db.insert(inboundEmailComments).values({
            email_id: emailId,
            author_id: actorUserId,
            content: `${actorName} closed this email.`
        })

        revalidatePath("/dashboard/manage-emails")
        return { status: true, message: "Email closed." }
    } catch (error) {
        console.error("Error closing email:", error)
        return { status: false, message: "Failed to close email." }
    }
}

export async function reopenInboundEmail(
    emailId: number
): Promise<{ status: boolean; message: string }> {
    const canManage = await hasAdminEmailPermission("admin_emails:manage")
    if (!canManage) {
        return { status: false, message: "Unauthorized." }
    }

    const actorUserId = await getSessionUserId()
    if (!actorUserId) {
        return { status: false, message: "Not authenticated." }
    }

    try {
        const [actor] = await db
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, actorUserId))
            .limit(1)
        const actorName = actor?.name ?? actorUserId

        await db
            .update(inboundEmails)
            .set({ status: "active", updated_at: new Date() })
            .where(eq(inboundEmails.id, emailId))

        await db.insert(inboundEmailComments).values({
            email_id: emailId,
            author_id: actorUserId,
            content: `${actorName} reopened this email and changed status to active.`
        })

        revalidatePath("/dashboard/manage-emails")
        return { status: true, message: "Email reopened." }
    } catch (error) {
        console.error("Error reopening email:", error)
        return { status: false, message: "Failed to reopen email." }
    }
}

export async function getAssignableAdmins(): Promise<AssignableAdmin[]> {
    const canView = await hasAdminEmailPermission("admin_emails:view")
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
