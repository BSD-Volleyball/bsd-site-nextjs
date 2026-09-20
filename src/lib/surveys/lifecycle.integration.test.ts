import { and, eq } from "drizzle-orm"
import { describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import { surveyRecipients, surveys } from "@/database/schema"
import { sendBatchEmails } from "@/lib/postmark"
import { sentBatchMessages } from "@/test/email"
import {
    addToWaitlist,
    createDivision,
    createSeason,
    createSignup,
    createSurvey,
    createSurveyQuestion,
    createSurveyTemplate,
    createTeam
} from "@/test/factories"
import { createUser } from "@/test/session"
import {
    addRecipients,
    autoCloseExpiredSurveys,
    closeSurvey,
    publishSurvey,
    removeRecipient,
    sendSurveyInvitations
} from "./lifecycle"

const mockedSendBatch = vi.mocked(sendBatchEmails)

/**
 * The standard scene: a season with one signed-up player, one captain, a
 * waitlisted player nobody invited, and a survey whose audience is the two
 * season groups plus a hand-added extra minus one signup.
 */
async function seedScene(
    audienceOverrides: Partial<{
        addUserIds: string[]
        removeUserIds: string[]
    }> = {}
) {
    const season = await createSeason()
    const division = await createDivision()

    const actor = await createUser()
    const signedUp = await createUser({ male: true })
    const excluded = await createUser()
    const captain = await createUser()
    const extra = await createUser()
    const waitlisted = await createUser()

    await createSignup({ season: season.id, player: signedUp.id })
    await createSignup({ season: season.id, player: excluded.id })
    await addToWaitlist({ season: season.id, user: waitlisted.id })
    await createTeam({
        season: season.id,
        captain: captain.id,
        division: division.id
    })

    const template = await createSurveyTemplate()
    const section = await createSurveyQuestion(template.id, {
        sort_order: 0,
        type: "section",
        prompt: "Welcome",
        config: { type: "section" }
    })
    const question = await createSurveyQuestion(template.id, {
        sort_order: 1,
        type: "yes_no",
        prompt: "Did you have fun?"
    })
    const archived = await createSurveyQuestion(template.id, {
        sort_order: 2,
        type: "yes_no",
        prompt: "Retired question",
        archived_at: new Date()
    })

    const survey = await createSurvey(template.id, {
        season_id: season.id,
        title: "Fall 2026 wrap-up",
        intro: "Thanks for playing.\n\nTell us how it went.",
        audience: {
            groups: [{ type: "season_signups" }, { type: "season_captains" }],
            addUserIds: [extra.id],
            removeUserIds: [excluded.id],
            ...audienceOverrides
        }
    })

    return {
        season,
        division,
        actor,
        signedUp,
        excluded,
        captain,
        extra,
        waitlisted,
        template,
        section,
        question,
        archived,
        survey
    }
}

describe("publishSurvey", () => {
    it("invites the resolved audience and freezes the active question list", async () => {
        const scene = await seedScene()

        const result = await publishSurvey(scene.survey.id, scene.actor.id)

        expect(result.recipients).toBe(3)
        expect(result.invitations.sent).toBe(3)

        const rows = await db
            .select()
            .from(surveyRecipients)
            .where(eq(surveyRecipients.survey_id, scene.survey.id))
        expect(new Set(rows.map((r) => r.user_id))).toEqual(
            new Set([scene.signedUp.id, scene.captain.id, scene.extra.id])
        )

        const captainRow = rows.find((r) => r.user_id === scene.captain.id)
        expect(captainRow?.role_tags).toContain("captain")
        expect(captainRow?.division_id).toBe(scene.division.id)

        const signedUpRow = rows.find((r) => r.user_id === scene.signedUp.id)
        expect(signedUpRow?.role_tags).toContain("signed_up")
        expect(signedUpRow?.gender).toBe("male")

        const [updated] = await db
            .select()
            .from(surveys)
            .where(eq(surveys.id, scene.survey.id))
        expect(updated.status).toBe("open")
        expect(updated.question_ids).toEqual([
            scene.section.id,
            scene.question.id
        ])
        expect(updated.published_at).not.toBeNull()

        const messages = sentBatchMessages()
        expect(messages).toHaveLength(3)
        expect(new Set(messages.map((m) => m.to))).toEqual(
            new Set([
                scene.signedUp.email,
                scene.captain.email,
                scene.extra.email
            ])
        )
        for (const message of messages) {
            expect(message.subject).toContain("Fall 2026 wrap-up")
            expect(message.htmlBody).toContain(
                `/dashboard/surveys/${scene.survey.id}`
            )
            expect(message.htmlBody).toContain("Tell us how it went.")
        }
    })

    it("refuses to publish a survey twice", async () => {
        const scene = await seedScene()
        await publishSurvey(scene.survey.id, scene.actor.id)

        await expect(
            publishSurvey(scene.survey.id, scene.actor.id)
        ).rejects.toThrow(/already been published/i)
    })

    it("refuses to publish an empty audience", async () => {
        const scene = await seedScene({ addUserIds: [], removeUserIds: [] })
        await db
            .update(surveys)
            .set({
                audience: { groups: [], addUserIds: [], removeUserIds: [] }
            })
            .where(eq(surveys.id, scene.survey.id))

        await expect(
            publishSurvey(scene.survey.id, scene.actor.id)
        ).rejects.toThrow(/audience is empty/i)

        const [row] = await db
            .select()
            .from(surveys)
            .where(eq(surveys.id, scene.survey.id))
        expect(row.status).toBe("draft")
        expect(mockedSendBatch).not.toHaveBeenCalled()
    })

    it("refuses to publish a broken branching graph", async () => {
        const scene = await seedScene()
        await createSurveyQuestion(scene.template.id, {
            sort_order: 3,
            type: "yes_no",
            prompt: "Dangling branch",
            visibility: {
                conditions: [
                    { questionId: 999999, operator: "in", values: ["yes"] }
                ],
                roleTags: []
            }
        })

        await expect(
            publishSurvey(scene.survey.id, scene.actor.id)
        ).rejects.toThrow(/no longer exists/i)
    })

    it("refuses to publish with no answerable question", async () => {
        const season = await createSeason()
        const actor = await createUser()
        const player = await createUser()
        await createSignup({ season: season.id, player: player.id })

        const template = await createSurveyTemplate()
        await createSurveyQuestion(template.id, {
            type: "section",
            prompt: "Only a heading",
            config: { type: "section" }
        })
        const survey = await createSurvey(template.id, {
            season_id: season.id,
            audience: {
                groups: [{ type: "season_signups" }],
                addUserIds: [],
                removeUserIds: []
            }
        })

        await expect(publishSurvey(survey.id, actor.id)).rejects.toThrow(
            /answer/i
        )
    })

    it("never invites a placeholder legacy address", async () => {
        const season = await createSeason()
        const actor = await createUser()
        const player = await createUser()
        const legacy = await createUser({
            email: `legacy-roster-jane-doe-${crypto.randomUUID().slice(0, 8)}@bumpsetdrink.com`
        })
        await createSignup({ season: season.id, player: player.id })

        const template = await createSurveyTemplate()
        await createSurveyQuestion(template.id)
        const survey = await createSurvey(template.id, {
            season_id: season.id,
            audience: {
                groups: [{ type: "season_signups" }],
                addUserIds: [legacy.id],
                removeUserIds: []
            }
        })

        const result = await publishSurvey(survey.id, actor.id)
        expect(result.recipients).toBe(1)

        const rows = await db
            .select()
            .from(surveyRecipients)
            .where(eq(surveyRecipients.survey_id, survey.id))
        expect(rows.map((r) => r.user_id)).toEqual([player.id])
    })
})

describe("addRecipients", () => {
    it("invites only the newly added people", async () => {
        const scene = await seedScene()
        await publishSurvey(scene.survey.id, scene.actor.id)
        mockedSendBatch.mockClear()

        const latecomer = await createUser()
        const result = await addRecipients(
            scene.survey.id,
            [latecomer.id, scene.captain.id],
            scene.actor.id
        )

        expect(result.added).toBe(1)
        const messages = sentBatchMessages()
        expect(messages).toHaveLength(1)
        expect(messages[0].to).toBe(latecomer.email)

        const [row] = await db
            .select()
            .from(surveyRecipients)
            .where(
                and(
                    eq(surveyRecipients.survey_id, scene.survey.id),
                    eq(surveyRecipients.user_id, latecomer.id)
                )
            )
        expect(row.added_by).toBe(scene.actor.id)
        expect(row.removed_at).toBeNull()
    })

    it("un-removes a recipient who was taken off the list", async () => {
        const scene = await seedScene()
        await publishSurvey(scene.survey.id, scene.actor.id)
        await removeRecipient(scene.survey.id, scene.captain.id)

        mockedSendBatch.mockClear()
        const result = await addRecipients(
            scene.survey.id,
            [scene.captain.id],
            scene.actor.id
        )
        expect(result.added).toBe(1)

        // The address was already claimed under this survey's dedupe key at
        // publish, so putting them back on the list does not mail them twice.
        expect(result.invitations).toEqual({ sent: 0, failed: 0, skipped: 1 })
        expect(sentBatchMessages()).toHaveLength(0)

        const [row] = await db
            .select()
            .from(surveyRecipients)
            .where(
                and(
                    eq(surveyRecipients.survey_id, scene.survey.id),
                    eq(surveyRecipients.user_id, scene.captain.id)
                )
            )
        expect(row.removed_at).toBeNull()
    })

    it("refuses to add to a survey that is not open", async () => {
        const scene = await seedScene()
        const latecomer = await createUser()

        await expect(
            addRecipients(scene.survey.id, [latecomer.id], scene.actor.id)
        ).rejects.toThrow(/open/i)
    })
})

describe("removeRecipient", () => {
    it("marks the row removed and stops further invitations", async () => {
        const scene = await seedScene()
        await publishSurvey(scene.survey.id, scene.actor.id)

        await removeRecipient(scene.survey.id, scene.captain.id)
        const [row] = await db
            .select()
            .from(surveyRecipients)
            .where(
                and(
                    eq(surveyRecipients.survey_id, scene.survey.id),
                    eq(surveyRecipients.user_id, scene.captain.id)
                )
            )
        expect(row.removed_at).not.toBeNull()
        const removedAt = row.removed_at

        // Idempotent: a second removal leaves the first timestamp alone.
        await removeRecipient(scene.survey.id, scene.captain.id)
        const [again] = await db
            .select()
            .from(surveyRecipients)
            .where(eq(surveyRecipients.id, row.id))
        expect(again.removed_at).toEqual(removedAt)

        mockedSendBatch.mockClear()
        const result = await sendSurveyInvitations(scene.survey.id)
        expect(result.sent).toBe(0)
    })
})

describe("closeSurvey", () => {
    it("closes an open survey and is a no-op afterwards", async () => {
        const scene = await seedScene()
        await publishSurvey(scene.survey.id, scene.actor.id)

        await closeSurvey(scene.survey.id, "manual")
        const [row] = await db
            .select()
            .from(surveys)
            .where(eq(surveys.id, scene.survey.id))
        expect(row.status).toBe("closed")
        expect(row.closed_at).not.toBeNull()

        await closeSurvey(scene.survey.id, "manual")
        const [again] = await db
            .select()
            .from(surveys)
            .where(eq(surveys.id, scene.survey.id))
        expect(again.closed_at).toEqual(row.closed_at)
    })
})

describe("autoCloseExpiredSurveys", () => {
    it("closes only past-due open surveys", async () => {
        const template = await createSurveyTemplate()
        const now = new Date("2026-10-01T12:00:00Z")

        const pastDue = await createSurvey(template.id, {
            title: "Past due",
            status: "open",
            closes_at: new Date("2026-09-30T12:00:00Z")
        })
        const future = await createSurvey(template.id, {
            title: "Still open",
            status: "open",
            closes_at: new Date("2026-10-02T12:00:00Z")
        })
        const noDeadline = await createSurvey(template.id, {
            title: "No deadline",
            status: "open"
        })
        const draft = await createSurvey(template.id, {
            title: "Draft",
            closes_at: new Date("2026-09-30T12:00:00Z")
        })

        expect(await autoCloseExpiredSurveys(now)).toBe(1)

        const statusOf = async (id: number) => {
            const [row] = await db
                .select()
                .from(surveys)
                .where(eq(surveys.id, id))
            return row.status
        }
        expect(await statusOf(pastDue.id)).toBe("closed")
        expect(await statusOf(future.id)).toBe("open")
        expect(await statusOf(noDeadline.id)).toBe("open")
        expect(await statusOf(draft.id)).toBe("draft")

        // Idempotent: a second sweep finds nothing left to close.
        expect(await autoCloseExpiredSurveys(now)).toBe(0)
    })
})
