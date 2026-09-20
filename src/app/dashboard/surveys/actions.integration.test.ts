import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    surveyAnswers,
    surveyRecipients,
    surveyResponses,
    type surveys
} from "@/database/schema"
import type { ActionResult } from "@/lib/action-result"
import { getLeagueDateString } from "@/lib/date-utils"
import { leagueDayMidnight } from "@/lib/surveys/league-day"
import type { AnswerMap, SurveyRoleTag } from "@/lib/surveys/types"
import {
    createSurvey,
    createSurveyQuestion,
    createSurveyRecipient,
    createSurveyTemplate
} from "@/test/factories"
import { createUser, loginAs, logout } from "@/test/session"
import {
    getMySurvey,
    getMySurveys,
    saveSurveyDraft,
    submitSurveyResponse
} from "./actions"

function unwrap<T>(result: ActionResult<T>): T {
    if (!result.status) throw new Error(`Expected ok, got: ${result.message}`)
    return result.data
}

/**
 * A three-question template: an optional yes/no, a required long-text, and a
 * required yes/no gated behind the `captain` role tag — enough to exercise
 * required-ness, role gating and answer round-tripping in one survey.
 */
async function seedSurvey(
    overrides: Partial<typeof surveys.$inferInsert> = {}
) {
    const template = await createSurveyTemplate()
    const funQ = await createSurveyQuestion(template.id, {
        sort_order: 0,
        type: "yes_no",
        prompt: "Did you have fun?"
    })
    const feedbackQ = await createSurveyQuestion(template.id, {
        sort_order: 1,
        type: "text",
        prompt: "What would you change?",
        required: true,
        config: { type: "text", variant: "long" }
    })
    const captainQ = await createSurveyQuestion(template.id, {
        sort_order: 2,
        type: "yes_no",
        prompt: "Was the draft fair?",
        required: true,
        visibility: { conditions: [], roleTags: ["captain"] }
    })
    const survey = await createSurvey(template.id, {
        status: "open",
        question_ids: [funQ.id, feedbackQ.id, captainQ.id],
        ...overrides
    })
    return { template, funQ, feedbackQ, captainQ, survey }
}

/** Creates a recipient of `surveyId` and logs the fabricated session in as them. */
async function addRespondent(surveyId: number, roleTags: SurveyRoleTag[] = []) {
    const user = await createUser()
    const recipient = await createSurveyRecipient(surveyId, user.id, {
        role_tags: roleTags
    })
    loginAs(user)
    return { user, recipient }
}

async function readRecipient(recipientId: number) {
    const [row] = await db
        .select()
        .from(surveyRecipients)
        .where(eq(surveyRecipients.id, recipientId))
    return row
}

describe("survey respondent actions", () => {
    describe("access", () => {
        it("requires a session", async () => {
            const { survey } = await seedSurvey()
            logout()
            expect((await getMySurveys()).status).toBe(false)
            expect((await getMySurvey(survey.id)).status).toBe(false)
            expect((await saveSurveyDraft(survey.id, {})).status).toBe(false)
        })

        it("hides a survey from someone who is not a recipient", async () => {
            const { survey, funQ } = await seedSurvey()
            loginAs(await createUser())

            expect(await getMySurvey(survey.id)).toEqual({
                status: false,
                message: "Survey not found."
            })
            expect(
                await saveSurveyDraft(survey.id, { [funQ.id]: true })
            ).toEqual({ status: false, message: "Survey not found." })
            expect(
                await submitSurveyResponse(survey.id, { [funQ.id]: true })
            ).toEqual({ status: false, message: "Survey not found." })
        })

        it("hides a survey from a removed recipient", async () => {
            const { survey, funQ } = await seedSurvey()
            const user = await createUser()
            await createSurveyRecipient(survey.id, user.id, {
                removed_at: new Date()
            })
            loginAs(user)

            expect(await getMySurvey(survey.id)).toEqual({
                status: false,
                message: "Survey not found."
            })
            expect(
                await saveSurveyDraft(survey.id, { [funQ.id]: true })
            ).toEqual({ status: false, message: "Survey not found." })
            expect(unwrap(await getMySurveys()).open).toEqual([])
        })

        it("rejects a non-positive survey id", async () => {
            loginAs(await createUser())
            expect(await getMySurvey(0)).toEqual({
                status: false,
                message: "Invalid survey ID."
            })
        })
    })

    describe("getMySurveys", () => {
        it("splits open from past and never shows a draft survey", async () => {
            const { survey: openSurvey } = await seedSurvey()
            const { survey: closedSurvey } = await seedSurvey({
                status: "closed"
            })
            const { survey: expiredSurvey } = await seedSurvey({
                closes_at: new Date(Date.now() - 60_000)
            })
            const { survey: draftSurvey } = await seedSurvey({
                status: "draft",
                question_ids: null
            })

            const user = await createUser()
            for (const survey of [
                openSurvey,
                closedSurvey,
                expiredSurvey,
                draftSurvey
            ]) {
                await createSurveyRecipient(survey.id, user.id)
            }
            loginAs(user)

            const { open, past } = unwrap(await getMySurveys())
            expect(open.map((row) => row.id)).toEqual([openSurvey.id])
            expect(past.map((row) => row.id).sort()).toEqual(
                [closedSurvey.id, expiredSurvey.id].sort()
            )
            expect(open[0]).toMatchObject({
                title: openSurvey.title,
                status: "open",
                isAnonymous: false,
                responseStatus: "not_started",
                canEdit: true
            })
            expect(past.every((row) => row.canEdit === false)).toBe(true)
        })

        it("reports the response status of each survey", async () => {
            const { survey, funQ, feedbackQ } = await seedSurvey()
            await addRespondent(survey.id)

            expect(unwrap(await getMySurveys()).open[0].responseStatus).toBe(
                "not_started"
            )

            await saveSurveyDraft(survey.id, { [funQ.id]: true })
            expect(unwrap(await getMySurveys()).open[0].responseStatus).toBe(
                "in_progress"
            )

            await submitSurveyResponse(survey.id, {
                [funQ.id]: true,
                [feedbackQ.id]: "Nothing"
            })
            expect(unwrap(await getMySurveys()).open[0].responseStatus).toBe(
                "submitted"
            )
        })
    })

    describe("saveSurveyDraft", () => {
        it("round-trips a draft through getMySurvey", async () => {
            const { survey, funQ, feedbackQ, captainQ } = await seedSurvey()
            await addRespondent(survey.id)

            const saved = unwrap(
                await saveSurveyDraft(survey.id, {
                    [funQ.id]: true,
                    [feedbackQ.id]: "More nets"
                })
            )
            expect(saved.errors).toEqual({})

            const view = unwrap(await getMySurvey(survey.id))
            expect(view.answers).toEqual({
                [funQ.id]: true,
                [feedbackQ.id]: "More nets"
            })
            expect(view.questions.map((q) => q.id)).toEqual([
                funQ.id,
                feedbackQ.id,
                captainQ.id
            ])
            expect(view.roleTags).toEqual([])
            expect(view.canEdit).toBe(true)
            expect(view.survey.responseStatus).toBe("in_progress")

            const [response] = await db.select().from(surveyResponses)
            expect(response.status).toBe("draft")
            expect(response.submitted_on).toBeNull()
        })

        it("strips an answer to a role-gated question the respondent cannot see", async () => {
            const { survey, funQ, captainQ } = await seedSurvey()
            await addRespondent(survey.id)

            unwrap(
                await saveSurveyDraft(survey.id, {
                    [funQ.id]: true,
                    [captainQ.id]: true
                })
            )

            const rows = await db.select().from(surveyAnswers)
            expect(rows.map((row) => row.question_id)).toEqual([funQ.id])
        })

        it("drops answer values it could never store", async () => {
            const { survey, funQ } = await seedSurvey()
            await addRespondent(survey.id)

            const saved = unwrap(
                await saveSurveyDraft(survey.id, {
                    [funQ.id]: { sneaky: true },
                    "-3": "negative id",
                    notANumber: "junk"
                } as unknown as AnswerMap)
            )
            expect(saved.errors).toEqual({})
            expect(await db.select().from(surveyAnswers)).toHaveLength(0)
        })

        it("removes answers the respondent cleared", async () => {
            const { survey, funQ, feedbackQ } = await seedSurvey()
            await addRespondent(survey.id)

            unwrap(
                await saveSurveyDraft(survey.id, {
                    [funQ.id]: true,
                    [feedbackQ.id]: "More nets"
                })
            )
            unwrap(await saveSurveyDraft(survey.id, { [funQ.id]: false }))

            const rows = await db.select().from(surveyAnswers)
            expect(rows).toHaveLength(1)
            expect(rows[0].question_id).toBe(funQ.id)
            expect(rows[0].value_bool).toBe(false)
            expect(await db.select().from(surveyResponses)).toHaveLength(1)
        })

        it("reports a badly shaped answer without blocking the rest", async () => {
            const { survey, funQ, feedbackQ } = await seedSurvey()
            await addRespondent(survey.id)

            const saved = unwrap(
                await saveSurveyDraft(survey.id, {
                    [funQ.id]: "yes please",
                    [feedbackQ.id]: "More nets"
                })
            )
            expect(Object.keys(saved.errors)).toEqual([String(funQ.id)])

            const rows = await db.select().from(surveyAnswers)
            expect(rows.map((row) => row.question_id)).toEqual([feedbackQ.id])
        })

        it("refuses a save once the survey is closed", async () => {
            const { survey, funQ } = await seedSurvey({ status: "closed" })
            await addRespondent(survey.id)

            const result = await saveSurveyDraft(survey.id, {
                [funQ.id]: true
            })
            expect(result.status).toBe(false)
            expect(unwrap(await getMySurvey(survey.id)).canEdit).toBe(false)
        })

        it("refuses a save once the close date has passed", async () => {
            const { survey, funQ } = await seedSurvey({
                closes_at: new Date(Date.now() - 60_000)
            })
            await addRespondent(survey.id)

            expect(
                (await saveSurveyDraft(survey.id, { [funQ.id]: true })).status
            ).toBe(false)
        })
    })

    describe("submitSurveyResponse", () => {
        it("returns errors for a missing required answer and writes nothing", async () => {
            const { survey, funQ, feedbackQ } = await seedSurvey()
            await addRespondent(survey.id)

            const result = unwrap(
                await submitSurveyResponse(survey.id, { [funQ.id]: true })
            )
            expect(result).toEqual({
                errors: { [feedbackQ.id]: expect.any(String) }
            })
            expect(await db.select().from(surveyResponses)).toHaveLength(0)
            expect(await db.select().from(surveyAnswers)).toHaveLength(0)
        })

        it("does not let a hidden required question block a submit", async () => {
            const { survey, funQ, feedbackQ } = await seedSurvey()
            const { user, recipient } = await addRespondent(survey.id)

            expect(
                unwrap(
                    await submitSurveyResponse(survey.id, {
                        [funQ.id]: true,
                        [feedbackQ.id]: "Nothing"
                    })
                )
            ).toEqual({ submitted: true })

            const [response] = await db.select().from(surveyResponses)
            expect(response.status).toBe("submitted")
            expect(response.user_id).toBe(user.id)
            expect(response.recipient_id).toBe(recipient.id)
            expect(response.submitted_on).toBe(getLeagueDateString(0))
            expect((await readRecipient(recipient.id)).submitted_at).not.toBe(
                null
            )
        })

        it("requires a role-gated question from a respondent who carries the tag", async () => {
            const { survey, funQ, feedbackQ, captainQ } = await seedSurvey()
            await addRespondent(survey.id, ["captain"])

            const result = unwrap(
                await submitSurveyResponse(survey.id, {
                    [funQ.id]: true,
                    [feedbackQ.id]: "Nothing"
                })
            )
            expect(result).toEqual({
                errors: { [captainQ.id]: expect.any(String) }
            })
        })

        it("snapshots the recipient's segments onto the response", async () => {
            const { survey, funQ, feedbackQ } = await seedSurvey()
            const user = await createUser()
            await createSurveyRecipient(survey.id, user.id, {
                role_tags: ["rostered", "returning"],
                gender: "non_male"
            })
            loginAs(user)

            unwrap(
                await submitSurveyResponse(survey.id, {
                    [funQ.id]: true,
                    [feedbackQ.id]: "Nothing"
                })
            )

            const [response] = await db.select().from(surveyResponses)
            expect(response.role_tags).toEqual(["rostered", "returning"])
            expect(response.gender).toBe("non_male")
        })

        it("lets an identified respondent edit a submitted response", async () => {
            const { survey, funQ, feedbackQ } = await seedSurvey()
            const { user } = await addRespondent(survey.id)

            unwrap(
                await submitSurveyResponse(survey.id, {
                    [funQ.id]: true,
                    [feedbackQ.id]: "First answer"
                })
            )
            expect(
                unwrap(
                    await submitSurveyResponse(survey.id, {
                        [funQ.id]: false,
                        [feedbackQ.id]: "Second answer"
                    })
                )
            ).toEqual({ submitted: true })

            const responses = await db.select().from(surveyResponses)
            expect(responses).toHaveLength(1)
            expect(responses[0].user_id).toBe(user.id)
            expect(responses[0].status).toBe("submitted")

            const view = unwrap(await getMySurvey(survey.id))
            expect(view.answers).toEqual({
                [funQ.id]: false,
                [feedbackQ.id]: "Second answer"
            })
            expect(view.survey.responseStatus).toBe("submitted")
            expect(view.canEdit).toBe(true)
        })

        it("keeps a submitted identified response submitted across a draft save", async () => {
            const { survey, funQ, feedbackQ } = await seedSurvey()
            await addRespondent(survey.id)

            unwrap(
                await submitSurveyResponse(survey.id, {
                    [funQ.id]: true,
                    [feedbackQ.id]: "First answer"
                })
            )
            unwrap(
                await saveSurveyDraft(survey.id, {
                    [funQ.id]: true,
                    [feedbackQ.id]: "Edited answer"
                })
            )

            const [response] = await db.select().from(surveyResponses)
            expect(response.status).toBe("submitted")
            expect(response.submitted_on).toBe(getLeagueDateString(0))
            expect(unwrap(await getMySurvey(survey.id)).answers).toEqual({
                [funQ.id]: true,
                [feedbackQ.id]: "Edited answer"
            })
        })
    })

    describe("anonymous surveys", () => {
        it("strips identity and pins timestamps to league-day midnight", async () => {
            const { survey, funQ, feedbackQ } = await seedSurvey({
                is_anonymous: true
            })
            const { recipient } = await addRespondent(survey.id)

            expect(
                unwrap(
                    await submitSurveyResponse(survey.id, {
                        [funQ.id]: false,
                        [feedbackQ.id]: "Fewer emails"
                    })
                )
            ).toEqual({ submitted: true })

            const midnight = leagueDayMidnight()
            const [response] = await db.select().from(surveyResponses)
            expect(response.user_id).toBeNull()
            expect(response.recipient_id).toBeNull()
            expect(response.status).toBe("submitted")
            expect(response.submitted_on).toBe(getLeagueDateString(0))
            expect(response.created_at.getTime()).toBe(midnight.getTime())
            expect(response.updated_at.getTime()).toBe(midnight.getTime())

            const answers = await db.select().from(surveyAnswers)
            expect(answers).toHaveLength(2)
            for (const answer of answers) {
                expect(answer.updated_at.getTime()).toBe(midnight.getTime())
            }

            expect(
                (await readRecipient(recipient.id)).submitted_at?.getTime()
            ).toBe(midnight.getTime())
        })

        it("hides the submitted answers from the respondent", async () => {
            const { survey, funQ, feedbackQ } = await seedSurvey({
                is_anonymous: true
            })
            await addRespondent(survey.id)

            unwrap(
                await submitSurveyResponse(survey.id, {
                    [funQ.id]: false,
                    [feedbackQ.id]: "Fewer emails"
                })
            )

            const view = unwrap(await getMySurvey(survey.id))
            expect(view.answers).toEqual({})
            expect(view.canEdit).toBe(false)
            expect(view.survey.responseStatus).toBe("submitted")
            expect(unwrap(await getMySurveys()).open[0].canEdit).toBe(false)
        })

        it("hides them even if a row carrying the user id reappears", async () => {
            const { survey, funQ, feedbackQ } = await seedSurvey({
                is_anonymous: true
            })
            const { user, recipient } = await addRespondent(survey.id)

            unwrap(
                await submitSurveyResponse(survey.id, {
                    [funQ.id]: false,
                    [feedbackQ.id]: "Fewer emails"
                })
            )

            // Stands in for a future regression (or a hand-written script)
            // that leaves a response row pointing back at this user: the
            // anonymity guarantee must not depend on there being none.
            const [stray] = await db
                .insert(surveyResponses)
                .values({
                    survey_id: survey.id,
                    user_id: user.id,
                    recipient_id: recipient.id,
                    status: "submitted"
                })
                .returning({ id: surveyResponses.id })
            await db.insert(surveyAnswers).values({
                response_id: stray.id,
                question_id: funQ.id,
                value_bool: true
            })

            const view = unwrap(await getMySurvey(survey.id))
            expect(view.answers).toEqual({})
            expect(view.canEdit).toBe(false)
            expect(view.survey.responseStatus).toBe("submitted")
        })

        it("refuses a second save or submit", async () => {
            const { survey, funQ, feedbackQ } = await seedSurvey({
                is_anonymous: true
            })
            await addRespondent(survey.id)

            unwrap(
                await submitSurveyResponse(survey.id, {
                    [funQ.id]: false,
                    [feedbackQ.id]: "Fewer emails"
                })
            )

            const saved = await saveSurveyDraft(survey.id, {
                [funQ.id]: true
            })
            expect(saved).toEqual({
                status: false,
                message: "You already submitted this survey."
            })

            const resubmitted = await submitSurveyResponse(survey.id, {
                [funQ.id]: true,
                [feedbackQ.id]: "Changed my mind"
            })
            expect(resubmitted.status).toBe(false)
            expect(resubmitted.status === false && resubmitted.message).toBe(
                "You already submitted this survey."
            )

            expect(await db.select().from(surveyResponses)).toHaveLength(1)
        })

        it("still allows draft saves before the submit", async () => {
            const { survey, funQ } = await seedSurvey({ is_anonymous: true })
            const { user, recipient } = await addRespondent(survey.id)

            unwrap(await saveSurveyDraft(survey.id, { [funQ.id]: true }))

            const [response] = await db.select().from(surveyResponses)
            expect(response.user_id).toBe(user.id)
            expect(response.recipient_id).toBe(recipient.id)
            expect(response.status).toBe("draft")
            expect(unwrap(await getMySurvey(survey.id)).answers).toEqual({
                [funQ.id]: true
            })
        })
    })
})
