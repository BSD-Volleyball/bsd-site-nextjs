import { and, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { signups } from "@/database/schema"
import { createSeason, createSignup } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { assignPairPartner } from "./actions"

async function signupOf(seasonId: number, player: string) {
    const [row] = await db
        .select({ pair: signups.pair, pairPick: signups.pair_pick })
        .from(signups)
        .where(and(eq(signups.season, seasonId), eq(signups.player, player)))
    return row
}

describe("assignPairPartner", () => {
    it("pairs both players with each other", async () => {
        const season = await createSeason()
        const a = await createUser()
        const b = await createUser()
        await createSignup({ season: season.id, player: a.id })
        await createSignup({ season: season.id, player: b.id })
        await createUserWithRoles([{ role: "admin" }])

        const result = await assignPairPartner(a.id, b.id)
        expect(result.status).toBe(true)
        expect(await signupOf(season.id, a.id)).toEqual({
            pair: true,
            pairPick: b.id
        })
        expect(await signupOf(season.id, b.id)).toEqual({
            pair: true,
            pairPick: a.id
        })
    })

    it("changes neither side when one is already paired", async () => {
        const season = await createSeason()
        const a = await createUser()
        const b = await createUser()
        const c = await createUser()
        await createSignup({ season: season.id, player: a.id })
        await createSignup({
            season: season.id,
            player: b.id,
            pair: true,
            pair_pick: c.id
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await assignPairPartner(a.id, b.id)
        expect(result.status).toBe(false)
        expect((await signupOf(season.id, a.id)).pairPick).toBeNull()
        expect((await signupOf(season.id, b.id)).pairPick).toBe(c.id)
    })
})
