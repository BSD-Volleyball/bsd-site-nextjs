import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    accounts,
    auditLog,
    discounts,
    drafts,
    signups,
    teams,
    userRoles,
    users,
    waitlist
} from "@/database/schema"
import {
    createDiscount,
    createDivision,
    createSeason,
    createSignup,
    createTeam,
    addToWaitlist
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import {
    getMergeCandidateDetails,
    getNewUsers,
    getOldUsers,
    mergeUsers
} from "./actions"

async function userExists(id: string): Promise<boolean> {
    const rows = await db.select().from(users).where(eq(users.id, id))
    return rows.length === 1
}

describe("mergeUsers", () => {
    it("rejects unauthenticated callers", async () => {
        const oldUser = await createUser()
        const newUser = await createUser()

        const result = await mergeUsers(oldUser.id, newUser.id)

        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
        expect(await userExists(oldUser.id)).toBe(true)
    })

    it("rejects authenticated non-admins", async () => {
        const oldUser = await createUser()
        const newUser = await createUser()
        await createUserWithRoles([{ role: "captain" }])

        const result = await mergeUsers(oldUser.id, newUser.id)

        expect(result).toEqual({ status: false, message: "Access denied." })
        expect(await userExists(oldUser.id)).toBe(true)
    })

    it("refuses to merge a user with themselves", async () => {
        const target = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await mergeUsers(target.id, target.id)

        expect(result).toEqual({
            status: false,
            message: "Cannot merge a user with themselves."
        })
    })

    it("fails cleanly when the old user does not exist", async () => {
        const newUser = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await mergeUsers(crypto.randomUUID(), newUser.id)

        expect(result).toEqual({
            status: false,
            message: "Old user not found."
        })
    })

    it("repoints child rows to the new user, applies the chosen old_id/picture, and deletes the old user", async () => {
        const season = await createSeason()
        const division = await createDivision()
        const oldUser = await createUser({
            old_id: 4242,
            picture: "old-pic.jpg"
        })
        const newUser = await createUser()
        const pairPicker = await createUser()
        const admin = await createUserWithRoles([{ role: "admin" }])

        const signup = await createSignup({
            season: season.id,
            player: oldUser.id
        })
        const pairSignup = await createSignup({
            season: season.id,
            player: pairPicker.id,
            pair: true,
            pair_pick: oldUser.id
        })
        const team = await createTeam({
            season: season.id,
            captain: oldUser.id,
            division: division.id
        })
        const [draft] = await db
            .insert(drafts)
            .values({ team: team.id, user: oldUser.id, round: 1, overall: 1 })
            .returning()
        const waitlistRow = await addToWaitlist({
            season: season.id,
            user: oldUser.id
        })
        const discount = await createDiscount({ user: oldUser.id })
        await db.insert(userRoles).values({
            user_id: oldUser.id,
            role: "captain",
            season_id: season.id
        })

        const result = await mergeUsers(oldUser.id, newUser.id, {
            old_id: "old",
            picture: "old"
        })

        expect(result.status).toBe(true)
        expect(result.message).toBe("Users merged successfully.")

        // Old user is gone; new user inherited old_id and picture.
        expect(await userExists(oldUser.id)).toBe(false)
        const [merged] = await db
            .select()
            .from(users)
            .where(eq(users.id, newUser.id))
        expect(merged.old_id).toBe(4242)
        expect(merged.picture).toBe("old-pic.jpg")

        // Child rows repointed.
        const [signupRow] = await db
            .select()
            .from(signups)
            .where(eq(signups.id, signup.id))
        expect(signupRow.player).toBe(newUser.id)
        const [pairRow] = await db
            .select()
            .from(signups)
            .where(eq(signups.id, pairSignup.id))
        expect(pairRow.pair_pick).toBe(newUser.id)
        const [teamRow] = await db
            .select()
            .from(teams)
            .where(eq(teams.id, team.id))
        expect(teamRow.captain).toBe(newUser.id)
        const [draftRow] = await db
            .select()
            .from(drafts)
            .where(eq(drafts.id, draft.id))
        expect(draftRow.user).toBe(newUser.id)
        const [waitlistAfter] = await db
            .select()
            .from(waitlist)
            .where(eq(waitlist.id, waitlistRow.id))
        expect(waitlistAfter.user).toBe(newUser.id)
        const [discountRow] = await db
            .select()
            .from(discounts)
            .where(eq(discounts.id, discount.id))
        expect(discountRow.user).toBe(newUser.id)

        // Role rows moved to the new user.
        const newRoles = await db
            .select()
            .from(userRoles)
            .where(eq(userRoles.user_id, newUser.id))
        expect(newRoles).toHaveLength(1)
        expect(newRoles[0].role).toBe("captain")

        // Audit trail written by the admin.
        const audit = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.user, admin.id))
        expect(audit).toHaveLength(1)
        expect(audit[0].action).toBe("merge")
        expect(audit[0].entity_id).toBe(newUser.id)
    })

    it("consolidates overlapping-season signups by keeping the new user's row", async () => {
        // The typical duplicate-account case: both accounts signed up for the
        // same season. The merge keeps the new user's signup, drops the old
        // duplicate, and still deletes the old account.
        const season = await createSeason()
        const oldUser = await createUser()
        const newUser = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        await createSignup({ season: season.id, player: oldUser.id })
        const kept = await createSignup({
            season: season.id,
            player: newUser.id
        })

        const result = await mergeUsers(oldUser.id, newUser.id)

        expect(result.status).toBe(true)
        expect(await userExists(oldUser.id)).toBe(false)
        const rows = await db
            .select()
            .from(signups)
            .where(eq(signups.season, season.id))
        expect(rows).toHaveLength(1)
        expect(rows[0].id).toBe(kept.id)
        expect(rows[0].player).toBe(newUser.id)
    })
})

describe("mergeUsers field selection", () => {
    async function addAccount(userId: string, providerId: string) {
        const [row] = await db
            .insert(accounts)
            .values({
                id: crypto.randomUUID(),
                accountId: `${providerId}-${crypto.randomUUID().slice(0, 8)}`,
                providerId,
                userId
            })
            .returning()
        return row
    }

    it("moves the deleted account's email onto the survivor", async () => {
        // users.email is UNIQUE NOT NULL, so this only works because the patch
        // is applied after the old row is deleted. It is the regression the
        // ordering in mergeUserRecords exists for.
        const oldUser = await createUser({ email: "keep-me@example.test" })
        const newUser = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await mergeUsers(oldUser.id, newUser.id, {
            email: "old"
        })

        expect(result.status).toBe(true)
        expect(await userExists(oldUser.id)).toBe(false)
        const [merged] = await db
            .select()
            .from(users)
            .where(eq(users.id, newUser.id))
        expect(merged.email).toBe("keep-me@example.test")
    })

    it("moves login methods when the email moves, skipping duplicate providers", async () => {
        const oldUser = await createUser({ email: "keep-me-2@example.test" })
        const newUser = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const googleOnOld = await addAccount(oldUser.id, "google")
        const credentialOnOld = await addAccount(oldUser.id, "credential")
        // The survivor already signs in with Google, so the old Google row is
        // redundant and must be dropped rather than duplicated.
        const googleOnNew = await addAccount(newUser.id, "google")

        const result = await mergeUsers(oldUser.id, newUser.id, {
            email: "old"
        })
        expect(result.status).toBe(true)

        const survivorAccounts = await db
            .select()
            .from(accounts)
            .where(eq(accounts.userId, newUser.id))
        const ids = survivorAccounts.map((a) => a.id)

        expect(ids).toContain(credentialOnOld.id)
        expect(ids).toContain(googleOnNew.id)
        expect(ids).not.toContain(googleOnOld.id)
        expect(
            survivorAccounts.filter((a) => a.providerId === "google")
        ).toHaveLength(1)
    })

    it("lets the old account's logins cascade away when the email stays", async () => {
        const oldUser = await createUser()
        const newUser = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        await addAccount(oldUser.id, "google")
        const keptAccount = await addAccount(newUser.id, "credential")

        const result = await mergeUsers(oldUser.id, newUser.id, {
            phone: "old"
        })
        expect(result.status).toBe(true)

        const survivorAccounts = await db
            .select()
            .from(accounts)
            .where(eq(accounts.userId, newUser.id))
        expect(survivorAccounts).toHaveLength(1)
        expect(survivorAccounts[0].id).toBe(keptAccount.id)
    })

    it("applies a mixed selection exactly as chosen", async () => {
        const oldUser = await createUser({
            phone: "555-0001",
            height: 70,
            old_id: 7777,
            picture: "7777_TU.jpg",
            experience: "old experience"
        })
        const newUser = await createUser({
            phone: "555-0002",
            height: 60,
            experience: "new experience"
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await mergeUsers(oldUser.id, newUser.id, {
            phone: "old",
            height: "new",
            old_id: "old",
            picture: "old",
            experience: "new"
        })
        expect(result.status).toBe(true)

        const [merged] = await db
            .select()
            .from(users)
            .where(eq(users.id, newUser.id))
        expect(merged.phone).toBe("555-0001")
        expect(merged.height).toBe(60)
        expect(merged.old_id).toBe(7777)
        expect(merged.picture).toBe("7777_TU.jpg")
        expect(merged.experience).toBe("new experience")
    })

    it("ignores unknown keys and bogus choice tokens", async () => {
        const oldUser = await createUser({ phone: "555-0001" })
        const newUser = await createUser({ phone: "555-0002" })
        await createUserWithRoles([{ role: "admin" }])

        const result = await mergeUsers(oldUser.id, newUser.id, {
            // Neither of these may reach the UPDATE: `id` is not a mergeable
            // field and "OLD" is not a choice token.
            id: "old",
            phone: "OLD"
        } as unknown as Parameters<typeof mergeUsers>[2])

        expect(result.status).toBe(true)
        const [merged] = await db
            .select()
            .from(users)
            .where(eq(users.id, newUser.id))
        expect(merged.id).toBe(newUser.id)
        expect(merged.phone).toBe("555-0002")
    })

    it("records the chosen fields in the audit summary", async () => {
        const oldUser = await createUser({ phone: "555-0001" })
        const newUser = await createUser({ phone: "555-0002" })
        const admin = await createUserWithRoles([{ role: "admin" }])

        await mergeUsers(oldUser.id, newUser.id, { phone: "old" })

        const [entry] = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.user, admin.id))
        expect(entry.action).toBe("merge")
        expect(entry.summary).toContain("phone")
    })
})

describe("getMergeCandidateDetails", () => {
    it("rejects unauthenticated callers", async () => {
        const oldUser = await createUser()
        const newUser = await createUser()

        const result = await getMergeCandidateDetails(oldUser.id, newUser.id)

        expect(result.status).toBe(false)
    })

    it("rejects authenticated non-admins", async () => {
        const oldUser = await createUser()
        const newUser = await createUser()
        await createUserWithRoles([{ role: "captain" }])

        const result = await getMergeCandidateDetails(oldUser.id, newUser.id)

        expect(result).toEqual({ status: false, message: "Access denied." })
    })

    it("returns both snapshots with activity and defaults for an admin", async () => {
        const season = await createSeason()
        const oldUser = await createUser({
            phone: "555-0001",
            createdAt: new Date("2015-06-01T00:00:00Z")
        })
        const newUser = await createUser({ phone: null })
        await createUserWithRoles([{ role: "admin" }])

        await createSignup({ season: season.id, player: oldUser.id })

        const result = await getMergeCandidateDetails(oldUser.id, newUser.id)

        if (!result.status) {
            throw new Error(`expected candidate data, got: ${result.message}`)
        }
        const data = result.data

        expect(data.oldUser.id).toBe(oldUser.id)
        expect(data.newUser.id).toBe(newUser.id)
        expect(data.oldUser.activity.signupCount).toBe(1)
        expect(data.oldUser.activity.firstSeasonCode).toBe(season.code)
        expect(data.newUser.activity.signupCount).toBe(0)

        // Only the old account has a phone, so it is pre-selected; and it is
        // the older row, so it supplies createdAt.
        expect(data.defaults.phone).toBe("old")
        expect(data.defaults.createdAt).toBe("old")
    })
})

describe("getOldUsers / getNewUsers", () => {
    it("returns nothing for unauthenticated or non-admin callers", async () => {
        expect(await getOldUsers()).toEqual([])
        await createUserWithRoles([{ role: "captain" }])
        expect(await getOldUsers()).toEqual([])
        expect(await getNewUsers()).toEqual([])
    })

    it("lists every user in both lists for an admin, regardless of signup date", async () => {
        const oldUser = await createUser({
            createdAt: new Date("2025-01-01T00:00:00")
        })
        const newUser = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const oldIds = (await getOldUsers()).map((u) => u.id)
        expect(oldIds).toContain(oldUser.id)
        expect(oldIds).toContain(newUser.id)

        const newIds = (await getNewUsers()).map((u) => u.id)
        expect(newIds).toContain(oldUser.id)
        expect(newIds).toContain(newUser.id)
    })
})
