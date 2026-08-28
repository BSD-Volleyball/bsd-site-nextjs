import { describe, expect, it } from "vitest"
import { addToWaitlist, createSeason, createSignup } from "@/test/factories"
import { createUser } from "@/test/session"
import { checkSignupEligibility } from "./site-config"

describe("checkSignupEligibility", () => {
    it("is true for a new player while registration is open", async () => {
        await createSeason({ phase: "registration_open" })
        const player = await createUser()
        expect(await checkSignupEligibility(player.id)).toBe(true)
    })

    it("is false once registration has closed", async () => {
        await createSeason({ phase: "draft" })
        const player = await createUser()
        expect(await checkSignupEligibility(player.id)).toBe(false)
    })

    it("is true after registration closes for an approved waitlister", async () => {
        const season = await createSeason({ phase: "draft" })
        const player = await createUser()
        await addToWaitlist({
            season: season.id,
            user: player.id,
            approved: true
        })
        expect(await checkSignupEligibility(player.id)).toBe(true)
    })

    it("stays false after registration closes for an unapproved waitlister", async () => {
        const season = await createSeason({ phase: "draft" })
        const player = await createUser()
        await addToWaitlist({
            season: season.id,
            user: player.id,
            approved: false
        })
        expect(await checkSignupEligibility(player.id)).toBe(false)
    })

    it("is false for an approved waitlister who has already signed up", async () => {
        const season = await createSeason({ phase: "draft" })
        const player = await createUser()
        await addToWaitlist({
            season: season.id,
            user: player.id,
            approved: true
        })
        await createSignup({ season: season.id, player: player.id })
        expect(await checkSignupEligibility(player.id)).toBe(false)
    })

    it("does not let waitlist approval reopen a completed season", async () => {
        const season = await createSeason({ phase: "complete" })
        const player = await createUser()
        await addToWaitlist({
            season: season.id,
            user: player.id,
            approved: true
        })
        expect(await checkSignupEligibility(player.id)).toBe(false)
    })
})
