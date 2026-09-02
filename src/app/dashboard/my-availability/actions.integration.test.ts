import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import {
    auditLog,
    drafts,
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
import { sentSingleMessages, sentToAddresses } from "@/test/email"
import { createUser, createUserWithRoles, loginAs } from "@/test/session"
import { updatePlayerAvailability } from "./actions"

const mockedSendBatch = vi.mocked(sendBatchEmails)

async function seedPlayerOnTeam() {
    const season = await createSeason()
    const division = await createDivision()
    const captain = await createUser()
    const player = await createUser()
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
    const signup = await createSignup({ season: season.id, player: player.id })
    const events = [
        await createSeasonEvent(season.id, {
            event_type: "regular_season",
            event_date: "2026-10-03",
            sort_order: 1,
            label: "Week 1"
        }),
        await createSeasonEvent(season.id, {
            event_type: "regular_season",
            event_date: "2026-10-10",
            sort_order: 2,
            label: "Week 2"
        })
    ]
    return { season, captain, player, team, signup, events }
}

describe("updatePlayerAvailability captain notification", () => {
    beforeEach(() => {
        process.env.NOTIFICATION_UNSUB_SECRET = "test-secret"
    })

    it("notifies the captain when a rostered player's availability changes", async () => {
        const { captain, player, signup, events } = await seedPlayerOnTeam()
        loginAs(player)

        const result = await updatePlayerAvailability(signup.id, [
            events[0].id,
            events[1].id
        ])
        expect(result.status).toBe(true)

        expect(mockedSendBatch).toHaveBeenCalledTimes(1)
        const messages = mockedSendBatch.mock.calls[0][0]
        expect(messages.map((m) => m.to)).toEqual([captain.email])
        expect(messages[0].tag).toBe("availability-change")
    })

    it("skips captains who opted out of availability notifications", async () => {
        const { captain, player, signup, events } = await seedPlayerOnTeam()
        await db.insert(notificationOptouts).values({
            user_id: captain.id,
            notification_type: "captain_availability_change"
        })
        loginAs(player)

        const result = await updatePlayerAvailability(signup.id, [events[0].id])
        expect(result.status).toBe(true)
        expect(mockedSendBatch).not.toHaveBeenCalled()
    })

    it("sends nothing when the change is a no-op", async () => {
        const { player, signup, events } = await seedPlayerOnTeam()
        loginAs(player)

        await updatePlayerAvailability(signup.id, [events[0].id])
        mockedSendBatch.mockClear()

        // Same set again — no diff, no email.
        const result = await updatePlayerAvailability(signup.id, [events[0].id])
        expect(result.status).toBe(true)
        expect(mockedSendBatch).not.toHaveBeenCalled()
    })

    it("sends nothing when the player is not on a team", async () => {
        const season = await createSeason()
        const event = await createSeasonEvent(season.id)
        const player = await createUser()
        const signup = await createSignup({
            season: season.id,
            player: player.id
        })
        loginAs(player)

        const result = await updatePlayerAvailability(signup.id, [event.id])
        expect(result.status).toBe(true)
        expect(mockedSendBatch).not.toHaveBeenCalled()
    })

    it("rejects event ids that belong to another season", async () => {
        const { player, signup, events } = await seedPlayerOnTeam()
        const otherSeason = await createSeason()
        const otherEvent = await createSeasonEvent(otherSeason.id)
        loginAs(player)

        const result = await updatePlayerAvailability(signup.id, [
            events[0].id,
            otherEvent.id
        ])

        expect(result.status).toBe(false)
        // The whole save is rejected — no partial write.
        const rows = await db
            .select()
            .from(userUnavailability)
            .where(eq(userUnavailability.user_id, player.id))
        expect(rows).toHaveLength(0)
    })

    // Regression (2026-09-01): a player's first Fall save wiped their leftover
    // Spring rows and the captain email listed "Week 2 — Thursday, April 9,
    // 2026" under "Now available for". Prior seasons are history: the save
    // must neither delete them nor diff against them.
    it("leaves prior-season rows alone and out of the captain email", async () => {
        const { player, signup, events } = await seedPlayerOnTeam()
        const otherSeason = await createSeason()
        const otherEvent = await createSeasonEvent(otherSeason.id, {
            event_type: "regular_season",
            event_date: "2026-04-09",
            label: "Week 2 (last season)"
        })
        await db.insert(userUnavailability).values({
            user_id: player.id,
            event_id: otherEvent.id
        })
        loginAs(player)

        const result = await updatePlayerAvailability(signup.id, [events[0].id])

        expect(result.status).toBe(true)
        const rows = await db
            .select()
            .from(userUnavailability)
            .where(eq(userUnavailability.user_id, player.id))
        expect(rows.map((r) => r.event_id).sort()).toEqual(
            [otherEvent.id, events[0].id].sort()
        )

        expect(mockedSendBatch).toHaveBeenCalledTimes(1)
        const [message] = mockedSendBatch.mock.calls[0][0]
        expect(message.htmlBody).toContain("Now unavailable for:")
        expect(message.htmlBody).not.toContain("Now available for:")
        expect(message.htmlBody).not.toContain("April 9")
    })

    // The 2026-08-05 wipe was unrecoverable partly because nothing recorded
    // what players had entered. Each save now logs its full resulting set, so
    // the audit log alone can reconstruct any player's availability.
    it("logs the saved dates in the audit entry", async () => {
        const { player, signup, events } = await seedPlayerOnTeam()
        loginAs(player)

        await updatePlayerAvailability(signup.id, [events[1].id, events[0].id])

        const [entry] = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.user, player.id))
        expect(entry.action).toBe("update_availability")
        expect(entry.entity_type).toBe("user_unavailability")
        expect(entry.entity_id).toBe(String(signup.id))
        // Chronological, not the order the client happened to submit.
        expect(entry.summary).toBe("Unavailable for 2 dates: 10/3, 10/10")
    })

    it("logs an explicit all-clear when every date is deselected", async () => {
        const { player, signup, events } = await seedPlayerOnTeam()
        loginAs(player)

        await updatePlayerAvailability(signup.id, [events[0].id])
        await updatePlayerAvailability(signup.id, [])

        const entries = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.user, player.id))
            .orderBy(auditLog.id)
        expect(entries).toHaveLength(2)
        expect(entries[1].summary).toBe("Available for all dates")
    })

    it("writes no audit entry when the save is rejected", async () => {
        const { player, signup } = await seedPlayerOnTeam()
        const otherSeason = await createSeason()
        const otherEvent = await createSeasonEvent(otherSeason.id)
        loginAs(player)

        await updatePlayerAvailability(signup.id, [otherEvent.id])

        const entries = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.user, player.id))
        expect(entries).toHaveLength(0)
    })

    it("still saves availability if notification dispatch is impossible", async () => {
        const { player, signup, events } = await seedPlayerOnTeam()
        loginAs(player)
        mockedSendBatch.mockRejectedValueOnce(new Error("postmark down"))

        const result = await updatePlayerAvailability(signup.id, [events[1].id])
        expect(result.status).toBe(true)
    })
})

describe("updatePlayerAvailability admin tryout-roster notification", () => {
    async function seedPlacedPlayer() {
        const season = await createSeason()
        const division = await createDivision()
        const admin = await createUserWithRoles([{ role: "admin" }])
        const player = await createUser()
        const signup = await createSignup({
            season: season.id,
            player: player.id
        })
        const tryout1 = await createSeasonEvent(season.id, {
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
        const tryout3 = await createSeasonEvent(season.id, {
            event_type: "tryout",
            event_date: "2026-08-27",
            sort_order: 3,
            label: "Tryout #3"
        })
        await db.insert(week2Rosters).values({
            season: season.id,
            user: player.id,
            division: division.id,
            team_number: 1,
            is_captain: false
        })
        return { season, admin, player, signup, tryout1, tryout2, tryout3 }
    }

    it("emails admins when a player placed on a tryout roster opts out of that night", async () => {
        const { admin, player, signup, tryout2 } = await seedPlacedPlayer()
        loginAs(player)

        const result = await updatePlayerAvailability(signup.id, [tryout2.id])
        expect(result.status).toBe(true)

        // Staff mail to a single admin takes the 1:1 transport.
        expect(sentToAddresses()).toEqual([admin.email.toLowerCase()])
        const [message] = sentSingleMessages()
        expect(message.subject).toMatch(/Tryout #2/)
        expect(message.htmlBody).toContain(player.first_name)
        expect(message.htmlBody).toContain("Week 2")
        expect(message.tag).toBe("tryout-roster-conflict")
    })

    it("stays quiet when the newly-unavailable night has no roster placement", async () => {
        const { player, signup, tryout1, tryout3 } = await seedPlacedPlayer()
        loginAs(player)

        // Placed on the week-2 roster only; tryouts 1 and 3 have no rows.
        const result = await updatePlayerAvailability(signup.id, [
            tryout1.id,
            tryout3.id
        ])
        expect(result.status).toBe(true)
        expect(sentToAddresses()).toHaveLength(0)
    })

    it("does not re-notify when the conflicting night was already marked", async () => {
        const { player, signup, tryout2 } = await seedPlacedPlayer()
        await db.insert(userUnavailability).values({
            user_id: player.id,
            signup_id: signup.id,
            event_id: tryout2.id
        })
        loginAs(player)

        // Re-saving the same unavailability is not a new conflict.
        const result = await updatePlayerAvailability(signup.id, [tryout2.id])
        expect(result.status).toBe(true)
        expect(sentToAddresses()).toHaveLength(0)
    })
})
