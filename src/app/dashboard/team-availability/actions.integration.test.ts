import { beforeEach, describe, expect, it } from "vitest"
import {
    createDivision,
    createSeason,
    createSeasonEvent,
    createTeam,
    seedBaselineSeason
} from "@/test/factories"
import { createUser, loginAs } from "@/test/session"
import { getTeamAvailabilityData } from "./actions"

describe("getTeamAvailabilityData event ordering", () => {
    let currentSeasonId: number

    beforeEach(async () => {
        await seedBaselineSeason()
        currentSeasonId = (await createSeason()).id

        const captain = await createUser()
        const division = await createDivision()
        await createTeam({
            season: currentSeasonId,
            captain: captain.id,
            division: division.id
        })
        loginAs(captain)
    })

    it("returns events chronologically even when playoff sort_order restarts at 1", async () => {
        // Playoff events carry their own sort_order sequence (1..n), so
        // ordering by sort_order alone interleaves them into the first weeks.
        await createSeasonEvent(currentSeasonId, {
            event_type: "regular_season",
            event_date: "2026-09-10",
            sort_order: 1,
            label: "Week 1"
        })
        await createSeasonEvent(currentSeasonId, {
            event_type: "regular_season",
            event_date: "2026-09-17",
            sort_order: 2,
            label: "Week 2"
        })
        await createSeasonEvent(currentSeasonId, {
            event_type: "regular_season",
            event_date: "2026-09-24",
            sort_order: 3,
            label: "Week 3"
        })
        await createSeasonEvent(currentSeasonId, {
            event_type: "playoff",
            event_date: "2026-10-22",
            sort_order: 1,
            label: "Playoff Round 1"
        })
        await createSeasonEvent(currentSeasonId, {
            event_type: "playoff",
            event_date: "2026-10-29",
            sort_order: 2,
            label: "Playoff Round 2"
        })

        const result = await getTeamAvailabilityData()
        expect(result.status).toBe(true)
        if (!result.status) return

        const dates = result.data.events.map((e) => e.eventDate)
        expect(dates).toEqual([
            "2026-09-10",
            "2026-09-17",
            "2026-09-24",
            "2026-10-22",
            "2026-10-29"
        ])
    })

    it("excludes tryout and draft events from the matrix", async () => {
        await createSeasonEvent(currentSeasonId, {
            event_type: "tryout",
            event_date: "2026-09-01",
            sort_order: 1
        })
        await createSeasonEvent(currentSeasonId, {
            event_type: "regular_season",
            event_date: "2026-09-10",
            sort_order: 1,
            label: "Week 1"
        })

        const result = await getTeamAvailabilityData()
        expect(result.status).toBe(true)
        if (!result.status) return

        expect(result.data.events).toHaveLength(1)
        expect(result.data.events[0].eventType).toBe("regular_season")
    })
})
