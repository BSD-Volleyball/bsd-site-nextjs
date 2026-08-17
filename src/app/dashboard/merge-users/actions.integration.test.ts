import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    accounts,
    auditLog,
    discounts,
    drafts,
    friendships,
    matchReferees,
    notificationOptouts,
    seasonRefs,
    signups,
    teams,
    userRoles,
    users,
    userUnavailability,
    waitlist
} from "@/database/schema"
import {
    createDiscount,
    createDivision,
    createMatch,
    createSeason,
    createSeasonEvent,
    createSignup,
    createTeam,
    addToWaitlist
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import {
    getMergeCandidateDetails,
    getMergeableUsers,
    mergeUsers
} from "./actions"

async function userExists(id: string): Promise<boolean> {
    const rows = await db.select().from(users).where(eq(users.id, id))
    return rows.length === 1
}

/**
 * The email choice decides which of the two accounts survives. Most tests
 * below keep Player B, so this names that intent instead of repeating the
 * literal in every call.
 */
const KEEP_B = { email: "b" } as const
const KEEP_A = { email: "a" } as const

describe("mergeUsers", () => {
    it("rejects unauthenticated callers", async () => {
        const userA = await createUser()
        const userB = await createUser()

        const result = await mergeUsers(userA.id, userB.id, KEEP_B)

        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
        expect(await userExists(userA.id)).toBe(true)
    })

    it("rejects authenticated non-admins", async () => {
        const userA = await createUser()
        const userB = await createUser()
        await createUserWithRoles([{ role: "captain" }])

        const result = await mergeUsers(userA.id, userB.id, KEEP_B)

        expect(result).toEqual({ status: false, message: "Access denied." })
        expect(await userExists(userA.id)).toBe(true)
    })

    it("refuses to merge a user with themselves", async () => {
        const target = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await mergeUsers(target.id, target.id, KEEP_B)

        expect(result).toEqual({
            status: false,
            message: "Cannot merge a user with themselves."
        })
    })

    it("refuses a selection that does not say which email survives", async () => {
        // Without it there is no survivor to merge onto.
        const userA = await createUser()
        const userB = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await mergeUsers(userA.id, userB.id, {})

        expect(result).toEqual({
            status: false,
            message: "Choose which email address the merged account keeps."
        })
        expect(await userExists(userA.id)).toBe(true)
        expect(await userExists(userB.id)).toBe(true)
    })

    it("fails cleanly when an account does not exist", async () => {
        const userB = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await mergeUsers(crypto.randomUUID(), userB.id, KEEP_B)

        expect(result).toEqual({
            status: false,
            message: "Player A not found."
        })
    })

    it("repoints child rows to the survivor, applies the chosen old_id/picture, and deletes the other account", async () => {
        const season = await createSeason()
        const division = await createDivision()
        const userA = await createUser({
            old_id: 4242,
            picture: "old-pic.jpg"
        })
        const userB = await createUser()
        const pairPicker = await createUser()
        const admin = await createUserWithRoles([{ role: "admin" }])

        const signup = await createSignup({
            season: season.id,
            player: userA.id
        })
        const pairSignup = await createSignup({
            season: season.id,
            player: pairPicker.id,
            pair: true,
            pair_pick: userA.id
        })
        const team = await createTeam({
            season: season.id,
            captain: userA.id,
            division: division.id
        })
        const [draft] = await db
            .insert(drafts)
            .values({ team: team.id, user: userA.id, round: 1, overall: 1 })
            .returning()
        const waitlistRow = await addToWaitlist({
            season: season.id,
            user: userA.id
        })
        const discount = await createDiscount({ user: userA.id })
        await db.insert(userRoles).values({
            user_id: userA.id,
            role: "captain",
            season_id: season.id
        })

        const result = await mergeUsers(userA.id, userB.id, {
            ...KEEP_B,
            old_id: "a",
            picture: "a"
        })

        expect(result.status).toBe(true)
        expect(result.message).toBe("Users merged successfully.")

        // Player A is gone; Player B inherited old_id and picture.
        expect(await userExists(userA.id)).toBe(false)
        const [merged] = await db
            .select()
            .from(users)
            .where(eq(users.id, userB.id))
        expect(merged.old_id).toBe(4242)
        expect(merged.picture).toBe("old-pic.jpg")

        // Child rows repointed.
        const [signupRow] = await db
            .select()
            .from(signups)
            .where(eq(signups.id, signup.id))
        expect(signupRow.player).toBe(userB.id)
        const [pairRow] = await db
            .select()
            .from(signups)
            .where(eq(signups.id, pairSignup.id))
        expect(pairRow.pair_pick).toBe(userB.id)
        const [teamRow] = await db
            .select()
            .from(teams)
            .where(eq(teams.id, team.id))
        expect(teamRow.captain).toBe(userB.id)
        const [draftRow] = await db
            .select()
            .from(drafts)
            .where(eq(drafts.id, draft.id))
        expect(draftRow.user).toBe(userB.id)
        const [waitlistAfter] = await db
            .select()
            .from(waitlist)
            .where(eq(waitlist.id, waitlistRow.id))
        expect(waitlistAfter.user).toBe(userB.id)
        const [discountRow] = await db
            .select()
            .from(discounts)
            .where(eq(discounts.id, discount.id))
        expect(discountRow.user).toBe(userB.id)

        // Role rows moved to the survivor.
        const newRoles = await db
            .select()
            .from(userRoles)
            .where(eq(userRoles.user_id, userB.id))
        expect(newRoles).toHaveLength(1)
        expect(newRoles[0].role).toBe("captain")

        // Audit trail written by the admin.
        const audit = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.user, admin.id))
        expect(audit).toHaveLength(1)
        expect(audit[0].action).toBe("merge")
        expect(audit[0].entity_id).toBe(userB.id)
    })

    it("consolidates overlapping-season signups by keeping the survivor's row", async () => {
        // The typical duplicate-account case: both accounts signed up for the
        // same season. The merge keeps the survivor's signup, drops the
        // duplicate, and still deletes the other account.
        const season = await createSeason()
        const userA = await createUser()
        const userB = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        await createSignup({ season: season.id, player: userA.id })
        const kept = await createSignup({
            season: season.id,
            player: userB.id
        })

        const result = await mergeUsers(userA.id, userB.id, KEEP_B)

        expect(result.status).toBe(true)
        expect(await userExists(userA.id)).toBe(false)
        const rows = await db
            .select()
            .from(signups)
            .where(eq(signups.season, season.id))
        expect(rows).toHaveLength(1)
        expect(rows[0].id).toBe(kept.id)
        expect(rows[0].player).toBe(userB.id)
    })
})

describe("mergeUsers survivor selection", () => {
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

    it("keeps the account whose email was chosen, whichever side it is on", async () => {
        const userA = await createUser({ email: "keep-a@example.test" })
        const userB = await createUser({ email: "drop-b@example.test" })
        await createUserWithRoles([{ role: "admin" }])

        const result = await mergeUsers(userA.id, userB.id, KEEP_A)

        expect(result.status).toBe(true)
        expect(await userExists(userA.id)).toBe(true)
        expect(await userExists(userB.id)).toBe(false)
        const [merged] = await db
            .select()
            .from(users)
            .where(eq(users.id, userA.id))
        expect(merged.email).toBe("keep-a@example.test")
    })

    it("produces the same end state whichever order the two accounts are given in", async () => {
        const season = await createSeason()
        const admin = await createUserWithRoles([{ role: "admin" }])

        // Same pair of accounts twice, merged from opposite directions but
        // always keeping the account with the "keeper" email.
        async function run(swapped: boolean) {
            const keeper = await createUser({ phone: "555-KEEP" })
            const other = await createUser({ phone: "555-DROP" })
            await createSignup({ season: season.id, player: other.id })

            const result = swapped
                ? await mergeUsers(other.id, keeper.id, {
                      ...KEEP_B,
                      phone: "b"
                  })
                : await mergeUsers(keeper.id, other.id, {
                      ...KEEP_A,
                      phone: "a"
                  })
            expect(result.status).toBe(true)

            const [merged] = await db
                .select()
                .from(users)
                .where(eq(users.id, keeper.id))
            const signupRows = await db
                .select()
                .from(signups)
                .where(eq(signups.player, keeper.id))

            return {
                survived: Boolean(merged),
                otherGone: !(await userExists(other.id)),
                phone: merged.phone,
                signupCount: signupRows.length
            }
        }

        const forward = await run(false)
        const backward = await run(true)

        expect(forward).toEqual(backward)
        expect(forward).toEqual({
            survived: true,
            otherGone: true,
            phone: "555-KEEP",
            signupCount: 1
        })
        expect(admin.id).toBeTruthy()
    })

    it("removes the deleted account's logins and sessions, keeping the survivor's", async () => {
        // Auth follows the email: the chosen address keeps its own logins, and
        // the discarded address takes its logins with it.
        const userA = await createUser()
        const userB = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const droppedAccount = await addAccount(userA.id, "google")
        const keptAccount = await addAccount(userB.id, "credential")

        const result = await mergeUsers(userA.id, userB.id, KEEP_B)
        expect(result.status).toBe(true)

        const survivorAccounts = await db
            .select()
            .from(accounts)
            .where(eq(accounts.userId, userB.id))
        expect(survivorAccounts).toHaveLength(1)
        expect(survivorAccounts[0].id).toBe(keptAccount.id)

        const orphaned = await db
            .select()
            .from(accounts)
            .where(eq(accounts.id, droppedAccount.id))
        expect(orphaned).toHaveLength(0)
    })

    it("applies a mixed selection exactly as chosen", async () => {
        const userA = await createUser({
            phone: "555-0001",
            height: 70,
            old_id: 7777,
            picture: "7777_TU.jpg",
            experience: "a experience"
        })
        const userB = await createUser({
            phone: "555-0002",
            height: 60,
            experience: "b experience"
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await mergeUsers(userA.id, userB.id, {
            ...KEEP_B,
            phone: "a",
            height: "b",
            old_id: "a",
            picture: "a",
            experience: "b"
        })
        expect(result.status).toBe(true)

        const [merged] = await db
            .select()
            .from(users)
            .where(eq(users.id, userB.id))
        expect(merged.phone).toBe("555-0001")
        expect(merged.height).toBe(60)
        expect(merged.old_id).toBe(7777)
        expect(merged.picture).toBe("7777_TU.jpg")
        expect(merged.experience).toBe("b experience")
    })

    it("ignores unknown keys and bogus choice tokens", async () => {
        const userA = await createUser({ phone: "555-0001" })
        const userB = await createUser({ phone: "555-0002" })
        await createUserWithRoles([{ role: "admin" }])

        const result = await mergeUsers(userA.id, userB.id, {
            ...KEEP_B,
            // Neither of these may reach the UPDATE: `id` is not a mergeable
            // field and "OLD" is not a choice token.
            id: "a",
            phone: "OLD"
        } as unknown as Parameters<typeof mergeUsers>[2])

        expect(result.status).toBe(true)
        const [merged] = await db
            .select()
            .from(users)
            .where(eq(users.id, userB.id))
        expect(merged.id).toBe(userB.id)
        expect(merged.phone).toBe("555-0002")
    })

    it("records the chosen fields and both addresses in the audit summary", async () => {
        const userA = await createUser({
            phone: "555-0001",
            email: "gone@example.test"
        })
        const userB = await createUser({
            phone: "555-0002",
            email: "stays@example.test"
        })
        const admin = await createUserWithRoles([{ role: "admin" }])

        await mergeUsers(userA.id, userB.id, { ...KEEP_B, phone: "a" })

        const [entry] = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.user, admin.id))
        expect(entry.action).toBe("merge")
        expect(entry.summary).toContain("phone")
        expect(entry.summary).toContain("gone@example.test")
        expect(entry.summary).toContain("stays@example.test")
    })
})

describe("mergeUsers moves records that used to cascade away", () => {
    it("carries availability, referee rows, opt-outs and friendships onto the survivor", async () => {
        const season = await createSeason()
        const division = await createDivision()
        const event = await createSeasonEvent(season.id)
        const match = await createMatch({
            season: season.id,
            division: division.id
        })
        const userA = await createUser()
        const userB = await createUser()
        const friend = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const [unavailability] = await db
            .insert(userUnavailability)
            .values({ user_id: userA.id, event_id: event.id })
            .returning()
        const [refRow] = await db
            .insert(seasonRefs)
            .values({
                season_id: season.id,
                user_id: userA.id,
                max_division_level: 3
            })
            .returning()
        const [assignment] = await db
            .insert(matchReferees)
            .values({
                match_id: match.id,
                referee_id: userA.id,
                season_id: season.id
            })
            .returning()
        const [optout] = await db
            .insert(notificationOptouts)
            .values({
                user_id: userA.id,
                notification_type: "season_announcement"
            })
            .returning()
        const [friendship] = await db
            .insert(friendships)
            .values({
                requester: userA.id,
                addressee: friend.id,
                status: "accepted"
            })
            .returning()

        const result = await mergeUsers(userA.id, userB.id, KEEP_B)
        expect(result.status).toBe(true)

        const [unavailabilityAfter] = await db
            .select()
            .from(userUnavailability)
            .where(eq(userUnavailability.id, unavailability.id))
        expect(unavailabilityAfter.user_id).toBe(userB.id)

        const [refAfter] = await db
            .select()
            .from(seasonRefs)
            .where(eq(seasonRefs.id, refRow.id))
        expect(refAfter.user_id).toBe(userB.id)

        const [assignmentAfter] = await db
            .select()
            .from(matchReferees)
            .where(eq(matchReferees.id, assignment.id))
        expect(assignmentAfter.referee_id).toBe(userB.id)

        const [optoutAfter] = await db
            .select()
            .from(notificationOptouts)
            .where(eq(notificationOptouts.id, optout.id))
        expect(optoutAfter.user_id).toBe(userB.id)

        const [friendshipAfter] = await db
            .select()
            .from(friendships)
            .where(eq(friendships.id, friendship.id))
        expect(friendshipAfter.requester).toBe(userB.id)
    })

    it("drops the friendship between the two merged accounts rather than creating a self-edge", async () => {
        // friendships has a CHECK that requester <> addressee, so repointing
        // this row would abort the whole transaction.
        const userA = await createUser()
        const userB = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const [selfEdge] = await db
            .insert(friendships)
            .values({
                requester: userA.id,
                addressee: userB.id,
                status: "accepted"
            })
            .returning()

        const result = await mergeUsers(userA.id, userB.id, KEEP_B)
        expect(result.status).toBe(true)

        const rows = await db
            .select()
            .from(friendships)
            .where(eq(friendships.id, selfEdge.id))
        expect(rows).toHaveLength(0)
    })

    it("keeps one live friendship when both accounts are friends with the same person", async () => {
        // Only one live edge is allowed per unordered pair.
        const userA = await createUser()
        const userB = await createUser()
        const friend = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        await db.insert(friendships).values({
            requester: userA.id,
            addressee: friend.id,
            status: "accepted"
        })
        const [survivorEdge] = await db
            .insert(friendships)
            .values({
                requester: friend.id,
                addressee: userB.id,
                status: "accepted"
            })
            .returning()

        const result = await mergeUsers(userA.id, userB.id, KEEP_B)
        expect(result.status).toBe(true)

        const rows = await db
            .select()
            .from(friendships)
            .where(eq(friendships.addressee, userB.id))
        expect(rows).toHaveLength(1)
        expect(rows[0].id).toBe(survivorEdge.id)
    })

    it("keeps the survivor's availability when both accounts marked the same night", async () => {
        const season = await createSeason()
        const event = await createSeasonEvent(season.id)
        const userA = await createUser()
        const userB = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        await db
            .insert(userUnavailability)
            .values({ user_id: userA.id, event_id: event.id })
        const [kept] = await db
            .insert(userUnavailability)
            .values({ user_id: userB.id, event_id: event.id })
            .returning()

        const result = await mergeUsers(userA.id, userB.id, KEEP_B)
        expect(result.status).toBe(true)

        const rows = await db
            .select()
            .from(userUnavailability)
            .where(eq(userUnavailability.event_id, event.id))
        expect(rows).toHaveLength(1)
        expect(rows[0].id).toBe(kept.id)
    })
})

describe("getMergeCandidateDetails", () => {
    it("rejects unauthenticated callers", async () => {
        const userA = await createUser()
        const userB = await createUser()

        const result = await getMergeCandidateDetails(userA.id, userB.id)

        expect(result.status).toBe(false)
    })

    it("rejects authenticated non-admins", async () => {
        const userA = await createUser()
        const userB = await createUser()
        await createUserWithRoles([{ role: "captain" }])

        const result = await getMergeCandidateDetails(userA.id, userB.id)

        expect(result).toEqual({ status: false, message: "Access denied." })
    })

    it("returns both snapshots with activity and defaults for an admin", async () => {
        const season = await createSeason()
        const userA = await createUser({
            phone: "555-0001",
            createdAt: new Date("2015-06-01T00:00:00Z")
        })
        const userB = await createUser({ phone: null })
        await createUserWithRoles([{ role: "admin" }])

        await createSignup({ season: season.id, player: userA.id })

        const result = await getMergeCandidateDetails(userA.id, userB.id)

        if (!result.status) {
            throw new Error(`expected candidate data, got: ${result.message}`)
        }
        const data = result.data

        expect(data.userA.id).toBe(userA.id)
        expect(data.userB.id).toBe(userB.id)
        expect(data.userA.activity.signupCount).toBe(1)
        expect(data.userA.activity.firstSeasonCode).toBe(season.code)
        expect(data.userB.activity.signupCount).toBe(0)

        // Only Player A has a phone, so it is pre-selected; and it is the
        // older row, so it supplies createdAt.
        expect(data.defaults.phone).toBe("a")
        expect(data.defaults.createdAt).toBe("a")
        // email is UNIQUE NOT NULL, so a choice is always offered.
        expect(data.defaults.email).toBeDefined()
    })
})

describe("getMergeableUsers", () => {
    it("returns nothing for unauthenticated or non-admin callers", async () => {
        expect(await getMergeableUsers()).toEqual([])
        await createUserWithRoles([{ role: "captain" }])
        expect(await getMergeableUsers()).toEqual([])
    })

    it("lists every user for an admin, regardless of signup date", async () => {
        const userA = await createUser({
            createdAt: new Date("2025-01-01T00:00:00")
        })
        const userB = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const ids = (await getMergeableUsers()).map((u) => u.id)
        expect(ids).toContain(userA.id)
        expect(ids).toContain(userB.id)
    })
})
