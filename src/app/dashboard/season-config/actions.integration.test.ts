import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { seasonEvents, seasons } from "@/database/schema"
import { seedBaselineSeason } from "@/test/factories"
import { createUserWithRoles } from "@/test/session"
import { getSeasonConfigData, saveSeasonConfig } from "./actions"

describe("getSeasonConfigData", () => {
    it("rejects non-admin callers", async () => {
        await seedBaselineSeason()
        await createUserWithRoles([{ role: "captain" }])

        const result = await getSeasonConfigData()
        expect(result.status).toBe(false)
        expect(result.message).toBe("Unauthorized")
    })

    it("returns the latest season with its events and time slots", async () => {
        const { season, tryoutEvent } = await seedBaselineSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getSeasonConfigData()

        expect(result.status).toBe(true)
        expect(result.data?.seasonId).toBe(season.id)
        expect(result.data?.season_amount).toBe("100.00")
        expect(result.data?.events).toHaveLength(1)
        expect(result.data?.events[0].id).toBe(tryoutEvent.id)
        expect(result.data?.events[0].time_slots).toHaveLength(1)
        expect(result.data?.events[0].time_slots[0].start_time).toBe("18:00:00")
    })
})

describe("saveSeasonConfig", () => {
    const metadata = {
        season_amount: "150.00",
        late_amount: "175.00",
        max_players: 120,
        certified_ref_rate: "30",
        uncertified_ref_rate: "20"
    }

    it("rejects non-admin callers without touching the season", async () => {
        const { season } = await seedBaselineSeason()
        await createUserWithRoles([{ role: "commissioner" }])

        const result = await saveSeasonConfig(season.id, metadata, [])

        expect(result).toEqual({ status: false, message: "Unauthorized" })
        const [unchanged] = await db
            .select()
            .from(seasons)
            .where(eq(seasons.id, season.id))
        expect(unchanged.season_amount).toBe("100.00")
    })

    it("rejects invalid season ids", async () => {
        await seedBaselineSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveSeasonConfig(0, metadata, [])
        expect(result).toEqual({ status: false, message: "Invalid season ID" })
    })

    it("updates metadata and replaces the event list atomically", async () => {
        const { season, tryoutEvent } = await seedBaselineSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveSeasonConfig(season.id, metadata, [
            {
                event_type: "regular_season",
                event_date: "2026-09-12",
                sort_order: 0,
                label: "Week 1",
                time_slots: [
                    { start_time: "19:00", slot_label: "Early", sort_order: 0 },
                    { start_time: "20:00", slot_label: "Late", sort_order: 1 }
                ]
            }
        ])

        expect(result.status).toBe(true)

        const [updated] = await db
            .select()
            .from(seasons)
            .where(eq(seasons.id, season.id))
        expect(updated.season_amount).toBe("150.00")
        expect(updated.max_players).toBe(120)

        const events = await db
            .select()
            .from(seasonEvents)
            .where(eq(seasonEvents.season_id, season.id))
        expect(events).toHaveLength(1)
        expect(events[0].event_type).toBe("regular_season")
        // The original tryout event was deleted, not kept alongside
        expect(events[0].id).not.toBe(tryoutEvent.id)
    })
})
