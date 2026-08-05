import { asc, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { db } from "@/database/db"
import {
    tryoutVolunteerAssignments,
    tryoutVolunteerJobs
} from "@/database/schema"
import {
    createEventTimeSlot,
    createSeason,
    createSeasonEvent,
    seedBaselineSeason
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"

import {
    getConfigureTryoutJobsView,
    importJobsFromLastSeason,
    saveTryoutJobs,
    type TryoutJobInput
} from "./actions"

function job(overrides: Partial<TryoutJobInput> = {}): TryoutJobInput {
    return {
        id: null,
        name: "Scorekeeper",
        needed: 2,
        scope: "per_session",
        notes: null,
        ...overrides
    }
}

describe("getConfigureTryoutJobsView", () => {
    it("rejects unauthenticated callers", async () => {
        await seedBaselineSeason()

        // The read action leads with requireAdmin(), so an anonymous caller
        // is indistinguishable from a logged-in non-admin.
        const result = await getConfigureTryoutJobsView()
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("rejects authenticated non-admins", async () => {
        await seedBaselineSeason()
        await createUserWithRoles([{ role: "captain" }])

        const result = await getConfigureTryoutJobsView()
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("returns each tryout night with its sessions and jobs", async () => {
        const { season, tryoutEvent } = await seedBaselineSeason()
        await createUserWithRoles([{ role: "admin" }])
        await db.insert(tryoutVolunteerJobs).values({
            season_id: season.id,
            event_id: tryoutEvent.id,
            name: "Check-in Table",
            needed: 2,
            scope: "whole_night",
            sort_order: 0
        })

        const result = await getConfigureTryoutJobsView()

        expect(result.status).toBe(true)
        const nights = result.status ? result.data?.nights : undefined
        expect(nights).toHaveLength(1)
        expect(nights?.[0].ordinal).toBe(1)
        expect(nights?.[0].timeSlots).toHaveLength(1)
        expect(nights?.[0].jobs).toHaveLength(1)
        expect(nights?.[0].jobs[0].name).toBe("Check-in Table")
        expect(nights?.[0].jobs[0].assignmentCount).toBe(0)
    })

    it("counts existing assignments per job", async () => {
        const { season, tryoutEvent, tryoutSlot } = await seedBaselineSeason()
        const volunteer = await createUser()
        await createUserWithRoles([{ role: "admin" }])
        const [row] = await db
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
            job_id: row.id,
            time_slot_id: tryoutSlot.id,
            user_id: volunteer.id
        })

        const result = await getConfigureTryoutJobsView()

        expect(result.status).toBe(true)
        const jobs = result.status ? result.data?.nights[0].jobs : undefined
        expect(jobs?.[0].assignmentCount).toBe(1)
    })
})

describe("saveTryoutJobs", () => {
    it("rejects unauthenticated callers", async () => {
        const { tryoutEvent } = await seedBaselineSeason()

        const result = await saveTryoutJobs(tryoutEvent.id, [job()])
        expect(result).toEqual({ status: false, message: "Not authenticated." })
    })

    it("rejects authenticated non-admins", async () => {
        const { tryoutEvent } = await seedBaselineSeason()
        await createUserWithRoles([{ role: "captain" }])

        const result = await saveTryoutJobs(tryoutEvent.id, [job()])
        expect(result).toEqual({ status: false, message: "Unauthorized." })

        const rows = await db.select().from(tryoutVolunteerJobs)
        expect(rows).toHaveLength(0)
    })

    it("rejects an invalid event id", async () => {
        await seedBaselineSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveTryoutJobs(0, [job()])
        expect(result).toEqual({
            status: false,
            message: "Invalid event ID."
        })
    })

    it("rejects an event belonging to another season", async () => {
        await seedBaselineSeason()
        const other = await createSeason()
        const otherEvent = await createSeasonEvent(other.id)
        // The newest season is now `other`, so seed a newer current season.
        const current = await createSeason()
        await createSeasonEvent(current.id)
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveTryoutJobs(otherEvent.id, [job()])
        expect(result).toEqual({
            status: false,
            message: "Tryout date not found in the current season."
        })
    })

    it("rejects a non-tryout event", async () => {
        const { season } = await seedBaselineSeason()
        const draftEvent = await createSeasonEvent(season.id, {
            event_type: "draft",
            sort_order: 5
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveTryoutJobs(draftEvent.id, [job()])
        expect(result).toEqual({
            status: false,
            message: "Tryout date not found in the current season."
        })
    })

    it("rejects duplicate job names on the same night", async () => {
        const { tryoutEvent } = await seedBaselineSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveTryoutJobs(tryoutEvent.id, [
            job({ name: "Scorekeeper" }),
            job({ name: "scorekeeper" })
        ])
        expect(result.status).toBe(false)
        expect(result.message).toContain("Duplicate job name")
    })

    it("rejects a needed count below one", async () => {
        const { tryoutEvent } = await seedBaselineSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveTryoutJobs(tryoutEvent.id, [
            job({ needed: 0 })
        ])
        expect(result.status).toBe(false)
        expect(result.message).toContain("between 1 and 50")
    })

    it("inserts new jobs with their array position as sort order", async () => {
        const { season, tryoutEvent } = await seedBaselineSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveTryoutJobs(tryoutEvent.id, [
            job({ name: "Check-in Table", scope: "whole_night", needed: 2 }),
            job({ name: "Scorekeeper", scope: "per_session", needed: 1 })
        ])

        expect(result.status).toBe(true)
        const rows = await db
            .select()
            .from(tryoutVolunteerJobs)
            .orderBy(asc(tryoutVolunteerJobs.sort_order))
        expect(rows).toHaveLength(2)
        expect(rows[0].name).toBe("Check-in Table")
        expect(rows[0].scope).toBe("whole_night")
        expect(rows[0].season_id).toBe(season.id)
        expect(rows[1].name).toBe("Scorekeeper")
        expect(rows[1].sort_order).toBe(1)
    })

    // Regression: a full delete-and-reinsert save would cascade every
    // assignment away on an otherwise no-op edit.
    it("preserves job ids and their assignments on an unchanged save", async () => {
        const { season, tryoutEvent, tryoutSlot } = await seedBaselineSeason()
        const volunteer = await createUser()
        await createUserWithRoles([{ role: "admin" }])
        const [existing] = await db
            .insert(tryoutVolunteerJobs)
            .values({
                season_id: season.id,
                event_id: tryoutEvent.id,
                name: "Scorekeeper",
                needed: 2,
                scope: "per_session",
                sort_order: 0
            })
            .returning()
        await db.insert(tryoutVolunteerAssignments).values({
            job_id: existing.id,
            time_slot_id: tryoutSlot.id,
            user_id: volunteer.id
        })

        const result = await saveTryoutJobs(tryoutEvent.id, [
            job({ id: existing.id, name: "Scorekeeper", needed: 2 })
        ])

        expect(result.status).toBe(true)
        const rows = await db.select().from(tryoutVolunteerJobs)
        expect(rows).toHaveLength(1)
        expect(rows[0].id).toBe(existing.id)
        const assignments = await db.select().from(tryoutVolunteerAssignments)
        expect(assignments).toHaveLength(1)
    })

    it("drops assignments when a job's scope changes", async () => {
        const { season, tryoutEvent, tryoutSlot } = await seedBaselineSeason()
        const volunteer = await createUser()
        await createUserWithRoles([{ role: "admin" }])
        const [existing] = await db
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
            job_id: existing.id,
            time_slot_id: tryoutSlot.id,
            user_id: volunteer.id
        })

        const result = await saveTryoutJobs(tryoutEvent.id, [
            job({ id: existing.id, scope: "whole_night" })
        ])

        expect(result.status).toBe(true)
        const assignments = await db.select().from(tryoutVolunteerAssignments)
        expect(assignments).toHaveLength(0)
    })

    it("deletes jobs missing from the payload", async () => {
        const { season, tryoutEvent } = await seedBaselineSeason()
        await createUserWithRoles([{ role: "admin" }])
        await db.insert(tryoutVolunteerJobs).values({
            season_id: season.id,
            event_id: tryoutEvent.id,
            name: "Scorekeeper",
            needed: 1,
            scope: "per_session",
            sort_order: 0
        })

        const result = await saveTryoutJobs(tryoutEvent.id, [])

        expect(result.status).toBe(true)
        const rows = await db.select().from(tryoutVolunteerJobs)
        expect(rows).toHaveLength(0)
    })

    it("refuses a payload naming a job from a different night", async () => {
        const { season, tryoutEvent } = await seedBaselineSeason()
        const secondNight = await createSeasonEvent(season.id, {
            sort_order: 1,
            event_date: "2026-09-12"
        })
        await createUserWithRoles([{ role: "admin" }])
        const [foreign] = await db
            .insert(tryoutVolunteerJobs)
            .values({
                season_id: season.id,
                event_id: secondNight.id,
                name: "Scorekeeper",
                needed: 1,
                scope: "per_session",
                sort_order: 0
            })
            .returning()

        const result = await saveTryoutJobs(tryoutEvent.id, [
            job({ id: foreign.id })
        ])

        expect(result.status).toBe(false)
        expect(result.message).toContain("changed while you were editing")
    })
})

describe("importJobsFromLastSeason", () => {
    /**
     * Builds a previous season with `nightCount` tryout nights and one job
     * per night, then a current season with the same number of nights.
     */
    async function seedTwoSeasons(nightCount = 3) {
        const previous = await createSeason()
        const previousNights = []
        for (let i = 0; i < nightCount; i++) {
            const event = await createSeasonEvent(previous.id, {
                sort_order: i,
                event_date: `2025-09-0${i + 1}`
            })
            await createEventTimeSlot(event.id)
            const [jobRow] = await db
                .insert(tryoutVolunteerJobs)
                .values({
                    season_id: previous.id,
                    event_id: event.id,
                    name: `Night ${i + 1} Job`,
                    needed: i + 1,
                    scope: i === 0 ? "whole_night" : "per_session",
                    notes: `note ${i + 1}`,
                    sort_order: 0
                })
                .returning()
            previousNights.push({ event, jobRow })
        }

        const current = await createSeason()
        const currentNights = []
        for (let i = 0; i < nightCount; i++) {
            const event = await createSeasonEvent(current.id, {
                sort_order: i,
                event_date: `2026-09-0${i + 1}`
            })
            await createEventTimeSlot(event.id)
            currentNights.push(event)
        }

        return { previous, previousNights, current, currentNights }
    }

    it("rejects authenticated non-admins", async () => {
        await seedTwoSeasons(1)
        await createUserWithRoles([{ role: "captain" }])

        const result = await importJobsFromLastSeason()
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("fails cleanly when there is no previous season", async () => {
        await seedBaselineSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await importJobsFromLastSeason()
        expect(result).toEqual({
            status: false,
            message: "There is no previous season to import from."
        })
    })

    it("fails cleanly when the previous season has no jobs", async () => {
        const previous = await createSeason()
        await createSeasonEvent(previous.id)
        const current = await createSeason()
        await createSeasonEvent(current.id)
        await createUserWithRoles([{ role: "admin" }])

        const result = await importJobsFromLastSeason()
        expect(result.status).toBe(false)
        expect(result.message).toContain("no volunteer jobs to import")
    })

    it("maps tryout nights by position, 1→1 / 2→2 / 3→3", async () => {
        const { currentNights } = await seedTwoSeasons(3)
        await createUserWithRoles([{ role: "admin" }])

        const result = await importJobsFromLastSeason()

        expect(result.status).toBe(true)
        expect(result.status && result.data.imported).toBe(3)

        for (const [index, event] of currentNights.entries()) {
            const rows = await db
                .select()
                .from(tryoutVolunteerJobs)
                .where(eq(tryoutVolunteerJobs.event_id, event.id))
            expect(rows).toHaveLength(1)
            expect(rows[0].name).toBe(`Night ${index + 1} Job`)
            expect(rows[0].needed).toBe(index + 1)
            expect(rows[0].scope).toBe(
                index === 0 ? "whole_night" : "per_session"
            )
            expect(rows[0].notes).toBe(`note ${index + 1}`)
        }
    })

    it("is idempotent — a second run imports nothing", async () => {
        await seedTwoSeasons(2)
        await createUserWithRoles([{ role: "admin" }])

        const first = await importJobsFromLastSeason()
        expect(first.status && first.data.imported).toBe(2)

        const second = await importJobsFromLastSeason()
        expect(second.status).toBe(true)
        expect(second.status && second.data.imported).toBe(0)
        expect(second.status && second.data.skipped).toBe(2)

        const rows = await db.select().from(tryoutVolunteerJobs)
        // 2 from the previous season + 2 imported, and no duplicates.
        expect(rows).toHaveLength(4)
    })

    it("skips source jobs on nights this season doesn't have", async () => {
        const previous = await createSeason()
        for (let i = 0; i < 3; i++) {
            const event = await createSeasonEvent(previous.id, {
                sort_order: i,
                event_date: `2025-09-0${i + 1}`
            })
            await db.insert(tryoutVolunteerJobs).values({
                season_id: previous.id,
                event_id: event.id,
                name: `Night ${i + 1} Job`,
                needed: 1,
                scope: "whole_night",
                sort_order: 0
            })
        }
        // This season only runs two tryout nights.
        const current = await createSeason()
        await createSeasonEvent(current.id, { sort_order: 0 })
        await createSeasonEvent(current.id, { sort_order: 1 })
        await createUserWithRoles([{ role: "admin" }])

        const result = await importJobsFromLastSeason()

        expect(result.status).toBe(true)
        expect(result.status && result.data.imported).toBe(2)
        expect(result.status && result.data.skipped).toBe(1)
    })
})
