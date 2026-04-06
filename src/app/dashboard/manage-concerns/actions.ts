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
import { hasPermissionBySession, getSessionUserId } from "@/lib/rbac"
import { getSeasonConfig } from "@/lib/site-config"
import { sendEmail } from "@/lib/postmark"

async function hasConcernPermission(
    permission: "concerns:view" | "concerns:manage"
): Promise<boolean> {
    const config = await getSeasonConfig()
    if (!config.seasonId) return false
    return hasPermissionBySession(permission, { seasonId: config.seasonId })
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

export async function getConcerns(): Promise<{
    status: boolean
    message?: string
    concerns: ConcernRow[]
}> {
    const canView = await hasConcernPermission("concerns:view")
    if (!canView) {
        return { status: false, message: "Unauthorized.", concerns: [] }
    }

    try {
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

        return { status: true, concerns: result }
    } catch (error) {
        console.error("Error fetching concerns:", error)
        return {
            status: false,
            message: "Failed to load concerns.",
            concerns: []
        }
    }
}

export async function getConcernComments(
    concernId: number
): Promise<{ status: boolean; comments: ConcernComment[] }> {
    const canView = await hasConcernPermission("concerns:view")
    if (!canView) {
        return { status: false, comments: [] }
    }

    try {
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

        return {
            status: true,
            comments: rows.map((r) => ({
                id: r.id,
                concern_id: r.concern_id,
                author_id: r.author_id,
                author_name: r.author_name ?? r.author_id,
                content: r.content,
                created_at: r.created_at
            }))
        }
    } catch (error) {
        console.error("Error fetching concern comments:", error)
        return { status: false, comments: [] }
    }
}

export async function getConcernThread(
    concernId: number
): Promise<{ status: boolean; items: ConcernThreadItem[] }> {
    const canView = await hasConcernPermission("concerns:view")
    if (!canView) {
        return { status: false, items: [] }
    }

    try {
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

        return { status: true, items }
    } catch (error) {
        console.error("Error fetching concern thread:", error)
        return { status: false, items: [] }
    }
}

export async function sendConcernReply(
    concernId: number,
    body: string
): Promise<{ status: boolean; message: string }> {
    const canManage = await hasConcernPermission("concerns:manage")
    const canView = await hasConcernPermission("concerns:view")
    if (!canManage && !canView) {
        return { status: false, message: "Unauthorized." }
    }

    const userId = await getSessionUserId()
    if (!userId) {
        return { status: false, message: "Not authenticated." }
    }

    if (!body?.trim()) {
        return { status: false, message: "Reply cannot be empty." }
    }

    const fromAddress = process.env.INBOUND_CONCERN_ADDRESS
    if (!fromAddress) {
        return {
            status: false,
            message: "Concern reply address is not configured."
        }
    }

    const [concern] = await db
        .select()
        .from(concerns)
        .where(eq(concerns.id, concernId))
        .limit(1)

    if (!concern) {
        return { status: false, message: "Concern not found." }
    }
    if (concern.status !== "active") {
        return { status: false, message: "Can only reply to active concerns." }
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
        return {
            status: false,
            message: "No reply address available for this concern."
        }
    }

    const subject = `Re: Concern #${concernId}`

    try {
        const postmarkMessageId = await sendEmail({
            from: fromAddress,
            to: replyTo,
            subject,
            htmlBody: `<p>${body.trim().replace(/\n/g, "<br>")}</p>`,
            textBody: body.trim(),
            stream: "outbound",
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

        revalidatePath("/dashboard/manage-concerns")
        return { status: true, message: "Reply sent." }
    } catch (error) {
        console.error("Error sending concern reply:", error)
        return { status: false, message: "Failed to send reply." }
    }
}

export async function addConcernComment(
    concernId: number,
    content: string
): Promise<{ status: boolean; message: string }> {
    const canManage = await hasConcernPermission("concerns:manage")
    const canView = await hasConcernPermission("concerns:view")
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
        await db.insert(concernComments).values({
            concern_id: concernId,
            author_id: userId,
            content: content.trim()
        })
        revalidatePath("/dashboard/manage-concerns")
        return { status: true, message: "Comment added." }
    } catch (error) {
        console.error("Error adding comment:", error)
        return { status: false, message: "Failed to add comment." }
    }
}

export async function updateConcernStatus(
    concernId: number,
    status: "new" | "active" | "closed"
): Promise<{ status: boolean; message: string }> {
    const canManage = await hasConcernPermission("concerns:manage")
    if (!canManage) {
        return { status: false, message: "Unauthorized." }
    }

    try {
        await db
            .update(concerns)
            .set({ status, updated_at: new Date() })
            .where(eq(concerns.id, concernId))
        revalidatePath("/dashboard/manage-concerns")
        return { status: true, message: "Status updated." }
    } catch (error) {
        console.error("Error updating concern status:", error)
        return { status: false, message: "Failed to update status." }
    }
}

export async function assignConcern(
    concernId: number,
    assigneeId: string | null
): Promise<{ status: boolean; message: string }> {
    const canManage = await hasConcernPermission("concerns:manage")
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

        const [existingConcern] = await db
            .select({
                status: concerns.status
            })
            .from(concerns)
            .where(eq(concerns.id, concernId))
            .limit(1)

        if (!existingConcern) {
            return { status: false, message: "Concern not found." }
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

        revalidatePath("/dashboard/manage-concerns")
        return { status: true, message: "Concern assigned." }
    } catch (error) {
        console.error("Error assigning concern:", error)
        return { status: false, message: "Failed to assign concern." }
    }
}

export async function closeConcern(
    concernId: number
): Promise<{ status: boolean; message: string }> {
    const canManage = await hasConcernPermission("concerns:manage")
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
            .update(concerns)
            .set({ status: "closed", updated_at: new Date() })
            .where(eq(concerns.id, concernId))

        await db.insert(concernComments).values({
            concern_id: concernId,
            author_id: actorUserId,
            content: `${actorName} closed this concern.`
        })

        revalidatePath("/dashboard/manage-concerns")
        return { status: true, message: "Concern closed." }
    } catch (error) {
        console.error("Error closing concern:", error)
        return { status: false, message: "Failed to close concern." }
    }
}

export async function reopenConcern(
    concernId: number
): Promise<{ status: boolean; message: string }> {
    const canManage = await hasConcernPermission("concerns:manage")
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
            .update(concerns)
            .set({ status: "active", updated_at: new Date() })
            .where(eq(concerns.id, concernId))

        await db.insert(concernComments).values({
            concern_id: concernId,
            author_id: actorUserId,
            content: `${actorName} reopened this concern and changed status to active.`
        })

        revalidatePath("/dashboard/manage-concerns")
        return { status: true, message: "Concern reopened." }
    } catch (error) {
        console.error("Error reopening concern:", error)
        return { status: false, message: "Failed to reopen concern." }
    }
}

export async function getAssignableUsers(): Promise<AssignableUser[]> {
    const canView = await hasConcernPermission("concerns:view")
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

export async function getHasConcernsAccess(): Promise<boolean> {
    return hasConcernPermission("concerns:view")
}
