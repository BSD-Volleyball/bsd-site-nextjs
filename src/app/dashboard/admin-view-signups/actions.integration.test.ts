import { beforeEach, describe, expect, it } from "vitest"
import {
    createDiscount,
    createSeason,
    createSignup,
    seedBaselineSeason
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { getSeasonSignups } from "./actions"

describe("getSeasonSignups discount reporting", () => {
    let previousSeasonId: number
    let currentSeasonId: number

    beforeEach(async () => {
        // getSeasonConfig() treats the highest season id as current, so the
        // baseline season seeded first stands in for last season.
        previousSeasonId = (await seedBaselineSeason()).season.id
        currentSeasonId = (await createSeason()).id
        expect(currentSeasonId).toBeGreaterThan(previousSeasonId)
    })

    it("rejects non-admins", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const result = await getSeasonSignups()
        expect(result.status).toBe(false)
        expect(result.message).toBe("Unauthorized")
    })

    it("reports a discount consumed against this season's signup", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const player = await createUser()
        const signup = await createSignup({
            season: currentSeasonId,
            player: player.id,
            amount_paid: "0"
        })
        await createDiscount({
            user: player.id,
            used: true,
            used_at: new Date(),
            used_signup_id: signup.id,
            reason: "Credit for injury"
        })

        const result = await getSeasonSignups()
        expect(result.status).toBe(true)
        const entry = result.signups.find((s) => s.userId === player.id)
        expect(entry?.discountCodeName).toBe("Credit for injury")
    })

    it("ignores a discount the player redeemed in an earlier season", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const player = await createUser()
        const oldSignup = await createSignup({
            season: previousSeasonId,
            player: player.id,
            amount_paid: "0"
        })
        await createSignup({
            season: currentSeasonId,
            player: player.id,
            amount_paid: "100.00"
        })
        await createDiscount({
            user: player.id,
            used: true,
            used_at: new Date(),
            used_signup_id: oldSignup.id,
            reason: "Credit for injury"
        })

        const result = await getSeasonSignups()
        expect(result.status).toBe(true)
        const entry = result.signups.find((s) => s.userId === player.id)
        expect(entry).toBeDefined()
        expect(entry?.discountCodeName).toBeNull()
    })

    it("ignores a used discount that was never linked to a signup", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const player = await createUser()
        await createSignup({
            season: currentSeasonId,
            player: player.id,
            amount_paid: "100.00"
        })
        await createDiscount({
            user: player.id,
            used: true,
            scope: "tournament",
            reason: "Tournament comp"
        })

        const result = await getSeasonSignups()
        const entry = result.signups.find((s) => s.userId === player.id)
        expect(entry?.discountCodeName).toBeNull()
    })
})
