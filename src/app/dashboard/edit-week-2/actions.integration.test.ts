import { beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"
import { db } from "@/database/db"
import {
    notificationOptouts,
    userUnavailability,
    week2Rosters
} from "@/database/schema"
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
    getEditWeek2Data,
    sendWeek2RosterNotifications,
    updateWeek2Rosters
} from "./actions"

const mockedSendBatch = vi.mocked(sendBatchEmails)

describe("updateWeek2Rosters", () => {
    it("rejects unauthenticated callers", async () => {
        logout()
        const result = await updateWeek2Rosters([])
        expect(result.status).toBe(false)
    })

    it("rejects authenticated non-admins", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const result = await updateWeek2Rosters([])
        expect(result.status).toBe(false)
    })

    it("requires every slotted player to be signed up", async () => {
        const season = await createSeason()
        const division = await createDivision()
        const notSignedUp = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await updateWeek2Rosters([
            {
                divisionId: division.id,
                teamNumber: 1,
                userId: notSignedUp.id,
                isCaptain: false
            }
        ])

        expect(result.status).toBe(false)
        expect(!result.status && result.message).toContain("signed up")
        void season
    })

    it("rejects a captain slot whose player does not captain that division", async () => {
        const season = await createSeason()
        const captainedDivision = await createDivision({ name: "AA" })
        const otherDivision = await createDivision({ name: "A", level: 2 })
        const captain = await createUser()
        await createSignup({ season: season.id, player: captain.id })
        await createTeam({
            season: season.id,
            captain: captain.id,
            division: captainedDivision.id
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await updateWeek2Rosters([
            {
                divisionId: otherDivision.id,
                teamNumber: 1,
                userId: captain.id,
                isCaptain: true
            }
        ])

        expect(result.status).toBe(false)
        expect(!result.status && result.message).toContain(
            "does not contain a captain assigned to that division"
        )
    })

    it("replaces the season's rosters with the submitted slots", async () => {
        const season = await createSeason()
        const division = await createDivision()
        const previous = await createUser()
        const next = await createUser()
        await createSignup({ season: season.id, player: previous.id })
        await createSignup({ season: season.id, player: next.id })
        await db.insert(week2Rosters).values({
            season: season.id,
            user: previous.id,
            division: division.id,
            team_number: 1,
            is_captain: false
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await updateWeek2Rosters([
            {
                divisionId: division.id,
                teamNumber: 2,
                userId: next.id,
                isCaptain: false
            }
        ])

        expect(result.status).toBe(true)

        const rows = await db
            .select()
            .from(week2Rosters)
            .where(eq(week2Rosters.season, season.id))
        expect(rows).toHaveLength(1)
        expect(rows[0].user).toBe(next.id)
        expect(rows[0].team_number).toBe(2)
    })
})

describe("getEditWeek2Data", () => {
    it("returns signup players and existing roster slots for admins", async () => {
        const season = await createSeason()
        const division = await createDivision()
        const player = await createUser()
        await createSignup({ season: season.id, player: player.id })
        await db.insert(week2Rosters).values({
            season: season.id,
            user: player.id,
            division: division.id,
            team_number: 3,
            is_captain: false
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await getEditWeek2Data()

        expect(result.status).toBe(true)
        expect(result.players.map((p) => p.id)).toContain(player.id)
        expect(result.slots).toHaveLength(1)
        expect(result.slots[0].userId).toBe(player.id)
        expect(result.slots[0].teamNumber).toBe(3)
    })

    it("keeps roster occupants who are no longer eligible, flagged with a reason", async () => {
        const season = await createSeason()
        const division = await createDivision()
        await createSeasonEvent(season.id, {
            event_type: "tryout",
            event_date: "2026-08-13",
            sort_order: 1,
            label: "Tryout #1"
        })
        const tryout2 = await createSeasonEvent(season.id, {
            event_type: "tryout",
            event_date: "2026-08-20",
            sort_order: 2,
            label: "Tryout #2"
        })

        const available = await createUser()
        await createSignup({ season: season.id, player: available.id })

        // Placed, then marked themselves unavailable for the week-2 night.
        const optedOut = await createUser()
        const optedOutSignup = await createSignup({
            season: season.id,
            player: optedOut.id
        })
        await db.insert(userUnavailability).values({
            user_id: optedOut.id,
            signup_id: optedOutSignup.id,
            event_id: tryout2.id
        })

        // Placed, then their signup was removed entirely.
        const unsignedUp = await createUser()

        await db.insert(week2Rosters).values([
            {
                season: season.id,
                user: available.id,
                division: division.id,
                team_number: 1,
                is_captain: false
            },
            {
                season: season.id,
                user: optedOut.id,
                division: division.id,
                team_number: 1,
                is_captain: false
            },
            {
                season: season.id,
                user: unsignedUp.id,
                division: division.id,
                team_number: 2,
                is_captain: false
            }
        ])
        await createUserWithRoles([{ role: "admin" }])

        const result = await getEditWeek2Data()
        expect(result.status).toBe(true)

        const byId = new Map(result.players.map((p) => [p.id, p]))
        expect(byId.get(available.id)?.unavailableReason).toBeNull()
        expect(byId.get(optedOut.id)?.unavailableReason).toMatch(/Tryout #2/)
        expect(byId.get(optedOut.id)?.firstName).toBe(optedOut.first_name)
        expect(byId.get(unsignedUp.id)?.unavailableReason).toMatch(
            /not signed up/i
        )
        expect(byId.get(unsignedUp.id)?.firstName).toBe(unsignedUp.first_name)
        // Every roster occupant resolves to a name.
        for (const slot of result.slots) {
            expect(byId.has(slot.userId)).toBe(true)
        }
    })

    it("rejects non-admins", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const result = await getEditWeek2Data()
        expect(result.status).toBe(false)
    })
})

describe("sendWeek2RosterNotifications", () => {
    beforeEach(() => {
        process.env.NOTIFICATION_UNSUB_SECRET = "test-secret"
    })

    it("requires admin access", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const result = await sendWeek2RosterNotifications(
            [
                {
                    userId: "x",
                    divisionId: 1,
                    divisionName: "AA",
                    teamNumber: 1
                }
            ],
            [],
            "Fall 2026"
        )
        expect(result.status).toBe(false)
    })

    it("sends assignment and removal emails, skipping opted-out players", async () => {
        await createSeason()
        const division = await createDivision({ name: "AA" })
        const assigned = await createUser()
        const optedOut = await createUser()
        const removed = await createUser()
        await db.insert(notificationOptouts).values({
            user_id: optedOut.id,
            notification_type: "tryout_roster"
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await sendWeek2RosterNotifications(
            [
                {
                    userId: assigned.id,
                    divisionId: division.id,
                    divisionName: division.name,
                    teamNumber: 1
                },
                {
                    userId: optedOut.id,
                    divisionId: division.id,
                    divisionName: division.name,
                    teamNumber: 2
                }
            ],
            [removed.id],
            "Fall 2026"
        )

        expect(result.status).toBe(true)
        expect(result.status && result.message).toContain("2 notification(s)")
        expect(result.status && result.message).toContain("1 skipped")

        const sentTo = mockedSendBatch.mock.calls.flatMap((call) =>
            call[0].map((m) => m.to)
        )
        expect(sentTo).toContain(assigned.email)
        expect(sentTo).toContain(removed.email)
        expect(sentTo).not.toContain(optedOut.email)
    })
})
