import { desc, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    eventTimeSlots,
    individual_divisions,
    seasonEvents,
    seasons
} from "@/database/schema"
import {
    createDivision,
    createEventTimeSlot,
    createSeason as seedSeason,
    createSeasonEvent
} from "@/test/factories"
import { createUserWithRoles } from "@/test/session"
import { createSeason } from "./actions"

// Seeds a "previous" season (Spring 2026, complete) with pricing, one
// per-season division config, and one event + time slot — the shape the
// createSeason action clones from.
async function seedSourceSeason() {
    const season = await seedSeason({
        code: "S26",
        year: 2026,
        season: "spring",
        phase: "complete",
        season_amount: "100.00",
        late_amount: "120.00",
        max_players: 96,
        certified_ref_rate: "30",
        uncertified_ref_rate: "20"
    })
    const division = await createDivision({ name: "Comp", level: 1 })
    await db.insert(individual_divisions).values({
        season: season.id,
        division: division.id,
        coaches: true,
        gender_split: "mens",
        teams: 8
    })
    const event = await createSeasonEvent(season.id, {
        event_type: "regular_season",
        event_date: "2026-03-01",
        sort_order: 0,
        label: "Week 1"
    })
    await createEventTimeSlot(event.id, {
        start_time: "18:00",
        slot_label: "Early",
        sort_order: 0
    })
    return { season, division, event }
}

describe("createSeason", () => {
    it("rejects non-admin callers without creating a season", async () => {
        await seedSourceSeason()
        await createUserWithRoles([{ role: "commissioner" }])

        const result = await createSeason({
            season: "fall",
            year: 2026,
            code: "F26"
        })

        expect(result).toEqual({ status: false, message: "Unauthorized" })
        const all = await db.select().from(seasons)
        expect(all).toHaveLength(1)
    })

    it("creates an off-season season and clones config from the latest season", async () => {
        const { season: source, division, event } = await seedSourceSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await createSeason({
            season: "Fall",
            year: 2026,
            code: "F26"
        })

        expect(result.status).toBe(true)
        const newId = result.status ? result.data.seasonId : 0
        expect(newId).not.toBe(source.id)

        // New row: identity set, phase defaulted, pricing/ref-rate copied
        const [created] = await db
            .select()
            .from(seasons)
            .where(eq(seasons.id, newId))
        expect(created.season).toBe("fall")
        expect(created.year).toBe(2026)
        expect(created.code).toBe("F26")
        expect(created.phase).toBe("off_season")
        expect(created.season_amount).toBe("100.00")
        expect(created.late_amount).toBe("120.00")
        expect(created.max_players).toBe(96)
        expect(created.certified_ref_rate).toBe("30")
        expect(created.uncertified_ref_rate).toBe("20")

        // It is now the current season (highest id)
        const [latest] = await db
            .select()
            .from(seasons)
            .orderBy(desc(seasons.id))
            .limit(1)
        expect(latest.id).toBe(newId)

        // individual_divisions cloned to the new season
        const clonedDivisions = await db
            .select()
            .from(individual_divisions)
            .where(eq(individual_divisions.season, newId))
        expect(clonedDivisions).toHaveLength(1)
        expect(clonedDivisions[0].division).toBe(division.id)
        expect(clonedDivisions[0].coaches).toBe(true)
        expect(clonedDivisions[0].gender_split).toBe("mens")
        expect(clonedDivisions[0].teams).toBe(8)

        // season_events cloned as new rows (not moved off the source)
        const clonedEvents = await db
            .select()
            .from(seasonEvents)
            .where(eq(seasonEvents.season_id, newId))
        expect(clonedEvents).toHaveLength(1)
        expect(clonedEvents[0].id).not.toBe(event.id)
        expect(clonedEvents[0].event_type).toBe("regular_season")
        expect(clonedEvents[0].event_date).toBe("2026-03-01")
        expect(clonedEvents[0].label).toBe("Week 1")

        // event_time_slots cloned under the new event
        const clonedSlots = await db
            .select()
            .from(eventTimeSlots)
            .where(eq(eventTimeSlots.event_id, clonedEvents[0].id))
        expect(clonedSlots).toHaveLength(1)
        expect(clonedSlots[0].start_time).toBe("18:00:00")
        expect(clonedSlots[0].slot_label).toBe("Early")

        // Source season's events remain intact
        const sourceEvents = await db
            .select()
            .from(seasonEvents)
            .where(eq(seasonEvents.season_id, source.id))
        expect(sourceEvents).toHaveLength(1)
    })

    it("rejects a duplicate year + season", async () => {
        await seedSourceSeason()
        await createUserWithRoles([{ role: "admin" }])

        const first = await createSeason({
            season: "fall",
            year: 2026,
            code: "F26"
        })
        expect(first.status).toBe(true)

        const second = await createSeason({
            season: "fall",
            year: 2026,
            code: "F26B"
        })
        expect(second).toEqual({
            status: false,
            message: "A Fall 2026 season already exists"
        })
    })

    it("validates identity fields", async () => {
        await seedSourceSeason()
        await createUserWithRoles([{ role: "admin" }])

        expect(
            await createSeason({ season: "fall", year: 1999, code: "F99" })
        ).toEqual({ status: false, message: "Enter a valid year" })

        expect(
            await createSeason({ season: "fall", year: 2026, code: "  " })
        ).toEqual({ status: false, message: "Season code is required" })

        expect(
            await createSeason({ season: "", year: 2026, code: "F26" })
        ).toEqual({ status: false, message: "Season name is required" })
    })
})
