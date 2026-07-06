import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { waiverAcceptances, waivers } from "@/database/schema"
import { getActiveWaiver, recordWaiverAcceptance } from "@/lib/waivers"
import { createWaiver } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { createWaiverVersion, publishWaiverVersion } from "./actions"

describe("createWaiverVersion", () => {
    it("rejects non-admin callers", async () => {
        await createUserWithRoles([{ role: "ombudsman" }])
        const result = await createWaiverVersion("New waiver text", false)
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("rejects empty content", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await createWaiverVersion("   ", false)
        expect(result).toEqual({
            status: false,
            message: "Waiver content cannot be empty."
        })
    })

    it("creates an unpublished draft version", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await createWaiverVersion("Draft waiver", false)

        expect(result.status).toBe(true)
        const rows = await db.select().from(waivers)
        expect(rows).toHaveLength(1)
        expect(rows[0].active).toBe(false)
        expect(await getActiveWaiver()).toBeNull()
    })

    it("publishing immediately demotes the previously active waiver", async () => {
        const oldWaiver = await createWaiver({ content: "Old terms" })
        await createUserWithRoles([{ role: "admin" }])

        const result = await createWaiverVersion("New terms", true)
        expect(result.status).toBe(true)

        const active = await getActiveWaiver()
        expect(active?.content).toBe("New terms")
        const [demoted] = await db
            .select()
            .from(waivers)
            .where(eq(waivers.id, oldWaiver.id))
        expect(demoted.active).toBe(false)
    })
})

describe("publishWaiverVersion", () => {
    it("fails for a nonexistent waiver id", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await publishWaiverVersion(9999)
        expect(result).toEqual({
            status: false,
            message: "Waiver version not found."
        })
    })

    it("activates the target and deactivates the rest", async () => {
        const first = await createWaiver({ content: "v1", active: true })
        const second = await createWaiver({ content: "v2", active: false })
        await createUserWithRoles([{ role: "admin" }])

        const result = await publishWaiverVersion(second.id)
        expect(result.status).toBe(true)

        const rows = await db.select().from(waivers).orderBy(waivers.id)
        expect(rows.find((w) => w.id === first.id)?.active).toBe(false)
        expect(rows.find((w) => w.id === second.id)?.active).toBe(true)
    })
})

describe("waiver immutability (database trigger from migration 0020)", () => {
    it("blocks direct content edits on an existing waiver", async () => {
        const waiver = await createWaiver({ content: "Signed terms" })

        // Drizzle wraps the Postgres error; the trigger's message is the cause
        const error = await db
            .update(waivers)
            .set({ content: "Sneakily edited terms" })
            .where(eq(waivers.id, waiver.id))
            .then(
                () => null,
                (e: unknown) => e as Error
            )
        expect(error).not.toBeNull()
        expect(String(error?.cause ?? error)).toMatch(/immutable/)

        const [unchanged] = await db
            .select()
            .from(waivers)
            .where(eq(waivers.id, waiver.id))
        expect(unchanged.content).toBe("Signed terms")
    })
})

describe("recordWaiverAcceptance", () => {
    it("is idempotent per user and waiver version", async () => {
        const waiver = await createWaiver()
        const user = await createUser()

        await recordWaiverAcceptance(user.id, waiver.id)
        await recordWaiverAcceptance(user.id, waiver.id)

        const rows = await db
            .select()
            .from(waiverAcceptances)
            .where(eq(waiverAcceptances.user_id, user.id))
        expect(rows).toHaveLength(1)
    })
})
