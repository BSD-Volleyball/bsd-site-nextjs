import { describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import { concerns, userRoles } from "@/database/schema"
import { sendBatchEmails } from "@/lib/postmark"
import { createUser, createUserWithRoles } from "@/test/session"
import { type SubmitConcernInput, submitConcern } from "./actions"

function baseInput(
    overrides: Partial<SubmitConcernInput> = {}
): SubmitConcernInput {
    return {
        anonymous: false,
        want_followup: true,
        incident_date: "2026-07-20",
        location: "Court 3",
        person_involved: "Another Player",
        description: "Something happened.",
        ...overrides
    }
}

describe("submitConcern", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await submitConcern(baseInput())
        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
        expect(await db.select().from(concerns)).toHaveLength(0)
    })

    it("rejects a submission with an empty description", async () => {
        await createUserWithRoles([])
        const result = await submitConcern(baseInput({ description: "   " }))
        expect(result).toEqual({
            status: false,
            message: "Description is required."
        })
        expect(await db.select().from(concerns)).toHaveLength(0)
    })

    it("stores a named concern with trimmed fields and notifies ombudsmen", async () => {
        const ombudsman = await createUser()
        await db.insert(userRoles).values({
            user_id: ombudsman.id,
            role: "ombudsman"
        })
        const reporter = await createUserWithRoles([])

        const result = await submitConcern(
            baseInput({
                contact_name: "  Pat Reporter  ",
                contact_email: " pat@example.test ",
                contact_phone: "",
                witnesses: "  A witness ",
                team_match: " Team 4 vs Team 5 ",
                description: "  Detailed description.  "
            })
        )

        expect(result.status).toBe(true)
        expect(result.message).toBe(
            "Your concern has been submitted. Thank you for bringing this to our attention."
        )

        const rows = await db.select().from(concerns)
        expect(rows).toHaveLength(1)
        const row = rows[0]
        expect(row.user_id).toBe(reporter.id)
        expect(row.anonymous).toBe(false)
        expect(row.contact_name).toBe("Pat Reporter")
        expect(row.contact_email).toBe("pat@example.test")
        expect(row.contact_phone).toBeNull()
        expect(row.want_followup).toBe(true)
        expect(row.incident_date).toBe("2026-07-20")
        expect(row.location).toBe("Court 3")
        expect(row.person_involved).toBe("Another Player")
        expect(row.witnesses).toBe("A witness")
        expect(row.team_match).toBe("Team 4 vs Team 5")
        expect(row.description).toBe("Detailed description.")
        expect(row.status).toBe("new")

        expect(vi.mocked(sendBatchEmails)).toHaveBeenCalledTimes(1)
        const messages = vi.mocked(sendBatchEmails).mock.calls[0][0]
        expect(messages).toHaveLength(1)
        expect(messages[0].to).toBe(ombudsman.email)
        expect(messages[0].subject).toBe("[BSD] New Concern Submitted")
    })

    it("stores an anonymous concern without a user id and skips email when no ombudsmen exist", async () => {
        await createUserWithRoles([])

        const result = await submitConcern(baseInput({ anonymous: true }))

        expect(result.status).toBe(true)
        const rows = await db.select().from(concerns)
        expect(rows).toHaveLength(1)
        expect(rows[0].user_id).toBeNull()
        expect(rows[0].anonymous).toBe(true)
        expect(vi.mocked(sendBatchEmails)).not.toHaveBeenCalled()
    })
})
