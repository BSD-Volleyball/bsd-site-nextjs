import { beforeEach, describe, expect, it } from "vitest"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/database/db"
import { drafts, signupDrops, signups, waitlist } from "@/database/schema"
import {
    addToWaitlist,
    createDivision,
    createSeason,
    createSignup,
    createTeam,
    seedBaselineSeason
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import {
    getPermanentSubCandidates,
    lockInPermanentSub
} from "./find-sub-actions"

describe("lockInPermanentSub signup-drop linkage", () => {
    let currentSeasonId: number
    let teamId: number
    let outgoingId: string
    let subId: string

    beforeEach(async () => {
        await seedBaselineSeason()
        currentSeasonId = (await createSeason()).id

        const admin = await createUserWithRoles([{ role: "admin" }])
        const outgoing = await createUser()
        const sub = await createUser()
        outgoingId = outgoing.id
        subId = sub.id

        const division = await createDivision()
        const team = await createTeam({
            season: currentSeasonId,
            captain: admin.id,
            division: division.id
        })
        teamId = team.id
        await db.insert(drafts).values({
            team: team.id,
            user: outgoing.id,
            round: 1,
            overall: 1
        })
        await addToWaitlist({ season: currentSeasonId, user: sub.id })
    })

    it("auto-creates a post-draft drop for the replaced player", async () => {
        await createSignup({
            season: currentSeasonId,
            player: outgoingId
        })

        const result = await lockInPermanentSub({
            teamId,
            originalUserId: outgoingId,
            subUserId: subId,
            reason: "Season-ending injury"
        })
        expect(result.status).toBe(true)

        const dropRows = await db
            .select()
            .from(signupDrops)
            .where(eq(signupDrops.player, outgoingId))
        expect(dropRows).toHaveLength(1)
        expect(dropRows[0].stage).toBe("post_draft")
        expect(dropRows[0].reason_category).toBe("other")
        expect(dropRows[0].reason_note).toBe("Season-ending injury")

        // Waitlist row consumed as before
        expect(
            await db
                .select()
                .from(waitlist)
                .where(
                    and(
                        eq(waitlist.season, currentSeasonId),
                        eq(waitlist.user, subId)
                    )
                )
        ).toHaveLength(0)
    })

    it("does not duplicate an existing un-restored drop", async () => {
        const signup = await createSignup({
            season: currentSeasonId,
            player: outgoingId
        })
        await db.insert(signupDrops).values({
            signup_id: signup.id,
            stage: "post_draft",
            season: currentSeasonId,
            player: outgoingId,
            created_at: signup.created_at,
            reason_category: "injury",
            reason_note: "Dropped by admin first",
            dropped_by: outgoingId
        })

        const result = await lockInPermanentSub({
            teamId,
            originalUserId: outgoingId,
            subUserId: subId
        })
        expect(result.status).toBe(true)

        const dropRows = await db
            .select()
            .from(signupDrops)
            .where(
                and(
                    eq(signupDrops.player, outgoingId),
                    isNull(signupDrops.restored_at)
                )
            )
        expect(dropRows).toHaveLength(1)
        expect(dropRows[0].reason_note).toBe("Dropped by admin first")
    })

    it("skips the drop when the replaced player has no signup", async () => {
        const result = await lockInPermanentSub({
            teamId,
            originalUserId: outgoingId,
            subUserId: subId
        })
        expect(result.status).toBe(true)

        expect(
            await db
                .select()
                .from(signupDrops)
                .where(eq(signupDrops.player, outgoingId))
        ).toHaveLength(0)
    })
})

describe("permanent sub pool includes undrafted signups", () => {
    let currentSeasonId: number
    let teamId: number
    let outgoingId: string

    beforeEach(async () => {
        await seedBaselineSeason()
        currentSeasonId = (await createSeason()).id

        const admin = await createUserWithRoles([{ role: "admin" }])
        const outgoing = await createUser({ male: true })
        outgoingId = outgoing.id

        const division = await createDivision()
        const team = await createTeam({
            season: currentSeasonId,
            captain: admin.id,
            division: division.id
        })
        teamId = team.id
        await db.insert(drafts).values({
            team: team.id,
            user: outgoing.id,
            round: 1,
            overall: 1
        })
    })

    it("suggests a signed-up but undrafted player", async () => {
        const undrafted = await createUser({ male: true })
        await createSignup({ season: currentSeasonId, player: undrafted.id })

        const result = await getPermanentSubCandidates(teamId, outgoingId)
        expect(result.status).toBe(true)
        if (!result.status) return
        const match = result.candidates.find((c) => c.userId === undrafted.id)
        expect(match).toBeDefined()
        expect(match?.source).toBe("undrafted_signup")
    })

    it("omits players who were drafted onto a team this season", async () => {
        const drafted = await createUser({ male: true })
        await createSignup({ season: currentSeasonId, player: drafted.id })
        const otherTeam = await createTeam({
            season: currentSeasonId,
            captain: drafted.id,
            division: (await createDivision()).id
        })
        await db.insert(drafts).values({
            team: otherTeam.id,
            user: drafted.id,
            round: 1,
            overall: 2
        })

        const result = await getPermanentSubCandidates(teamId, outgoingId)
        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.candidates.some((c) => c.userId === drafted.id)).toBe(
            false
        )
    })

    it("omits undrafted signups with an un-restored drop", async () => {
        const dropped = await createUser({ male: true })
        const signup = await createSignup({
            season: currentSeasonId,
            player: dropped.id
        })
        await db.insert(signupDrops).values({
            signup_id: signup.id,
            stage: "post_draft",
            season: currentSeasonId,
            player: dropped.id,
            created_at: signup.created_at,
            reason_category: "injury",
            dropped_by: dropped.id
        })

        const result = await getPermanentSubCandidates(teamId, outgoingId)
        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.candidates.some((c) => c.userId === dropped.id)).toBe(
            false
        )
    })

    it("lists a waitlisted-and-signed-up player once, as waitlist", async () => {
        const both = await createUser({ male: true })
        await createSignup({ season: currentSeasonId, player: both.id })
        await addToWaitlist({ season: currentSeasonId, user: both.id })

        const result = await getPermanentSubCandidates(teamId, outgoingId)
        expect(result.status).toBe(true)
        if (!result.status) return
        const matches = result.candidates.filter((c) => c.userId === both.id)
        expect(matches).toHaveLength(1)
        expect(matches[0].source).toBe("waitlist")
    })

    it("locks in an undrafted signup without touching their signup row", async () => {
        const undrafted = await createUser({ male: true })
        await createSignup({ season: currentSeasonId, player: undrafted.id })

        const result = await lockInPermanentSub({
            teamId,
            originalUserId: outgoingId,
            subUserId: undrafted.id,
            reason: "Pre-season injury"
        })
        expect(result.status).toBe(true)

        // The sub-in player keeps their signup — they paid for the season.
        expect(
            await db
                .select()
                .from(signups)
                .where(
                    and(
                        eq(signups.season, currentSeasonId),
                        eq(signups.player, undrafted.id)
                    )
                )
        ).toHaveLength(1)

        // ...and no drop is recorded against them.
        expect(
            await db
                .select()
                .from(signupDrops)
                .where(eq(signupDrops.player, undrafted.id))
        ).toHaveLength(0)
    })

    it("rejects a sub who neither signed up nor joined the waitlist", async () => {
        const stranger = await createUser({ male: true })

        const result = await lockInPermanentSub({
            teamId,
            originalUserId: outgoingId,
            subUserId: stranger.id
        })
        expect(result.status).toBe(false)
        if (result.status) return
        expect(result.message).toContain("did not sign up")
    })
})
