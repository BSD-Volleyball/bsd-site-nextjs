import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import { drafts, notificationOptouts } from "@/database/schema"
import { sendBatchEmails } from "@/lib/postmark"
import {
    createDivision,
    createSeason,
    createSeasonEvent,
    createSignup,
    createTeam
} from "@/test/factories"
import { createUser, loginAs } from "@/test/session"
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

    it("still saves availability if notification dispatch is impossible", async () => {
        const { player, signup, events } = await seedPlayerOnTeam()
        loginAs(player)
        mockedSendBatch.mockRejectedValueOnce(new Error("postmark down"))

        const result = await updatePlayerAvailability(signup.id, [events[1].id])
        expect(result.status).toBe(true)
    })
})
