import { beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/database/db"
import {
    notificationOptouts,
    tryoutVolunteerAssignments,
    tryoutVolunteerJobs
} from "@/database/schema"
import { sendBatchEmails } from "@/lib/postmark"
import {
    createEventTimeSlot,
    createSeason,
    createSeasonEvent
} from "@/test/factories"
import { createUser } from "@/test/session"

import { sendVolunteerJobRemindersForDate } from "./volunteer-reminders"

const mockedSendBatch = vi.mocked(sendBatchEmails)

const TARGET_DATE = "2026-09-17"

/**
 * Two tryout nights; the volunteer works a per-session job on the second
 * one, which falls on TARGET_DATE.
 */
async function seedVolunteerNight() {
    const season = await createSeason()
    const firstNight = await createSeasonEvent(season.id, {
        sort_order: 0,
        event_date: "2026-09-10"
    })
    await createEventTimeSlot(firstNight.id)
    const targetNight = await createSeasonEvent(season.id, {
        sort_order: 1,
        event_date: TARGET_DATE
    })
    const slot = await createEventTimeSlot(targetNight.id, {
        start_time: "19:30",
        sort_order: 0
    })

    const [job] = await db
        .insert(tryoutVolunteerJobs)
        .values({
            season_id: season.id,
            event_id: targetNight.id,
            name: "Scorekeeper",
            needed: 1,
            scope: "per_session",
            notes: "Clipboard is at the front desk",
            sort_order: 0
        })
        .returning()

    const volunteer = await createUser()
    await db.insert(tryoutVolunteerAssignments).values({
        job_id: job.id,
        time_slot_id: slot.id,
        user_id: volunteer.id
    })

    return { season, targetNight, slot, job, volunteer }
}

describe("sendVolunteerJobRemindersForDate", () => {
    beforeEach(() => {
        process.env.NOTIFICATION_UNSUB_SECRET = "test-secret"
    })

    it("reminds volunteers working tomorrow's tryout night", async () => {
        const { volunteer } = await seedVolunteerNight()

        const result = await sendVolunteerJobRemindersForDate(TARGET_DATE)

        expect(result.volunteers).toBe(1)
        expect(result.sent).toBe(1)
        expect(result.failed).toBe(0)

        const messages = mockedSendBatch.mock.calls.flatMap((call) => call[0])
        expect(messages).toHaveLength(1)
        expect(messages[0].to).toBe(volunteer.email)
        expect(messages[0].stream).toBe("automated-reminders")
        expect(messages[0].htmlBody).toContain("Scorekeeper")
        expect(messages[0].htmlBody).toContain("7:30 PM")
        // Ordinal comes from the whole season, not just the matching date.
        expect(messages[0].htmlBody).toContain("Tryout 2")
        expect(messages[0].htmlBody).toContain("Clipboard is at the front desk")
    })

    it("ignores tryout nights on other dates", async () => {
        await seedVolunteerNight()

        const result = await sendVolunteerJobRemindersForDate("2026-09-10")

        expect(result.volunteers).toBe(0)
        expect(mockedSendBatch).not.toHaveBeenCalled()
    })

    it("sends one email covering several jobs on the same night", async () => {
        const { season, targetNight, volunteer } = await seedVolunteerNight()
        const [second] = await db
            .insert(tryoutVolunteerJobs)
            .values({
                season_id: season.id,
                event_id: targetNight.id,
                name: "Check-in Table",
                needed: 1,
                scope: "whole_night",
                sort_order: 1
            })
            .returning()
        await db.insert(tryoutVolunteerAssignments).values({
            job_id: second.id,
            time_slot_id: null,
            user_id: volunteer.id
        })

        const result = await sendVolunteerJobRemindersForDate(TARGET_DATE)

        expect(result.volunteers).toBe(1)
        expect(result.sent).toBe(1)
        const messages = mockedSendBatch.mock.calls.flatMap((call) => call[0])
        expect(messages).toHaveLength(1)
        expect(messages[0].htmlBody).toContain("Scorekeeper")
        expect(messages[0].htmlBody).toContain("Check-in Table")
        expect(messages[0].htmlBody).toContain("All night")
    })

    it("honors an opt-out", async () => {
        const { volunteer } = await seedVolunteerNight()
        await db.insert(notificationOptouts).values({
            user_id: volunteer.id,
            notification_type: "tryout_volunteer_reminder"
        })

        const result = await sendVolunteerJobRemindersForDate(TARGET_DATE)

        expect(result.sent).toBe(0)
        expect(result.skipped).toBe(1)
        expect(mockedSendBatch).not.toHaveBeenCalled()
    })

    // The cron is safe to re-run: dedupe keys are claimed before sending.
    it("does not double-send on a second run", async () => {
        await seedVolunteerNight()

        const first = await sendVolunteerJobRemindersForDate(TARGET_DATE)
        expect(first.sent).toBe(1)

        mockedSendBatch.mockClear()
        const second = await sendVolunteerJobRemindersForDate(TARGET_DATE)

        expect(second.sent).toBe(0)
        expect(mockedSendBatch).not.toHaveBeenCalled()
    })
})
