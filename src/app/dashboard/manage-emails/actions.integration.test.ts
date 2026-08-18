import { asc, eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    inboundEmailComments,
    inboundEmailReplies,
    inboundEmails
} from "@/database/schema"
import { sentMessages } from "@/test/email"
import { createSeason } from "@/test/factories"
import { createUserWithRoles, logout } from "@/test/session"
import { quickReplyInboundEmail, sendEmailReplyAndClose } from "./actions"

async function createInboundEmail(
    overrides: Partial<typeof inboundEmails.$inferInsert> = {}
) {
    const [row] = await db
        .insert(inboundEmails)
        .values({
            email_id: `pm-${crypto.randomUUID()}`,
            from_address: "player@example.test",
            from_name: "Pat Player",
            to_address: "info@bsdvolleyball.test",
            subject: "Question about tryouts",
            body_text: "When are tryouts?",
            status: "new",
            ...overrides
        })
        .returning()
    return row
}

async function loadEmail(id: number) {
    const [row] = await db
        .select()
        .from(inboundEmails)
        .where(eq(inboundEmails.id, id))
    return row
}

async function repliesFor(id: number) {
    return db
        .select()
        .from(inboundEmailReplies)
        .where(eq(inboundEmailReplies.email_id, id))
}

async function commentsFor(id: number) {
    return db
        .select({ content: inboundEmailComments.content })
        .from(inboundEmailComments)
        .where(eq(inboundEmailComments.email_id, id))
        .orderBy(asc(inboundEmailComments.id))
}

beforeEach(async () => {
    await createSeason()
})

describe("sendEmailReplyAndClose", () => {
    it("sends the reply and closes an active email as admin", async () => {
        const admin = await createUserWithRoles([{ role: "admin" }])
        const email = await createInboundEmail({
            status: "active",
            assigned_to: admin.id
        })

        const result = await sendEmailReplyAndClose(
            email.id,
            "Tryouts are Saturday."
        )
        expect(result.status).toBe(true)

        const after = await loadEmail(email.id)
        expect(after.status).toBe("closed")

        const replies = await repliesFor(email.id)
        expect(replies).toHaveLength(1)
        expect(replies[0].sent_by).toBe(admin.id)
        expect(replies[0].body_text).toBe("Tryouts are Saturday.")

        const sent = sentMessages()
        expect(sent).toHaveLength(1)
        expect(sent[0].to).toBe("player@example.test")
        expect(sent[0].textBody).toBe("Tryouts are Saturday.")

        const comments = await commentsFor(email.id)
        expect(comments.at(-1)?.content).toContain("closed this email")
    })

    it("refuses to reply to a new email (send/close only applies to active)", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const email = await createInboundEmail({ status: "new" })

        const result = await sendEmailReplyAndClose(email.id, "Hello")
        expect(result.status).toBe(false)

        expect((await loadEmail(email.id)).status).toBe("new")
        expect(sentMessages()).toHaveLength(0)
    })

    it("rejects an authenticated non-admin without sending", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const email = await createInboundEmail({ status: "active" })

        const result = await sendEmailReplyAndClose(email.id, "Hello")
        expect(result).toEqual({ status: false, message: "Unauthorized." })

        expect((await loadEmail(email.id)).status).toBe("active")
        expect(await repliesFor(email.id)).toHaveLength(0)
        expect(sentMessages()).toHaveLength(0)
    })

    it("rejects an unauthenticated caller", async () => {
        logout()
        const email = await createInboundEmail({ status: "active" })

        const result = await sendEmailReplyAndClose(email.id, "Hello")
        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
        expect(sentMessages()).toHaveLength(0)
    })

    it("rejects an empty reply body", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const email = await createInboundEmail({ status: "active" })

        const result = await sendEmailReplyAndClose(email.id, "   ")
        expect(result.status).toBe(false)
        expect((await loadEmail(email.id)).status).toBe("active")
        expect(sentMessages()).toHaveLength(0)
    })
})

describe("quickReplyInboundEmail", () => {
    it("assigns to the caller, sends the reply, and closes a new email", async () => {
        const admin = await createUserWithRoles([{ role: "admin" }])
        const email = await createInboundEmail({ status: "new" })

        const result = await quickReplyInboundEmail(
            email.id,
            "Tryouts are Saturday."
        )
        expect(result.status).toBe(true)

        const after = await loadEmail(email.id)
        expect(after.status).toBe("closed")
        expect(after.assigned_to).toBe(admin.id)

        const replies = await repliesFor(email.id)
        expect(replies).toHaveLength(1)
        expect(replies[0].sent_by).toBe(admin.id)
        expect(replies[0].sent_to).toBe("player@example.test")

        // Only the reply goes out — no "assigned to you" notice for a
        // self-assignment.
        const sent = sentMessages()
        expect(sent).toHaveLength(1)
        expect(sent[0].to).toBe("player@example.test")

        // Thread records each step: assign (→ active), then close.
        const comments = (await commentsFor(email.id)).map((c) => c.content)
        expect(comments[0]).toContain("changed status to active")
        expect(comments.at(-1)).toContain("closed this email")
    })

    it("refuses emails that are not new", async () => {
        const admin = await createUserWithRoles([{ role: "admin" }])
        for (const status of ["active", "closed", "spam"] as const) {
            const email = await createInboundEmail({
                status,
                assigned_to: admin.id
            })
            const result = await quickReplyInboundEmail(email.id, "Hello")
            expect(result.status).toBe(false)
            expect((await loadEmail(email.id)).status).toBe(status)
        }
        expect(sentMessages()).toHaveLength(0)
    })

    it("returns not-found for a missing email", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await quickReplyInboundEmail(999_999, "Hello")
        expect(result).toEqual({ status: false, message: "Email not found." })
    })

    it("rejects an authenticated non-admin without touching the email", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const email = await createInboundEmail({ status: "new" })

        const result = await quickReplyInboundEmail(email.id, "Hello")
        expect(result).toEqual({ status: false, message: "Unauthorized." })

        const after = await loadEmail(email.id)
        expect(after.status).toBe("new")
        expect(after.assigned_to).toBeNull()
        expect(sentMessages()).toHaveLength(0)
    })

    it("rejects an unauthenticated caller", async () => {
        logout()
        const email = await createInboundEmail({ status: "new" })

        const result = await quickReplyInboundEmail(email.id, "Hello")
        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
        expect((await loadEmail(email.id)).status).toBe("new")
    })

    it("rejects an empty reply body before assigning", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const email = await createInboundEmail({ status: "new" })

        const result = await quickReplyInboundEmail(email.id, "  ")
        expect(result.status).toBe(false)

        const after = await loadEmail(email.id)
        expect(after.status).toBe("new")
        expect(after.assigned_to).toBeNull()
    })
})
