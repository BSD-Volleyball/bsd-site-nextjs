import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { signups } from "@/database/schema"
import { createSeason, createSignup } from "@/test/factories"
import { createUser, createUserWithRoles, logout } from "@/test/session"
import { updateSignupPreferences } from "./actions"

const PREFERENCES = {
    captain: "only_if_needed",
    pair: false,
    pairPick: null,
    pairReason: "",
    refInterest: true,
    tryoutHelp: true
}

describe("updateSignupPreferences", () => {
    let seasonId: number

    beforeEach(async () => {
        seasonId = (await createSeason()).id
    })

    it("saves the captain, pair, and volunteer answers for the owner", async () => {
        const player = await createUserWithRoles([])
        const signup = await createSignup({
            season: seasonId,
            player: player.id,
            captain: "no",
            ref_interest: false,
            tryout_help: false
        })

        const result = await updateSignupPreferences(signup.id, PREFERENCES)
        expect(result.status).toBe(true)

        const [row] = await db
            .select()
            .from(signups)
            .where(eq(signups.id, signup.id))
        expect(row.captain).toBe("only_if_needed")
        expect(row.ref_interest).toBe(true)
        expect(row.tryout_help).toBe(true)
    })

    it("clears the pair fields when pairing is turned off", async () => {
        const player = await createUserWithRoles([])
        const other = await createUser()
        const signup = await createSignup({
            season: seasonId,
            player: player.id,
            pair: true,
            pair_pick: other.id,
            pair_reason: "carpool"
        })

        const result = await updateSignupPreferences(signup.id, {
            ...PREFERENCES,
            pair: false,
            pairPick: other.id,
            pairReason: "carpool"
        })
        expect(result.status).toBe(true)

        const [row] = await db
            .select()
            .from(signups)
            .where(eq(signups.id, signup.id))
        expect(row.pair).toBe(false)
        expect(row.pair_pick).toBeNull()
        expect(row.pair_reason).toBe("")
    })

    // League rules require 14-15 year olds to stay paired with a registered
    // parent/guardian. Signup now enforces the pick; preferences editing must
    // not become the back door that removes it.
    it("refuses to turn pairing off on a 15-14 signup", async () => {
        const player = await createUserWithRoles([])
        const guardian = await createUser()
        const signup = await createSignup({
            season: seasonId,
            player: player.id,
            age: "15-14",
            pair: true,
            pair_pick: guardian.id,
            pair_reason: "Parent"
        })

        const result = await updateSignupPreferences(signup.id, {
            ...PREFERENCES,
            pair: false,
            pairPick: null
        })
        expect(result.status).toBe(false)
        expect(result.message).toBe(
            "Players aged 14-15 must stay paired with a registered parent/guardian."
        )

        const [row] = await db
            .select()
            .from(signups)
            .where(eq(signups.id, signup.id))
        expect(row.pair).toBe(true)
        expect(row.pair_pick).toBe(guardian.id)
    })

    it("refuses to clear the pair pick on a 15-14 signup", async () => {
        const player = await createUserWithRoles([])
        const guardian = await createUser()
        const signup = await createSignup({
            season: seasonId,
            player: player.id,
            age: "15-14",
            pair: true,
            pair_pick: guardian.id
        })

        const result = await updateSignupPreferences(signup.id, {
            ...PREFERENCES,
            pair: true,
            pairPick: null
        })
        expect(result.status).toBe(false)

        const [row] = await db
            .select()
            .from(signups)
            .where(eq(signups.id, signup.id))
        expect(row.pair_pick).toBe(guardian.id)
    })

    it("allows a 15-14 player to change their pair to another player", async () => {
        const player = await createUserWithRoles([])
        const guardian = await createUser()
        const newGuardian = await createUser()
        const signup = await createSignup({
            season: seasonId,
            player: player.id,
            age: "15-14",
            pair: true,
            pair_pick: guardian.id
        })

        const result = await updateSignupPreferences(signup.id, {
            ...PREFERENCES,
            pair: true,
            pairPick: newGuardian.id,
            pairReason: "Other parent"
        })
        expect(result.status).toBe(true)

        const [row] = await db
            .select()
            .from(signups)
            .where(eq(signups.id, signup.id))
        expect(row.pair_pick).toBe(newGuardian.id)
    })

    it("refuses to edit another player's signup", async () => {
        const other = await createUser()
        const signup = await createSignup({
            season: seasonId,
            player: other.id,
            ref_interest: false,
            tryout_help: false
        })
        await createUserWithRoles([])

        const result = await updateSignupPreferences(signup.id, PREFERENCES)
        expect(result.status).toBe(false)
        expect(result.message).toContain("does not belong to you")

        const [row] = await db
            .select()
            .from(signups)
            .where(eq(signups.id, signup.id))
        expect(row.ref_interest).toBe(false)
        expect(row.tryout_help).toBe(false)
    })

    it("locks editing once drafting has started", async () => {
        const player = await createUserWithRoles([])
        // A later season becomes the current one, so its phase drives the lock.
        const drafting = await createSeason({ year: 2027, phase: "draft" })
        const signup = await createSignup({
            season: drafting.id,
            player: player.id,
            ref_interest: false,
            tryout_help: false
        })

        const result = await updateSignupPreferences(signup.id, PREFERENCES)
        expect(result.status).toBe(false)
        expect(result.message).toContain("drafting has started")
    })

    it("requires a logged-in session", async () => {
        const player = await createUser()
        const signup = await createSignup({
            season: seasonId,
            player: player.id
        })
        logout()

        const result = await updateSignupPreferences(signup.id, PREFERENCES)
        expect(result.status).toBe(false)
    })
})
