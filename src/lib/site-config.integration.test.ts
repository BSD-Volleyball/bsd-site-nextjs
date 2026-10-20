import { describe, expect, it } from "vitest"
import { addToWaitlist, createSeason, createSignup } from "@/test/factories"
import { createUser } from "@/test/session"
import { checkSignupEligibility, getSignupEligibility } from "./site-config"

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

// The sign-up page uses the reason to tell a closed season from a full one
// rather than showing a wizard whose payment the server will refuse.
describe("getSignupEligibility", () => {
    it("is eligible for a new player while registration is open", async () => {
        await createSeason({ phase: "registration_open" })
        const player = await createUser()
        expect(await getSignupEligibility(player.id)).toBe("eligible")
    })

    it("is closed once registration has closed", async () => {
        await createSeason({ phase: "playoffs" })
        const player = await createUser()
        expect(await getSignupEligibility(player.id)).toBe("closed")
    })

    it("is closed for a completed season even with waitlist approval", async () => {
        const season = await createSeason({ phase: "complete" })
        const player = await createUser()
        await addToWaitlist({
            season: season.id,
            user: player.id,
            approved: true
        })
        expect(await getSignupEligibility(player.id)).toBe("closed")
    })

    it("is full when registration is open but the season is at capacity", async () => {
        const season = await createSeason({
            phase: "registration_open",
            max_players: 1
        })
        const other = await createUser()
        await createSignup({ season: season.id, player: other.id })
        const player = await createUser()
        expect(await getSignupEligibility(player.id)).toBe("full")
    })

    it("lets an approved waitlister into a full season", async () => {
        const season = await createSeason({
            phase: "registration_open",
            max_players: 1
        })
        const other = await createUser()
        await createSignup({ season: season.id, player: other.id })
        const player = await createUser()
        await addToWaitlist({
            season: season.id,
            user: player.id,
            approved: true
        })
        expect(await getSignupEligibility(player.id)).toBe("eligible")
    })

    it("reports a player who already signed up", async () => {
        const season = await createSeason({ phase: "playoffs" })
        const player = await createUser()
        await createSignup({ season: season.id, player: player.id })
        expect(await getSignupEligibility(player.id)).toBe("already_signed_up")
    })
})
