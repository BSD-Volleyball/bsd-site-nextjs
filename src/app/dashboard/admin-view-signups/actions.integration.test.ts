import { beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { db } from "@/database/db"
import {
    discounts,
    draftHomework,
    drafts,
    signupDrops,
    signups,
    userUnavailability
} from "@/database/schema"
import {
    createDiscount,
    createDivision,
    createSeason,
    createSeasonEvent,
    createSignup,
    createTeam,
    seedBaselineSeason
} from "@/test/factories"
import { createUser, createUserWithRoles, logout } from "@/test/session"
import {
    dropSignup,
    getSeasonDrops,
    getSeasonSignups,
    restoreDrop
} from "./actions"

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

describe("dropSignup / restoreDrop", () => {
    let currentSeasonId: number

    beforeEach(async () => {
        await seedBaselineSeason()
        currentSeasonId = (await createSeason()).id
    })

    it("rejects non-admins and the unauthenticated", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const asCaptain = await dropSignup(1, "injury", "")
        expect(asCaptain.status).toBe(false)

        const restoreAsCaptain = await restoreDrop(1)
        expect(restoreAsCaptain.status).toBe(false)

        const dropsAsCaptain = await getSeasonDrops()
        expect(dropsAsCaptain.status).toBe(false)

        logout()
        const anonymous = await dropSignup(1, "injury", "")
        expect(anonymous.status).toBe(false)
    })

    it("pre-draft drop archives and deletes, restore brings it all back", async () => {
        const admin = await createUserWithRoles([{ role: "admin" }])
        const player = await createUser()
        const signup = await createSignup({
            season: currentSeasonId,
            player: player.id,
            amount_paid: "90.00"
        })
        const event = await createSeasonEvent(currentSeasonId)
        await db.insert(userUnavailability).values({
            user_id: player.id,
            signup_id: signup.id,
            event_id: event.id
        })
        const division = await createDivision()
        await db.insert(draftHomework).values({
            season: currentSeasonId,
            captain: admin.id,
            division: division.id,
            round: 1,
            slot: 1,
            player: player.id,
            is_male_tab: true
        })
        const discount = await createDiscount({
            user: player.id,
            used: true,
            used_at: new Date(),
            used_signup_id: signup.id
        })

        const result = await dropSignup(signup.id, "injury", "ACL tear")
        expect(result.status).toBe(true)
        expect(result.status && result.data.stage).toBe("pre_draft")

        // Signup, availability, and homework are gone
        expect(
            await db.select().from(signups).where(eq(signups.id, signup.id))
        ).toHaveLength(0)
        expect(
            await db
                .select()
                .from(userUnavailability)
                .where(eq(userUnavailability.signup_id, signup.id))
        ).toHaveLength(0)
        expect(
            await db
                .select()
                .from(draftHomework)
                .where(eq(draftHomework.player, player.id))
        ).toHaveLength(0)

        // Drop row captured everything
        const [drop] = await db
            .select()
            .from(signupDrops)
            .where(eq(signupDrops.signup_id, signup.id))
        expect(drop.stage).toBe("pre_draft")
        expect(drop.reason_category).toBe("injury")
        expect(drop.reason_note).toBe("ACL tear")
        expect(drop.unavailability_event_ids).toEqual([event.id])
        expect(drop.draft_homework_snapshot).toHaveLength(1)
        expect(drop.discount_id).toBe(discount.id)

        // A second drop for the same player is refused
        const secondSignup = await createSignup({
            season: currentSeasonId,
            player: player.id
        })
        const doubleDrop = await dropSignup(secondSignup.id, "other", "")
        expect(doubleDrop.status).toBe(false)

        // Restore is blocked while a live signup exists
        const blocked = await restoreDrop(drop.id)
        expect(blocked.status).toBe(false)
        await db.delete(signups).where(eq(signups.id, secondSignup.id))

        // Full restore
        const restored = await restoreDrop(drop.id)
        expect(restored.status).toBe(true)

        const [signupBack] = await db
            .select()
            .from(signups)
            .where(eq(signups.id, signup.id))
        expect(signupBack.player).toBe(player.id)
        expect(signupBack.amount_paid).toBe("90.00")
        expect(
            await db
                .select()
                .from(userUnavailability)
                .where(eq(userUnavailability.signup_id, signup.id))
        ).toHaveLength(1)
        expect(
            await db
                .select()
                .from(draftHomework)
                .where(eq(draftHomework.player, player.id))
        ).toHaveLength(1)
        const [discountBack] = await db
            .select()
            .from(discounts)
            .where(eq(discounts.id, discount.id))
        expect(discountBack.used_signup_id).toBe(signup.id)

        const [dropAfter] = await db
            .select()
            .from(signupDrops)
            .where(eq(signupDrops.id, drop.id))
        expect(dropAfter.restored_at).not.toBeNull()
        expect(dropAfter.restored_by).toBe(admin.id)

        // Restoring twice is refused
        const again = await restoreDrop(drop.id)
        expect(again.status).toBe(false)
    })

    it("post-draft drop keeps the signup and roster slot", async () => {
        const admin = await createUserWithRoles([{ role: "admin" }])
        const player = await createUser()
        const signup = await createSignup({
            season: currentSeasonId,
            player: player.id
        })
        const division = await createDivision()
        const team = await createTeam({
            season: currentSeasonId,
            captain: admin.id,
            division: division.id
        })
        const [draft] = await db
            .insert(drafts)
            .values({ team: team.id, user: player.id, round: 1, overall: 1 })
            .returning()

        const result = await dropSignup(signup.id, "moved", "Left the state")
        expect(result.status).toBe(true)
        expect(result.status && result.data.stage).toBe("post_draft")

        // Signup and draft rows survive
        expect(
            await db.select().from(signups).where(eq(signups.id, signup.id))
        ).toHaveLength(1)
        expect(
            await db.select().from(drafts).where(eq(drafts.id, draft.id))
        ).toHaveLength(1)

        const [drop] = await db
            .select()
            .from(signupDrops)
            .where(eq(signupDrops.signup_id, signup.id))
        expect(drop.stage).toBe("post_draft")
        expect(drop.team_name).toBe(team.name)
        expect(drop.division_name).toBe(division.name)

        // Surfaces on the signups list and in getSeasonDrops
        const listResult = await getSeasonSignups()
        const entry = listResult.signups.find((s) => s.userId === player.id)
        expect(entry?.droppedAt).not.toBeNull()
        expect(entry?.dropCategory).toBe("moved")

        const dropsResult = await getSeasonDrops()
        expect(dropsResult.status).toBe(true)
        expect(
            dropsResult.entries.find((e) => e.userId === player.id)?.stage
        ).toBe("post_draft")

        // Post-draft restore only clears the drop
        const restored = await restoreDrop(drop.id)
        expect(restored.status).toBe(true)
        expect(
            await db.select().from(signups).where(eq(signups.id, signup.id))
        ).toHaveLength(1)
        const [dropAfter] = await db
            .select()
            .from(signupDrops)
            .where(eq(signupDrops.id, drop.id))
        expect(dropAfter.restored_at).not.toBeNull()
    })
})
