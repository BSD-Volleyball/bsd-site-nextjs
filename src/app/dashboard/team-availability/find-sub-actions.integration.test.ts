import { beforeEach, describe, expect, it } from "vitest"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/database/db"
import { drafts, signupDrops, waitlist } from "@/database/schema"
import {
    addToWaitlist,
    createDivision,
    createSeason,
    createSignup,
    createTeam,
    seedBaselineSeason
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { lockInPermanentSub } from "./find-sub-actions"

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
