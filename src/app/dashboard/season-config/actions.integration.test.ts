import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    eventTimeSlots,
    seasonEvents,
    seasons,
    tryoutVolunteerAssignments,
    tryoutVolunteerJobs,
    userUnavailability
} from "@/database/schema"
import { createSignup, seedBaselineSeason } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { getSeasonConfigData, saveSeasonConfig } from "./actions"

/** A player who has marked themselves unavailable for `eventId`. */
async function markPlayerUnavailable(seasonId: number, eventId: number) {
    const player = await createUser()
    const signup = await createSignup({ season: seasonId, player: player.id })
    await db.insert(userUnavailability).values({
        user_id: player.id,
        signup_id: signup.id,
        event_id: eventId
    })
    return { player, signup }
}

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
        expect(result).toEqual({ status: false, message: "Invalid season ID." })
    })

    it("updates metadata and adds a new event alongside the existing one", async () => {
        const { season, tryoutEvent } = await seedBaselineSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveSeasonConfig(season.id, metadata, [
            {
                id: tryoutEvent.id,
                event_type: "tryout",
                event_date: tryoutEvent.event_date,
                sort_order: 0,
                label: null,
                time_slots: [
                    {
                        id: null,
                        start_time: "18:00",
                        slot_label: null,
                        sort_order: 0
                    }
                ]
            },
            {
                id: null,
                event_type: "regular_season",
                event_date: "2026-09-12",
                sort_order: 0,
                label: "Week 1",
                time_slots: [
                    {
                        id: null,
                        start_time: "19:00",
                        slot_label: "Early",
                        sort_order: 0
                    },
                    {
                        id: null,
                        start_time: "20:00",
                        slot_label: "Late",
                        sort_order: 1
                    }
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
        expect(events).toHaveLength(2)
        // The existing event keeps its id — anything referencing it survives
        expect(events.map((e) => e.id)).toContain(tryoutEvent.id)
    })

    // Regression: time slots used to be deleted and reinserted on every save
    // (the code said "nothing references them"), but tryout volunteer
    // assignments reference slot ids with ON DELETE CASCADE — so any Season
    // Configuration save wiped every per-session volunteer assignment.
    it("preserves time slot ids and volunteer assignments on an unchanged save", async () => {
        const { season, tryoutEvent, tryoutSlot } = await seedBaselineSeason()
        const volunteer = await createUser()
        const [job] = await db
            .insert(tryoutVolunteerJobs)
            .values({
                season_id: season.id,
                event_id: tryoutEvent.id,
                name: "Scorekeeper",
                needed: 1,
                scope: "per_session",
                sort_order: 0
            })
            .returning()
        await db.insert(tryoutVolunteerAssignments).values({
            job_id: job.id,
            time_slot_id: tryoutSlot.id,
            user_id: volunteer.id
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveSeasonConfig(season.id, metadata, [
            {
                id: tryoutEvent.id,
                event_type: "tryout",
                event_date: tryoutEvent.event_date,
                sort_order: 0,
                label: null,
                time_slots: [
                    {
                        id: tryoutSlot.id,
                        start_time: "18:30",
                        slot_label: "Renamed",
                        sort_order: 0
                    },
                    {
                        id: null,
                        start_time: "20:00",
                        slot_label: null,
                        sort_order: 1
                    }
                ]
            }
        ])

        expect(result.status).toBe(true)

        const slots = await db
            .select()
            .from(eventTimeSlots)
            .where(eq(eventTimeSlots.event_id, tryoutEvent.id))
            .orderBy(eventTimeSlots.sort_order)
        expect(slots).toHaveLength(2)
        expect(slots[0].id).toBe(tryoutSlot.id)
        expect(slots[0].start_time).toBe("18:30:00")
        expect(slots[0].slot_label).toBe("Renamed")

        const assignments = await db
            .select()
            .from(tryoutVolunteerAssignments)
            .where(eq(tryoutVolunteerAssignments.job_id, job.id))
        expect(assignments).toHaveLength(1)
        expect(assignments[0].time_slot_id).toBe(tryoutSlot.id)

        // Dropping the slot from the payload is a real removal.
        const removal = await saveSeasonConfig(season.id, metadata, [
            {
                id: tryoutEvent.id,
                event_type: "tryout",
                event_date: tryoutEvent.event_date,
                sort_order: 0,
                label: null,
                time_slots: [
                    {
                        id: slots[1].id,
                        start_time: "20:00",
                        slot_label: null,
                        sort_order: 0
                    }
                ]
            }
        ])
        expect(removal.status).toBe(true)
        expect(
            await db
                .select()
                .from(eventTimeSlots)
                .where(eq(eventTimeSlots.event_id, tryoutEvent.id))
        ).toHaveLength(1)
        expect(
            await db
                .select()
                .from(tryoutVolunteerAssignments)
                .where(eq(tryoutVolunteerAssignments.job_id, job.id))
        ).toHaveLength(0)
    })

    it("refuses a slot id that belongs to a different event", async () => {
        const { season, tryoutEvent, tryoutSlot } = await seedBaselineSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveSeasonConfig(season.id, metadata, [
            {
                id: tryoutEvent.id,
                event_type: "tryout",
                event_date: tryoutEvent.event_date,
                sort_order: 0,
                label: null,
                time_slots: []
            },
            {
                id: null,
                event_type: "regular_season",
                event_date: "2026-09-12",
                sort_order: 0,
                label: null,
                time_slots: [
                    {
                        id: tryoutSlot.id,
                        start_time: "19:00",
                        slot_label: null,
                        sort_order: 0
                    }
                ]
            }
        ])
        expect(result.status).toBe(false)
        expect(result.message).toMatch(/time slots changed/)
    })

    // Regression: saveSeasonConfig used to delete every event row and reinsert
    // it, which cascaded away every user_unavailability row for the season.
    // That wiped ~230 rows of Fall 2026 player availability on 2026-08-05.
    it("preserves event ids and player availability on an unchanged save", async () => {
        const { season, tryoutEvent } = await seedBaselineSeason()
        const { player } = await markPlayerUnavailable(
            season.id,
            tryoutEvent.id
        )
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveSeasonConfig(season.id, metadata, [
            {
                id: tryoutEvent.id,
                event_type: "tryout",
                event_date: tryoutEvent.event_date,
                sort_order: 0,
                label: null,
                time_slots: [
                    {
                        id: null,
                        start_time: "18:00",
                        slot_label: null,
                        sort_order: 0
                    }
                ]
            }
        ])

        expect(result.status).toBe(true)

        const events = await db
            .select()
            .from(seasonEvents)
            .where(eq(seasonEvents.season_id, season.id))
        expect(events).toHaveLength(1)
        expect(events[0].id).toBe(tryoutEvent.id)

        const unavail = await db
            .select()
            .from(userUnavailability)
            .where(eq(userUnavailability.user_id, player.id))
        expect(unavail).toHaveLength(1)
        expect(unavail[0].event_id).toBe(tryoutEvent.id)
    })

    it("updates an existing event in place when its date changes", async () => {
        const { season, tryoutEvent } = await seedBaselineSeason()
        const { player } = await markPlayerUnavailable(
            season.id,
            tryoutEvent.id
        )
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveSeasonConfig(season.id, metadata, [
            {
                id: tryoutEvent.id,
                event_type: "tryout",
                event_date: "2026-09-19",
                sort_order: 3,
                label: "Tryout #1",
                time_slots: []
            }
        ])

        expect(result.status).toBe(true)

        const [event] = await db
            .select()
            .from(seasonEvents)
            .where(eq(seasonEvents.id, tryoutEvent.id))
        expect(event.event_date).toBe("2026-09-19")
        expect(event.label).toBe("Tryout #1")
        expect(event.sort_order).toBe(3)

        const unavail = await db
            .select()
            .from(userUnavailability)
            .where(eq(userUnavailability.user_id, player.id))
        expect(unavail).toHaveLength(1)
    })

    it("refuses to drop an event that players have marked unavailable", async () => {
        const { season, tryoutEvent } = await seedBaselineSeason()
        const { player } = await markPlayerUnavailable(
            season.id,
            tryoutEvent.id
        )
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveSeasonConfig(season.id, metadata, [])

        expect(result.status).toBe(false)
        expect(result.status === false && result.message).toContain("1 player")

        // Nothing was touched — not the event, not the availability, and not
        // the metadata, because the whole save is one transaction.
        const events = await db
            .select()
            .from(seasonEvents)
            .where(eq(seasonEvents.season_id, season.id))
        expect(events).toHaveLength(1)
        const unavail = await db
            .select()
            .from(userUnavailability)
            .where(eq(userUnavailability.user_id, player.id))
        expect(unavail).toHaveLength(1)
        const [unchanged] = await db
            .select()
            .from(seasons)
            .where(eq(seasons.id, season.id))
        expect(unchanged.season_amount).toBe("100.00")
    })

    it("drops the event and its availability when the caller confirms", async () => {
        const { season, tryoutEvent } = await seedBaselineSeason()
        const { player } = await markPlayerUnavailable(
            season.id,
            tryoutEvent.id
        )
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveSeasonConfig(season.id, metadata, [], {
            confirmDeletions: true
        })

        expect(result.status).toBe(true)

        const events = await db
            .select()
            .from(seasonEvents)
            .where(eq(seasonEvents.season_id, season.id))
        expect(events).toHaveLength(0)
        const unavail = await db
            .select()
            .from(userUnavailability)
            .where(eq(userUnavailability.user_id, player.id))
        expect(unavail).toHaveLength(0)
    })

    it("rejects an event id belonging to a different season", async () => {
        const { season } = await seedBaselineSeason()
        const other = await seedBaselineSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveSeasonConfig(season.id, metadata, [
            {
                id: other.tryoutEvent.id,
                event_type: "tryout",
                event_date: "2026-09-19",
                sort_order: 0,
                label: null,
                time_slots: []
            }
        ])

        expect(result.status).toBe(false)
        // The other season's event stays put
        const [untouched] = await db
            .select()
            .from(seasonEvents)
            .where(eq(seasonEvents.id, other.tryoutEvent.id))
        expect(untouched.season_id).toBe(other.season.id)
    })
})
