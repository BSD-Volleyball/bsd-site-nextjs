import { eq } from "drizzle-orm"
import { describe, expect, it, vi } from "vitest"

import { db } from "@/database/db"
import {
    seasonEvents,
    tryoutVolunteerAssignments,
    tryoutVolunteerJobs,
    userRoles,
    week1Rosters,
    week2Rosters
} from "@/database/schema"
import { sendBatchEmails } from "@/lib/postmark"
import {
    createDivision,
    createEventTimeSlot,
    createSeason,
    createSeasonEvent
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"

import {
    assignVolunteer,
    getAssignTryoutJobsView,
    sendVolunteerAssignmentEmails,
    unassignVolunteer
} from "./actions"

const mockedSendBatch = vi.mocked(sendBatchEmails)

/** One tryout night with three sessions, plus a whole-night and a per-session job. */
async function seedTryoutNight() {
    const season = await createSeason()
    const event = await createSeasonEvent(season.id, {
        sort_order: 0,
        event_date: "2026-09-10"
    })
    const slots = []
    for (let i = 0; i < 3; i++) {
        slots.push(
            await createEventTimeSlot(event.id, {
                start_time: `${18 + i}:00`,
                sort_order: i
            })
        )
    }

    const [wholeNightJob] = await db
        .insert(tryoutVolunteerJobs)
        .values({
            season_id: season.id,
            event_id: event.id,
            name: "Check-in Table",
            needed: 2,
            scope: "whole_night",
            sort_order: 0
        })
        .returning()
    const [perSessionJob] = await db
        .insert(tryoutVolunteerJobs)
        .values({
            season_id: season.id,
            event_id: event.id,
            name: "Scorekeeper",
            needed: 2,
            scope: "per_session",
            sort_order: 1
        })
        .returning()

    return { season, event, slots, wholeNightJob, perSessionJob }
}

/**
 * Adds a court list to the seeded night plus a per-court, per-session job
 * — the "3 people × 3 sessions × 2 courts = 18 slots" case.
 */
async function addPerCourtJob(
    seasonId: number,
    eventId: number,
    courtNumbers = [1, 2]
) {
    await db
        .update(seasonEvents)
        .set({ court_numbers: courtNumbers })
        .where(eq(seasonEvents.id, eventId))
    const [perCourtJob] = await db
        .insert(tryoutVolunteerJobs)
        .values({
            season_id: seasonId,
            event_id: eventId,
            name: "Line Judge",
            needed: 3,
            scope: "per_session",
            court_scope: "per_court",
            sort_order: 2
        })
        .returning()
    return perCourtJob
}

async function makeVolunteer(seasonId: number, lastName = "Volunteer") {
    const user = await createUser({ last_name: lastName })
    await db.insert(userRoles).values({
        user_id: user.id,
        role: "tryout_volunteer",
        season_id: seasonId
    })
    return user
}

describe("getAssignTryoutJobsView", () => {
    it("rejects unauthenticated callers", async () => {
        await seedTryoutNight()

        const result = await getAssignTryoutJobsView()
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("rejects authenticated non-admins", async () => {
        await seedTryoutNight()
        await createUserWithRoles([{ role: "captain" }])

        const result = await getAssignTryoutJobsView()
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("gives a whole-night job one slot and a per-session job one per session", async () => {
        await seedTryoutNight()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getAssignTryoutJobsView()

        expect(result.status).toBe(true)
        const jobs = result.status ? (result.data?.nights[0].jobs ?? []) : []
        expect(jobs).toHaveLength(2)
        expect(jobs[0].name).toBe("Check-in Table")
        expect(jobs[0].slots).toHaveLength(1)
        expect(jobs[0].slots[0].timeSlotId).toBeNull()
        expect(jobs[0].slots[0].timeLabel).toBe("All night")
        expect(jobs[1].name).toBe("Scorekeeper")
        expect(jobs[1].slots).toHaveLength(3)
        expect(jobs[1].slots.map((s) => s.timeLabel)).toEqual([
            "6:00 PM",
            "7:00 PM",
            "8:00 PM"
        ])
    })

    it("lists tryout volunteers, admins, and the leadership group as eligible", async () => {
        const { season } = await seedTryoutNight()
        const volunteer = await makeVolunteer(season.id, "Avolunteer")
        const leader = await createUser({ last_name: "Bleader" })
        await db.insert(userRoles).values({
            user_id: leader.id,
            role: "leadership_group",
            season_id: null
        })
        const captain = await createUser({ last_name: "Zcaptain" })
        await db.insert(userRoles).values({
            user_id: captain.id,
            role: "captain",
            season_id: season.id
        })
        const admin = await createUserWithRoles([{ role: "admin" }], {
            last_name: "Cadmin"
        })

        const result = await getAssignTryoutJobsView()

        const eligibleIds = result.status
            ? (result.data?.eligible.map((e) => e.id) ?? [])
            : []
        expect(new Set(eligibleIds)).toEqual(
            new Set([volunteer.id, leader.id, admin.id])
        )
        expect(eligibleIds).not.toContain(captain.id)
    })

    it("excludes a tryout volunteer scoped to a different season", async () => {
        const previous = await createSeason()
        const stale = await createUser()
        await db.insert(userRoles).values({
            user_id: stale.id,
            role: "tryout_volunteer",
            season_id: previous.id
        })
        await seedTryoutNight()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getAssignTryoutJobsView()

        const eligibleIds = result.status
            ? (result.data?.eligible.map((e) => e.id) ?? [])
            : []
        expect(eligibleIds).not.toContain(stale.id)
    })

    it("flags a volunteer rostered to play in the same week-1 session", async () => {
        const { season, slots, perSessionJob } = await seedTryoutNight()
        const volunteer = await makeVolunteer(season.id)
        await db.insert(week1Rosters).values({
            season: season.id,
            user: volunteer.id,
            session_number: 1,
            court_number: 1
        })
        await db.insert(tryoutVolunteerAssignments).values({
            job_id: perSessionJob.id,
            time_slot_id: slots[0].id,
            user_id: volunteer.id
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await getAssignTryoutJobsView()

        const scorekeeper = result.status
            ? result.data?.nights[0].jobs.find((j) => j.name === "Scorekeeper")
            : undefined
        expect(scorekeeper?.slots[0].assigned[0].conflict).toBe(true)
    })

    it("does not flag a volunteer playing in a different session", async () => {
        const { season, slots, perSessionJob } = await seedTryoutNight()
        const volunteer = await makeVolunteer(season.id)
        await db.insert(week1Rosters).values({
            season: season.id,
            user: volunteer.id,
            session_number: 1,
            court_number: 1
        })
        // Assigned to session 2 while playing session 1.
        await db.insert(tryoutVolunteerAssignments).values({
            job_id: perSessionJob.id,
            time_slot_id: slots[1].id,
            user_id: volunteer.id
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await getAssignTryoutJobsView()

        const scorekeeper = result.status
            ? result.data?.nights[0].jobs.find((j) => j.name === "Scorekeeper")
            : undefined
        expect(scorekeeper?.slots[1].assigned[0].conflict).toBe(false)
    })

    // Week 1 session_number 3 means "alternate" — not actually scheduled.
    it("does not flag a week-1 alternate", async () => {
        const { season, slots, perSessionJob } = await seedTryoutNight()
        const volunteer = await makeVolunteer(season.id)
        await db.insert(week1Rosters).values({
            season: season.id,
            user: volunteer.id,
            session_number: 3,
            court_number: 1
        })
        await db.insert(tryoutVolunteerAssignments).values({
            job_id: perSessionJob.id,
            time_slot_id: slots[2].id,
            user_id: volunteer.id
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await getAssignTryoutJobsView()

        const scorekeeper = result.status
            ? result.data?.nights[0].jobs.find((j) => j.name === "Scorekeeper")
            : undefined
        expect(scorekeeper?.slots[2].assigned[0].conflict).toBe(false)
    })

    it("flags a whole-night volunteer who plays any session that night", async () => {
        const { season, wholeNightJob } = await seedTryoutNight()
        const volunteer = await makeVolunteer(season.id)
        await db.insert(week1Rosters).values({
            season: season.id,
            user: volunteer.id,
            session_number: 2,
            court_number: 1
        })
        await db.insert(tryoutVolunteerAssignments).values({
            job_id: wholeNightJob.id,
            time_slot_id: null,
            user_id: volunteer.id
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await getAssignTryoutJobsView()

        const checkIn = result.status
            ? result.data?.nights[0].jobs.find(
                  (j) => j.name === "Check-in Table"
              )
            : undefined
        expect(checkIn?.slots[0].assigned[0].conflict).toBe(true)
    })

    it("derives week-2 sessions from the team number", async () => {
        const { season, slots, perSessionJob } = await seedTryoutNight()
        // A second tryout night, since week 2 maps to tryout event index 1.
        const secondNight = await createSeasonEvent(season.id, {
            sort_order: 1,
            event_date: "2026-09-17"
        })
        const secondSlots = []
        for (let i = 0; i < 3; i++) {
            secondSlots.push(
                await createEventTimeSlot(secondNight.id, {
                    start_time: `${18 + i}:00`,
                    sort_order: i
                })
            )
        }
        const [secondJob] = await db
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

        const division = await createDivision()
        const volunteer = await makeVolunteer(season.id)
        // Team 3 → session 2 → the second slot of night two.
        await db.insert(week2Rosters).values({
            season: season.id,
            user: volunteer.id,
            division: division.id,
            team_number: 3
        })
        await db.insert(tryoutVolunteerAssignments).values([
            {
                job_id: secondJob.id,
                time_slot_id: secondSlots[1].id,
                user_id: volunteer.id
            },
            {
                // Same volunteer, night one — should be conflict-free.
                job_id: perSessionJob.id,
                time_slot_id: slots[1].id,
                user_id: volunteer.id
            }
        ])
        await createUserWithRoles([{ role: "admin" }])

        const result = await getAssignTryoutJobsView()
        const nights = result.status ? (result.data?.nights ?? []) : []

        const nightOne = nights[0].jobs.find((j) => j.name === "Scorekeeper")
        expect(nightOne?.slots[1].assigned[0].conflict).toBe(false)
        const nightTwo = nights[1].jobs.find((j) => j.name === "Scorekeeper")
        expect(nightTwo?.slots[1].assigned[0].conflict).toBe(true)
    })

    it("fans a per-court job out over every court × session", async () => {
        const { season, event, slots } = await seedTryoutNight()
        const perCourtJob = await addPerCourtJob(season.id, event.id, [1, 4])
        const volunteer = await createUser()
        await db.insert(tryoutVolunteerAssignments).values({
            job_id: perCourtJob.id,
            time_slot_id: slots[1].id,
            court_number: 4,
            user_id: volunteer.id
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await getAssignTryoutJobsView()

        expect(result.status).toBe(true)
        const night = result.status ? result.data?.nights[0] : undefined
        expect(night?.courtNumbers).toEqual([1, 4])
        const job = night?.jobs.find((j) => j.name === "Line Judge")
        expect(job?.courtScope).toBe("per_court")
        // 2 courts × 3 sessions; court-major so the board can group by court.
        expect(job?.slots).toHaveLength(6)
        expect(job?.slots.map((s) => s.courtNumber)).toEqual([1, 1, 1, 4, 4, 4])
        expect(job?.slots.map((s) => s.timeLabel).slice(0, 3)).toEqual([
            "6:00 PM",
            "7:00 PM",
            "8:00 PM"
        ])
        // The assignment lands only in its own court's slot.
        const court4Session2 = job?.slots.find(
            (s) => s.courtNumber === 4 && s.timeSlotId === slots[1].id
        )
        expect(court4Session2?.assigned).toHaveLength(1)
        const court1Session2 = job?.slots.find(
            (s) => s.courtNumber === 1 && s.timeSlotId === slots[1].id
        )
        expect(court1Session2?.assigned).toHaveLength(0)
        // General jobs carry no court.
        const general = night?.jobs.find((j) => j.name === "Scorekeeper")
        expect(general?.slots.every((s) => s.courtNumber === null)).toBe(true)
    })

    it("gives a per-court job no slots when the night lists no courts", async () => {
        const { season, event } = await seedTryoutNight()
        await addPerCourtJob(season.id, event.id, [])
        await createUserWithRoles([{ role: "admin" }])

        const result = await getAssignTryoutJobsView()

        const night = result.status ? result.data?.nights[0] : undefined
        expect(night?.courtNumbers).toEqual([])
        expect(night?.jobs.find((j) => j.name === "Line Judge")?.slots).toEqual(
            []
        )
    })
})

describe("assignVolunteer", () => {
    it("rejects unauthenticated callers", async () => {
        const { slots, perSessionJob } = await seedTryoutNight()
        const player = await createUser()

        const result = await assignVolunteer(
            perSessionJob.id,
            slots[0].id,
            player.id
        )
        expect(result).toEqual({ status: false, message: "Not authenticated." })
    })

    it("rejects authenticated non-admins without inserting", async () => {
        const { slots, perSessionJob } = await seedTryoutNight()
        const player = await createUser()
        await createUserWithRoles([{ role: "captain" }])

        const result = await assignVolunteer(
            perSessionJob.id,
            slots[0].id,
            player.id
        )
        expect(result).toEqual({ status: false, message: "Unauthorized." })
        expect(await db.select().from(tryoutVolunteerAssignments)).toHaveLength(
            0
        )
    })

    it("rejects an invalid job id", async () => {
        await seedTryoutNight()
        const player = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await assignVolunteer(0, null, player.id)
        expect(result).toEqual({ status: false, message: "Invalid job ID." })
    })

    it("rejects a job from another season", async () => {
        const { perSessionJob, slots } = await seedTryoutNight()
        // A newer season makes the seeded one stale.
        const current = await createSeason()
        await createSeasonEvent(current.id)
        const player = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await assignVolunteer(
            perSessionJob.id,
            slots[0].id,
            player.id
        )
        expect(result).toEqual({
            status: false,
            message: "Job not found in the current season."
        })
    })

    it("refuses a session for a whole-night job", async () => {
        const { slots, wholeNightJob } = await seedTryoutNight()
        const player = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await assignVolunteer(
            wholeNightJob.id,
            slots[0].id,
            player.id
        )
        expect(result).toEqual({
            status: false,
            message: "This job is staffed for the whole night."
        })
    })

    it("refuses a per-session job with no session", async () => {
        const { perSessionJob } = await seedTryoutNight()
        const player = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await assignVolunteer(perSessionJob.id, null, player.id)
        expect(result).toEqual({
            status: false,
            message: "Pick a session for this job."
        })
    })

    it("refuses a session belonging to a different tryout night", async () => {
        const { season, perSessionJob } = await seedTryoutNight()
        const otherNight = await createSeasonEvent(season.id, {
            sort_order: 1,
            event_date: "2026-09-17"
        })
        const foreignSlot = await createEventTimeSlot(otherNight.id)
        const player = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await assignVolunteer(
            perSessionJob.id,
            foreignSlot.id,
            player.id
        )
        expect(result).toEqual({
            status: false,
            message: "That session is not part of this tryout date."
        })
    })

    it("rejects an unknown user", async () => {
        const { slots, perSessionJob } = await seedTryoutNight()
        await createUserWithRoles([{ role: "admin" }])

        const result = await assignVolunteer(
            perSessionJob.id,
            slots[0].id,
            "no-such-user"
        )
        expect(result).toEqual({ status: false, message: "User not found." })
    })

    it("assigns per-session jobs independently in each session", async () => {
        const { season, slots, perSessionJob } = await seedTryoutNight()
        const one = await makeVolunteer(season.id, "Aone")
        const two = await makeVolunteer(season.id, "Btwo")
        await createUserWithRoles([{ role: "admin" }])

        await assignVolunteer(perSessionJob.id, slots[0].id, one.id)
        await assignVolunteer(perSessionJob.id, slots[1].id, two.id)

        const rows = await db
            .select()
            .from(tryoutVolunteerAssignments)
            .where(eq(tryoutVolunteerAssignments.job_id, perSessionJob.id))
        expect(rows).toHaveLength(2)
        expect(new Set(rows.map((r) => r.time_slot_id))).toEqual(
            new Set([slots[0].id, slots[1].id])
        )
    })

    it("allows over-filling a job past its needed count", async () => {
        const { season, slots, perSessionJob } = await seedTryoutNight()
        const people = [
            await makeVolunteer(season.id, "Aone"),
            await makeVolunteer(season.id, "Btwo"),
            await makeVolunteer(season.id, "Cthree")
        ]
        await createUserWithRoles([{ role: "admin" }])

        for (const person of people) {
            const result = await assignVolunteer(
                perSessionJob.id,
                slots[0].id,
                person.id
            )
            expect(result.status).toBe(true)
        }

        const rows = await db.select().from(tryoutVolunteerAssignments)
        // needed = 2, but three is allowed by design.
        expect(rows).toHaveLength(3)
    })

    it("is idempotent — assigning the same person twice adds one row", async () => {
        const { season, wholeNightJob } = await seedTryoutNight()
        const volunteer = await makeVolunteer(season.id)
        await createUserWithRoles([{ role: "admin" }])

        await assignVolunteer(wholeNightJob.id, null, volunteer.id)
        const second = await assignVolunteer(
            wholeNightJob.id,
            null,
            volunteer.id
        )

        expect(second.status).toBe(true)
        expect(await db.select().from(tryoutVolunteerAssignments)).toHaveLength(
            1
        )
    })

    it("stores the court for a per-court job and validates it", async () => {
        const { season, event, slots } = await seedTryoutNight()
        const perCourtJob = await addPerCourtJob(season.id, event.id, [1, 2])
        const volunteer = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const noCourt = await assignVolunteer(
            perCourtJob.id,
            slots[0].id,
            volunteer.id
        )
        expect(noCourt).toEqual({
            status: false,
            message: "Pick a court for this job."
        })

        const wrongCourt = await assignVolunteer(
            perCourtJob.id,
            slots[0].id,
            volunteer.id,
            3
        )
        expect(wrongCourt).toEqual({
            status: false,
            message: "That court is not part of this tryout date."
        })

        const ok = await assignVolunteer(
            perCourtJob.id,
            slots[0].id,
            volunteer.id,
            2
        )
        expect(ok.status).toBe(true)
        const rows = await db.select().from(tryoutVolunteerAssignments)
        expect(rows).toHaveLength(1)
        expect(rows[0].court_number).toBe(2)

        // Same person can cover the same session on the other court — the
        // unique key includes the court — but not the same court twice.
        const otherCourt = await assignVolunteer(
            perCourtJob.id,
            slots[0].id,
            volunteer.id,
            1
        )
        expect(otherCourt.status).toBe(true)
        const again = await assignVolunteer(
            perCourtJob.id,
            slots[0].id,
            volunteer.id,
            2
        )
        expect(again.status).toBe(true)
        expect(await db.select().from(tryoutVolunteerAssignments)).toHaveLength(
            2
        )
    })

    it("refuses a court on a general job", async () => {
        const { slots, perSessionJob } = await seedTryoutNight()
        const volunteer = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await assignVolunteer(
            perSessionJob.id,
            slots[0].id,
            volunteer.id,
            1
        )
        expect(result).toEqual({
            status: false,
            message: "This job is not tied to a court."
        })
    })
})

describe("unassignVolunteer", () => {
    async function seedAssignment() {
        const seeded = await seedTryoutNight()
        const volunteer = await makeVolunteer(seeded.season.id)
        const [assignment] = await db
            .insert(tryoutVolunteerAssignments)
            .values({
                job_id: seeded.perSessionJob.id,
                time_slot_id: seeded.slots[0].id,
                user_id: volunteer.id
            })
            .returning()
        return { ...seeded, volunteer, assignment }
    }

    it("rejects authenticated non-admins without deleting", async () => {
        const { assignment } = await seedAssignment()
        await createUserWithRoles([{ role: "captain" }])

        const result = await unassignVolunteer(assignment.id)
        expect(result).toEqual({ status: false, message: "Unauthorized." })
        expect(await db.select().from(tryoutVolunteerAssignments)).toHaveLength(
            1
        )
    })

    it("rejects an invalid assignment id", async () => {
        await seedAssignment()
        await createUserWithRoles([{ role: "admin" }])

        const result = await unassignVolunteer(-1)
        expect(result).toEqual({
            status: false,
            message: "Invalid assignment ID."
        })
    })

    it("deletes the assignment", async () => {
        const { assignment } = await seedAssignment()
        await createUserWithRoles([{ role: "admin" }])

        const result = await unassignVolunteer(assignment.id)

        expect(result.status).toBe(true)
        expect(await db.select().from(tryoutVolunteerAssignments)).toHaveLength(
            0
        )
    })
})

describe("sendVolunteerAssignmentEmails", () => {
    it("rejects authenticated non-admins", async () => {
        await seedTryoutNight()
        await createUserWithRoles([{ role: "captain" }])

        const result = await sendVolunteerAssignmentEmails()
        expect(result).toEqual({ status: false, message: "Unauthorized." })
        expect(mockedSendBatch).not.toHaveBeenCalled()
    })

    it("fails cleanly when nobody is assigned", async () => {
        await seedTryoutNight()
        await createUserWithRoles([{ role: "admin" }])

        const result = await sendVolunteerAssignmentEmails()
        expect(result).toEqual({
            status: false,
            message: "Nobody is assigned to a job yet."
        })
    })

    it("sends one email per volunteer listing all of their jobs", async () => {
        process.env.NOTIFICATION_UNSUB_SECRET = "test-secret"
        const { season, slots, wholeNightJob, perSessionJob } =
            await seedTryoutNight()
        const volunteer = await makeVolunteer(season.id)
        await db.insert(tryoutVolunteerAssignments).values([
            {
                job_id: wholeNightJob.id,
                time_slot_id: null,
                user_id: volunteer.id
            },
            {
                job_id: perSessionJob.id,
                time_slot_id: slots[0].id,
                user_id: volunteer.id
            }
        ])
        await createUserWithRoles([{ role: "admin" }])

        const result = await sendVolunteerAssignmentEmails()

        expect(result.status).toBe(true)
        expect(result.status && result.data.sent).toBe(1)
        const messages = mockedSendBatch.mock.calls.flatMap((call) => call[0])
        expect(messages).toHaveLength(1)
        expect(messages[0].to).toBe(volunteer.email)
        expect(messages[0].stream).toBe("outbound")
        expect(messages[0].htmlBody).toContain("Check-in Table")
        expect(messages[0].htmlBody).toContain("Scorekeeper")
        expect(messages[0].htmlBody).toContain("All night")
        expect(messages[0].htmlBody).toContain("6:00 PM")
    })

    it("names the court for per-court assignments", async () => {
        process.env.NOTIFICATION_UNSUB_SECRET = "test-secret"
        const { season, event, slots } = await seedTryoutNight()
        const perCourtJob = await addPerCourtJob(season.id, event.id, [1, 2])
        const volunteer = await makeVolunteer(season.id)
        await db.insert(tryoutVolunteerAssignments).values({
            job_id: perCourtJob.id,
            time_slot_id: slots[2].id,
            court_number: 2,
            user_id: volunteer.id
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await sendVolunteerAssignmentEmails()

        expect(result.status).toBe(true)
        const messages = mockedSendBatch.mock.calls.flatMap((call) => call[0])
        expect(messages[0].htmlBody).toContain("Line Judge")
        expect(messages[0].htmlBody).toContain("Court 2")
        expect(messages[0].htmlBody).toContain("8:00 PM")
    })
})
