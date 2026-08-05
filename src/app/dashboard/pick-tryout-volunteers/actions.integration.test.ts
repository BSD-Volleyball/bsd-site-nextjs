import { and, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { db } from "@/database/db"
import { userRoles } from "@/database/schema"
import { createSignup, seedBaselineSeason } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"

import { getPickTryoutVolunteersView, setTryoutVolunteer } from "./actions"

async function volunteerRows(userId: string, seasonId: number) {
    return db
        .select()
        .from(userRoles)
        .where(
            and(
                eq(userRoles.user_id, userId),
                eq(userRoles.role, "tryout_volunteer"),
                eq(userRoles.season_id, seasonId)
            )
        )
}

describe("getPickTryoutVolunteersView", () => {
    it("rejects unauthenticated callers", async () => {
        await seedBaselineSeason()

        const result = await getPickTryoutVolunteersView()
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("rejects authenticated non-admins", async () => {
        await seedBaselineSeason()
        await createUserWithRoles([{ role: "captain" }])

        const result = await getPickTryoutVolunteersView()
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("lists players who ticked tryout_help on their signup", async () => {
        const { season } = await seedBaselineSeason()
        const willing = await createUser({ last_name: "Willing" })
        const notWilling = await createUser({ last_name: "Busy" })
        const unanswered = await createUser({ last_name: "Unanswered" })
        await createSignup({
            season: season.id,
            player: willing.id,
            tryout_help: true
        })
        await createSignup({
            season: season.id,
            player: notWilling.id,
            tryout_help: false
        })
        await createSignup({ season: season.id, player: unanswered.id })
        await createUserWithRoles([{ role: "admin" }])

        const result = await getPickTryoutVolunteersView()

        expect(result.status).toBe(true)
        const ids = result.status
            ? result.data.willing.map((c) => c.userId)
            : []
        expect(ids).toEqual([willing.id])
        expect(result.status && result.data.willing[0].isVolunteer).toBe(false)
    })

    it("marks a willing player who already holds the role", async () => {
        const { season } = await seedBaselineSeason()
        const willing = await createUser()
        await createSignup({
            season: season.id,
            player: willing.id,
            tryout_help: true
        })
        await db.insert(userRoles).values({
            user_id: willing.id,
            role: "tryout_volunteer",
            season_id: season.id
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await getPickTryoutVolunteersView()

        expect(result.status && result.data.willing[0].isVolunteer).toBe(true)
        expect(result.status && result.data.added).toHaveLength(0)
    })

    it("surfaces volunteers who never offered under 'added'", async () => {
        const { season } = await seedBaselineSeason()
        const manual = await createUser({ last_name: "Manual" })
        await db.insert(userRoles).values({
            user_id: manual.id,
            role: "tryout_volunteer",
            season_id: season.id
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await getPickTryoutVolunteersView()

        expect(result.status && result.data.willing).toHaveLength(0)
        expect(
            result.status ? result.data.added.map((c) => c.userId) : []
        ).toEqual([manual.id])
    })

    it("ignores tryout_help from a previous season's signup", async () => {
        const { season: previous } = await seedBaselineSeason()
        const player = await createUser()
        await createSignup({
            season: previous.id,
            player: player.id,
            tryout_help: true
        })
        const { season: current } = await seedBaselineSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getPickTryoutVolunteersView()

        expect(result.status && result.data.seasonId).toBe(current.id)
        expect(result.status && result.data.willing).toHaveLength(0)
    })
})

describe("setTryoutVolunteer", () => {
    it("rejects unauthenticated callers", async () => {
        await seedBaselineSeason()
        const player = await createUser()

        const result = await setTryoutVolunteer(player.id, true)
        expect(result).toEqual({ status: false, message: "Not authenticated." })
    })

    it("rejects authenticated non-admins without granting anything", async () => {
        const { season } = await seedBaselineSeason()
        const player = await createUser()
        await createUserWithRoles([{ role: "captain" }])

        const result = await setTryoutVolunteer(player.id, true)
        expect(result).toEqual({ status: false, message: "Unauthorized." })
        expect(await volunteerRows(player.id, season.id)).toHaveLength(0)
    })

    it("rejects an unknown user", async () => {
        await seedBaselineSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await setTryoutVolunteer("no-such-user", true)
        expect(result).toEqual({ status: false, message: "User not found." })
    })

    it("grants exactly one season-scoped role row", async () => {
        const { season } = await seedBaselineSeason()
        const player = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await setTryoutVolunteer(player.id, true)

        expect(result.status).toBe(true)
        const rows = await volunteerRows(player.id, season.id)
        expect(rows).toHaveLength(1)
        expect(rows[0].division_id).toBeNull()
    })

    it("is idempotent — granting twice leaves one row", async () => {
        const { season } = await seedBaselineSeason()
        const player = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        await setTryoutVolunteer(player.id, true)
        await setTryoutVolunteer(player.id, true)

        expect(await volunteerRows(player.id, season.id)).toHaveLength(1)
    })

    it("revokes the role for this season only", async () => {
        const { season: previous } = await seedBaselineSeason()
        const player = await createUser()
        await db.insert(userRoles).values({
            user_id: player.id,
            role: "tryout_volunteer",
            season_id: previous.id
        })
        const { season: current } = await seedBaselineSeason()
        await createUserWithRoles([{ role: "admin" }])

        await setTryoutVolunteer(player.id, true)
        const result = await setTryoutVolunteer(player.id, false)

        expect(result.status).toBe(true)
        expect(await volunteerRows(player.id, current.id)).toHaveLength(0)
        // Last season's designation is untouched.
        expect(await volunteerRows(player.id, previous.id)).toHaveLength(1)
    })
})
