import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { signups } from "@/database/schema"
import { createSeason, createSignup } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { updateSignup } from "./actions"

describe("updateSignup", () => {
    it("updates only the editable columns, ignoring anything else sent", async () => {
        const season = await createSeason()
        const other = await createSeason({ year: 2027 })
        const player = await createUser()
        const signup = await createSignup({
            season: season.id,
            player: player.id,
            order_id: "PAY-1"
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await updateSignup(signup.id, {
            captain: "yes",
            // Not editable: a crafted payload must not move the signup.
            season: other.id,
            order_id: "FORGED"
        } as Parameters<typeof updateSignup>[1])
        expect(result.status).toBe(true)

        const [row] = await db
            .select()
            .from(signups)
            .where(eq(signups.id, signup.id))
        expect(row.captain).toBe("yes")
        expect(row.season).toBe(season.id)
        expect(row.order_id).toBe("PAY-1")
    })

    it("refuses non-admins", async () => {
        const season = await createSeason()
        const player = await createUser()
        const signup = await createSignup({
            season: season.id,
            player: player.id
        })
        await createUserWithRoles([{ role: "captain", seasonId: season.id }])

        const result = await updateSignup(signup.id, { captain: "yes" })
        expect(result.status).toBe(false)
    })
})
