import { eq } from "drizzle-orm"
import { describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import { surveys } from "@/database/schema"
import { sendBatchEmails } from "@/lib/postmark"
import { sentBatchMessages } from "@/test/email"
import {
    createSurvey,
    createSurveyRecipient,
    createSurveyTemplate
} from "@/test/factories"
import { createUser } from "@/test/session"
import { autoCloseExpiredSurveys } from "./lifecycle"
import { sendDueSurveyReminders, sendSurveyReminder } from "./reminders"

const mockedSendBatch = vi.mocked(sendBatchEmails)

async function seedOpenSurvey(
    overrides: Partial<typeof surveys.$inferInsert> = {}
) {
    const template = await createSurveyTemplate()
    return createSurvey(template.id, {
        status: "open",
        title: "Fall check-in",
        reminder_interval_days: 3,
        reminder_max_count: 2,
        reminder_count: 0,
        published_at: new Date("2026-09-01T12:00:00Z"),
        ...overrides
    })
}

async function surveyRow(id: number) {
    const [row] = await db.select().from(surveys).where(eq(surveys.id, id))
    return row
}

describe("sendSurveyReminder", () => {
    it("claims and sends when due, incrementing counters", async () => {
        const survey = await seedOpenSurvey()
        const user = await createUser()
        await createSurveyRecipient(survey.id, user.id)

        // published_at + 3 days = 2026-09-04; 4 days elapsed by now.
        const now = new Date("2026-09-05T12:00:00Z")
        const result = await sendSurveyReminder(survey.id, {
            force: false,
            now
        })

        expect(result.claimed).toBe(true)
        expect(result.sent).toBe(1)
        expect(result.failed).toBe(0)

        const messages = sentBatchMessages()
        expect(messages).toHaveLength(1)
        expect(messages[0].to).toBe(user.email)
        expect(messages[0].subject).toContain("Fall check-in")

        const row = await surveyRow(survey.id)
        expect(row.reminder_count).toBe(1)
        expect(row.last_reminder_at).not.toBeNull()
    })

    it("does not claim when the interval has not elapsed", async () => {
        const survey = await seedOpenSurvey({
            published_at: new Date("2026-09-04T12:00:00Z")
        })
        const user = await createUser()
        await createSurveyRecipient(survey.id, user.id)

        const now = new Date("2026-09-05T12:00:00Z") // only 1 of 3 days elapsed
        const result = await sendSurveyReminder(survey.id, {
            force: false,
            now
        })

        expect(result).toEqual({
            sent: 0,
            failed: 0,
            skipped: 0,
            claimed: false
        })
        expect(sentBatchMessages()).toHaveLength(0)

        const row = await surveyRow(survey.id)
        expect(row.reminder_count).toBe(0)
    })

    it("does not claim once reminder_count is at reminder_max_count", async () => {
        const survey = await seedOpenSurvey({
            reminder_count: 2,
            reminder_max_count: 2
        })
        const now = new Date("2026-09-10T12:00:00Z")

        const result = await sendSurveyReminder(survey.id, {
            force: false,
            now
        })
        expect(result.claimed).toBe(false)
    })

    it("does not claim a closed survey", async () => {
        const survey = await seedOpenSurvey({ status: "closed" })
        const now = new Date("2026-09-10T12:00:00Z")

        const result = await sendSurveyReminder(survey.id, {
            force: false,
            now
        })
        expect(result.claimed).toBe(false)
    })

    it("does not claim once past its closes_at", async () => {
        const survey = await seedOpenSurvey({
            closes_at: new Date("2026-09-04T00:00:00Z")
        })
        const now = new Date("2026-09-05T12:00:00Z")

        const result = await sendSurveyReminder(survey.id, {
            force: false,
            now
        })
        expect(result.claimed).toBe(false)
    })

    it("excludes recipients who already submitted or were removed", async () => {
        const survey = await seedOpenSurvey()
        const answered = await createUser()
        const removed = await createUser()
        const pending = await createUser()
        await createSurveyRecipient(survey.id, answered.id, {
            submitted_at: new Date()
        })
        await createSurveyRecipient(survey.id, removed.id, {
            removed_at: new Date()
        })
        await createSurveyRecipient(survey.id, pending.id)

        const now = new Date("2026-09-05T12:00:00Z")
        const result = await sendSurveyReminder(survey.id, {
            force: false,
            now
        })

        expect(result.sent).toBe(1)
        const messages = sentBatchMessages()
        expect(messages.map((m) => m.to)).toEqual([pending.email])
    })

    it("running again right away is a no-op since the interval resets from last_reminder_at", async () => {
        const survey = await seedOpenSurvey()
        const user = await createUser()
        await createSurveyRecipient(survey.id, user.id)
        const now = new Date("2026-09-05T12:00:00Z")

        const first = await sendSurveyReminder(survey.id, { force: false, now })
        expect(first.sent).toBe(1)
        mockedSendBatch.mockClear()

        const second = await sendSurveyReminder(survey.id, {
            force: false,
            now
        })
        expect(second).toEqual({
            sent: 0,
            failed: 0,
            skipped: 0,
            claimed: false
        })
        expect(sentBatchMessages()).toHaveLength(0)

        const row = await surveyRow(survey.id)
        expect(row.reminder_count).toBe(1)
    })

    it("a later due round sends again with a fresh dedupe key", async () => {
        const survey = await seedOpenSurvey()
        const user = await createUser()
        await createSurveyRecipient(survey.id, user.id)

        const first = await sendSurveyReminder(survey.id, {
            force: false,
            now: new Date("2026-09-05T12:00:00Z")
        })
        expect(first.sent).toBe(1)
        mockedSendBatch.mockClear()

        // 3+ days after the last reminder.
        const second = await sendSurveyReminder(survey.id, {
            force: false,
            now: new Date("2026-09-09T12:00:00Z")
        })
        expect(second.claimed).toBe(true)
        expect(second.sent).toBe(1)

        const row = await surveyRow(survey.id)
        expect(row.reminder_count).toBe(2)
    })

    it("force bypasses the interval and count checks but still requires the survey be open", async () => {
        const survey = await seedOpenSurvey({
            published_at: new Date("2026-09-04T12:00:00Z"),
            reminder_count: 2,
            reminder_max_count: 2
        })
        const user = await createUser()
        await createSurveyRecipient(survey.id, user.id)
        const now = new Date("2026-09-05T12:00:00Z")

        const result = await sendSurveyReminder(survey.id, { force: true, now })
        expect(result.claimed).toBe(true)
        expect(result.sent).toBe(1)

        const row = await surveyRow(survey.id)
        expect(row.reminder_count).toBe(3)
    })

    it("force still refuses a closed survey", async () => {
        const survey = await seedOpenSurvey({ status: "closed" })
        const now = new Date("2026-09-10T12:00:00Z")

        const result = await sendSurveyReminder(survey.id, { force: true, now })
        expect(result.claimed).toBe(false)
        expect(sentBatchMessages()).toHaveLength(0)
    })
})

describe("sendDueSurveyReminders", () => {
    it("reminds only due surveys and aggregates counts", async () => {
        const template = await createSurveyTemplate()
        const now = new Date("2026-09-10T12:00:00Z")

        const due = await createSurvey(template.id, {
            status: "open",
            title: "Due survey",
            reminder_interval_days: 3,
            reminder_max_count: 2,
            reminder_count: 0,
            published_at: new Date("2026-09-05T00:00:00Z")
        })
        const notYetDue = await createSurvey(template.id, {
            status: "open",
            title: "Not yet",
            reminder_interval_days: 3,
            reminder_max_count: 2,
            reminder_count: 0,
            published_at: new Date("2026-09-09T00:00:00Z")
        })
        await createSurvey(template.id, {
            status: "open",
            title: "At max",
            reminder_interval_days: 3,
            reminder_max_count: 1,
            reminder_count: 1,
            published_at: new Date("2026-09-01T00:00:00Z")
        })
        await createSurvey(template.id, {
            status: "closed",
            title: "Closed",
            reminder_interval_days: 3,
            reminder_max_count: 2,
            reminder_count: 0,
            published_at: new Date("2026-09-01T00:00:00Z")
        })
        await createSurvey(template.id, {
            status: "open",
            title: "Past close",
            reminder_interval_days: 3,
            reminder_max_count: 2,
            reminder_count: 0,
            published_at: new Date("2026-09-01T00:00:00Z"),
            closes_at: new Date("2026-09-08T00:00:00Z")
        })

        const dueUser = await createUser()
        await createSurveyRecipient(due.id, dueUser.id)
        const notYetDueUser = await createUser()
        await createSurveyRecipient(notYetDue.id, notYetDueUser.id)

        const result = await sendDueSurveyReminders(now)

        expect(result.surveys).toBe(1)
        expect(result.sent).toBe(1)
        expect(result.skipped).toBe(0)
        expect(result.failed).toBe(0)

        const messages = sentBatchMessages()
        expect(messages.map((m) => m.to)).toEqual([dueUser.email])
    })

    it("skips a survey that has just auto-closed past its deadline", async () => {
        const template = await createSurveyTemplate()
        const now = new Date("2026-09-10T12:00:00Z")
        const survey = await createSurvey(template.id, {
            status: "open",
            title: "Expiring",
            reminder_interval_days: 1,
            reminder_max_count: 5,
            reminder_count: 0,
            published_at: new Date("2026-09-01T00:00:00Z"),
            closes_at: new Date("2026-09-09T00:00:00Z")
        })
        const user = await createUser()
        await createSurveyRecipient(survey.id, user.id)

        const closed = await autoCloseExpiredSurveys(now)
        expect(closed).toBe(1)

        const result = await sendDueSurveyReminders(now)
        expect(result.surveys).toBe(0)
        expect(result.sent).toBe(0)
        expect(sentBatchMessages()).toHaveLength(0)
    })

    it("defaults now to the current time when omitted", async () => {
        const result = await sendDueSurveyReminders()
        expect(result).toEqual({
            surveys: 0,
            sent: 0,
            skipped: 0,
            failed: 0
        })
    })
})
