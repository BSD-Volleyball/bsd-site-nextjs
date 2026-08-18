import { and, eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import { auditLog, drafts, userUnavailability } from "@/database/schema"
import { AVAILABILITY_AUDIT_ACTION } from "@/lib/availability-audit"
import { sendBatchEmails } from "@/lib/postmark"
import {
    createDivision,
    createSeason,
    createSeasonEvent,
    createSignup,
    createTeam
} from "@/test/factories"
import { createUser, createUserWithRoles, logout } from "@/test/session"
import {
    getUserAvailabilityForCurrentSeason,
    saveUserAvailability
} from "./actions"

const mockedSendBatch = vi.mocked(sendBatchEmails)

async function seedSeasonWithPlayer() {
    const season = await createSeason()
    const player = await createUser()
    const signup = await createSignup({ season: season.id, player: player.id })
    const events = [
        await createSeasonEvent(season.id, {
            event_type: "regular_season",
            event_date: "2026-10-03",
            sort_order: 1
        }),
        await createSeasonEvent(season.id, {
            event_type: "regular_season",
            event_date: "2026-10-10",
            sort_order: 2
        })
    ]
    return { season, player, signup, events }
}

async function unavailableRowsFor(userId: string) {
    return db
        .select({
            eventId: userUnavailability.event_id,
            signupId: userUnavailability.signup_id
        })
        .from(userUnavailability)
        .where(eq(userUnavailability.user_id, userId))
}

describe("admin availability editing", () => {
    beforeEach(() => {
        process.env.NOTIFICATION_UNSUB_SECRET = "test-secret"
    })

    it("loads the player's current-season availability for an admin", async () => {
        const { season, player, signup, events } = await seedSeasonWithPlayer()
        await db.insert(userUnavailability).values({
            user_id: player.id,
            signup_id: signup.id,
            event_id: events[1].id
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await getUserAvailabilityForCurrentSeason(player.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.config.seasonId).toBe(season.id)
        expect(result.data.signupId).toBe(signup.id)
        expect(result.data.unavailableEventIds).toEqual([events[1].id])
        expect(result.data.isReturningPlayer).toBe(false)
    })

    it("replaces the player's rows, ties them to the signup, and audits", async () => {
        const { player, signup, events } = await seedSeasonWithPlayer()
        await db.insert(userUnavailability).values({
            user_id: player.id,
            signup_id: signup.id,
            event_id: events[0].id
        })
        const admin = await createUserWithRoles([{ role: "admin" }])

        const result = await saveUserAvailability(player.id, [events[1].id])

        expect(result.status).toBe(true)
        expect(await unavailableRowsFor(player.id)).toEqual([
            { eventId: events[1].id, signupId: signup.id }
        ])

        const audit = await db
            .select({ userId: auditLog.user, summary: auditLog.summary })
            .from(auditLog)
            .where(
                and(
                    eq(auditLog.action, AVAILABILITY_AUDIT_ACTION),
                    eq(auditLog.entity_id, String(signup.id))
                )
            )
        expect(audit).toHaveLength(1)
        // The audit row is attributed to the admin, not the player.
        expect(audit[0].userId).toBe(admin.id)
        expect(audit[0].summary).toContain("Admin edit")
        expect(audit[0].summary).toContain("10/10")
    })

    it("saves against the user alone when there is no signup this season", async () => {
        const season = await createSeason()
        const event = await createSeasonEvent(season.id)
        const ref = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveUserAvailability(ref.id, [event.id])

        expect(result.status).toBe(true)
        expect(await unavailableRowsFor(ref.id)).toEqual([
            { eventId: event.id, signupId: null }
        ])
    })

    it("leaves prior-season rows alone", async () => {
        const oldSeason = await createSeason()
        const oldEvent = await createSeasonEvent(oldSeason.id)
        const { player, events } = await seedSeasonWithPlayer()
        await db.insert(userUnavailability).values({
            user_id: player.id,
            event_id: oldEvent.id
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveUserAvailability(player.id, [events[0].id])

        expect(result.status).toBe(true)
        const rows = await unavailableRowsFor(player.id)
        expect(rows.map((r) => r.eventId).sort()).toEqual(
            [oldEvent.id, events[0].id].sort()
        )
    })

    it("rejects event ids from another season", async () => {
        const otherSeason = await createSeason()
        const otherEvent = await createSeasonEvent(otherSeason.id)
        const { player, events } = await seedSeasonWithPlayer()
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveUserAvailability(player.id, [
            events[0].id,
            otherEvent.id
        ])

        expect(result.status).toBe(false)
        expect(await unavailableRowsFor(player.id)).toHaveLength(0)
    })

    it("notifies the player's captain of the diff", async () => {
        const { season, player, events } = await seedSeasonWithPlayer()
        const division = await createDivision()
        const captain = await createUser()
        const team = await createTeam({
            season: season.id,
            division: division.id,
            captain: captain.id
        })
        await db.insert(drafts).values({
            team: team.id,
            user: player.id,
            round: 1,
            overall: 1
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveUserAvailability(player.id, [events[0].id])

        expect(result.status).toBe(true)
        expect(mockedSendBatch).toHaveBeenCalledTimes(1)
        expect(mockedSendBatch.mock.calls[0][0].map((m) => m.to)).toEqual([
            captain.email
        ])
    })

    it("refuses non-admins and anonymous callers", async () => {
        const { player, events } = await seedSeasonWithPlayer()

        await createUserWithRoles([{ role: "captain" }])
        expect(await saveUserAvailability(player.id, [events[0].id])).toEqual({
            status: false,
            message: "Unauthorized."
        })
        expect(await getUserAvailabilityForCurrentSeason(player.id)).toEqual({
            status: false,
            message: "Unauthorized."
        })

        logout()
        expect(await saveUserAvailability(player.id, [events[0].id])).toEqual({
            status: false,
            message: "Unauthorized."
        })
        expect(await unavailableRowsFor(player.id)).toHaveLength(0)
    })
})
