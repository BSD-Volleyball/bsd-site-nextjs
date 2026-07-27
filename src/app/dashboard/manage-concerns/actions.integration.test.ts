import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import { concernComments, concernReplies, concerns } from "@/database/schema"
import { sendEmail } from "@/lib/postmark"
import { createSeason } from "@/test/factories"
import { createUserWithRoles } from "@/test/session"
import {
    addConcernComment,
    getConcerns,
    sendConcernReply,
    updateConcernStatus
} from "./actions"

async function insertConcern(
    overrides: Partial<typeof concerns.$inferInsert> = {}
) {
    const [row] = await db
        .insert(concerns)
        .values({
            incident_date: "2026-07-01",
            location: "Court 2",
            person_involved: "Somebody",
            description: "Test concern",
            status: "new",
            ...overrides
        })
        .returning()
    return row
}

beforeEach(() => {
    process.env.INBOUND_CONCERN_ADDRESS = "concerns@bsd.test"
})

describe("getConcerns", () => {
    it("rejects unauthenticated callers", async () => {
        await createSeason()
        const result = await getConcerns()
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("rejects roles without concerns:view (captain)", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "captain" }])
        const result = await getConcerns()
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("returns concern rows for an ombudsman", async () => {
        await createSeason()
        const concern = await insertConcern()
        await createUserWithRoles([{ role: "ombudsman" }])

        const result = await getConcerns()
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected rows")
        expect(result.data).toHaveLength(1)
        expect(result.data[0]).toMatchObject({
            id: concern.id,
            status: "new",
            description: "Test concern"
        })
    })
})

describe("addConcernComment", () => {
    it("rejects roles without view or manage permission", async () => {
        await createSeason()
        const concern = await insertConcern()
        await createUserWithRoles([{ role: "captain" }])
        const result = await addConcernComment(concern.id, "hello")
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("rejects an empty comment", async () => {
        await createSeason()
        const concern = await insertConcern()
        await createUserWithRoles([{ role: "ombudsman" }])
        const result = await addConcernComment(concern.id, "   ")
        expect(result).toEqual({
            status: false,
            message: "Comment is required."
        })
    })

    it("stores a comment for an ombudsman (requireAnyPermission path)", async () => {
        await createSeason()
        const concern = await insertConcern()
        const ombudsman = await createUserWithRoles([{ role: "ombudsman" }])

        const result = await addConcernComment(concern.id, "Following up")
        expect(result.status).toBe(true)

        const rows = await db
            .select()
            .from(concernComments)
            .where(eq(concernComments.concern_id, concern.id))
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            author_id: ombudsman.id,
            content: "Following up"
        })
    })
})

describe("updateConcernStatus", () => {
    it("rejects roles without concerns:manage", async () => {
        await createSeason()
        const concern = await insertConcern()
        await createUserWithRoles([{ role: "captain" }])
        const result = await updateConcernStatus(concern.id, "active")
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("updates the status for an ombudsman", async () => {
        await createSeason()
        const concern = await insertConcern()
        await createUserWithRoles([{ role: "ombudsman" }])

        const result = await updateConcernStatus(concern.id, "active")
        expect(result.status).toBe(true)

        const [row] = await db
            .select({ status: concerns.status })
            .from(concerns)
            .where(eq(concerns.id, concern.id))
        expect(row.status).toBe("active")
    })
})

describe("sendConcernReply", () => {
    it("rejects an empty reply body", async () => {
        await createSeason()
        const concern = await insertConcern({ status: "active" })
        await createUserWithRoles([{ role: "ombudsman" }])
        const result = await sendConcernReply(concern.id, "  ")
        expect(result).toEqual({
            status: false,
            message: "Reply is required."
        })
    })

    it("only replies to active concerns", async () => {
        await createSeason()
        const concern = await insertConcern({ status: "new" })
        await createUserWithRoles([{ role: "ombudsman" }])
        const result = await sendConcernReply(concern.id, "Hi there")
        expect(result).toEqual({
            status: false,
            message: "Can only reply to active concerns."
        })
    })

    it("sends the reply email and records it", async () => {
        await createSeason()
        const concern = await insertConcern({
            status: "active",
            contact_email: "reporter@example.test"
        })
        const ombudsman = await createUserWithRoles([{ role: "ombudsman" }])

        const result = await sendConcernReply(concern.id, "We are on it")
        expect(result.status).toBe(true)

        expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1)
        expect(vi.mocked(sendEmail).mock.calls[0][0]).toMatchObject({
            to: "reporter@example.test",
            subject: `Re: Concern #${concern.id}`
        })

        const rows = await db
            .select()
            .from(concernReplies)
            .where(eq(concernReplies.concern_id, concern.id))
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            sent_by: ombudsman.id,
            sent_to: "reporter@example.test",
            body_text: "We are on it",
            postmark_message_id: "test-message-id"
        })
    })
})
