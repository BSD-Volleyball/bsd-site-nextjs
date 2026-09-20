import { asc, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { saveSurveyDraft } from "@/app/dashboard/surveys/actions"
import { db } from "@/database/db"
import {
    auditLog,
    surveyAnswers,
    surveyQuestions,
    surveyRecipients,
    surveyResponses,
    surveys,
    surveyTemplates
} from "@/database/schema"
import type { SurveySettingsInput } from "@/lib/surveys/surveys"
import type { TemplateQuestionInput } from "@/lib/surveys/template-rules"
import { SURVEY_LIMITS } from "@/lib/surveys/types"
import { sentBatchMessages } from "@/test/email"
import {
    createDivision,
    createSeason,
    createSignup,
    createSurvey,
    createSurveyQuestion,
    createSurveyRecipient,
    createSurveyTemplate,
    createTeam
} from "@/test/factories"
import { createUser, createUserWithRoles, loginAs } from "@/test/session"
import {
    addSurveyRecipients,
    archiveSurveyTemplate,
    archiveTemplateQuestion,
    closeSurvey as closeSurveyAction,
    createSurvey as createSurveyAction,
    createSurveyTemplate as createSurveyTemplateAction,
    deleteSurvey,
    getSurveyEditor,
    getSurveyEditorOptions,
    getSurveyFilterOptions,
    getSurveyRawResponses,
    getSurveyResults,
    getSurveyTemplateEditor,
    getSurveyTemplates,
    getSurveys,
    getTemplateTrends,
    previewSurveyAudience,
    publishSurvey as publishSurveyAction,
    removeSurveyRecipient,
    resendSurveyInvitations,
    restoreSurveyTemplate,
    restoreTemplateQuestion,
    saveTemplateQuestions,
    sendSurveyReminderNow,
    updateSurveyAudience,
    updateSurveySettings,
    updateSurveyTemplate
} from "./actions"

// --- helpers ---------------------------------------------------------------

function yesNo(
    prompt: string,
    id: number | null = null
): TemplateQuestionInput {
    return {
        id,
        type: "yes_no",
        prompt,
        helpText: null,
        required: false,
        config: { type: "yes_no" },
        visibility: { conditions: [], roleTags: [] }
    }
}

function text(prompt: string, id: number | null = null): TemplateQuestionInput {
    return {
        id,
        type: "text",
        prompt,
        helpText: null,
        required: false,
        config: { type: "text", variant: "short" },
        visibility: { conditions: [], roleTags: [] }
    }
}

/** A submitted response with one answer against `questionId`. */
async function seedAnswer(templateId: number, questionId: number) {
    const survey = await createSurvey(templateId, { status: "closed" })
    const [response] = await db
        .insert(surveyResponses)
        .values({ survey_id: survey.id, status: "submitted" })
        .returning()
    await db.insert(surveyAnswers).values({
        response_id: response.id,
        question_id: questionId,
        value_bool: true
    })
    return response
}

async function questionRows(templateId: number) {
    return db
        .select()
        .from(surveyQuestions)
        .where(eq(surveyQuestions.template_id, templateId))
        .orderBy(asc(surveyQuestions.sort_order), asc(surveyQuestions.id))
}

// --- authz triad -----------------------------------------------------------

describe("getSurveyTemplates", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await getSurveyTemplates()
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("rejects authenticated non-admins", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const result = await getSurveyTemplates()
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("returns templates with question and survey counts for an admin", async () => {
        const template = await createSurveyTemplate({ name: "Exit survey" })
        const active = await createSurveyQuestion(template.id, {
            prompt: "Active one"
        })
        await createSurveyQuestion(template.id, {
            prompt: "Archived one",
            sort_order: 1,
            archived_at: new Date()
        })
        await createSurvey(template.id, { status: "open" })
        await createSurvey(template.id, { status: "draft" })
        await createUserWithRoles([{ role: "admin" }])

        const result = await getSurveyTemplates()
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected templates")

        expect(result.data).toHaveLength(1)
        const summary = result.data[0]
        expect(summary).toMatchObject({
            id: template.id,
            name: "Exit survey",
            isArchived: false,
            // archived questions are not counted
            questionCount: 1,
            surveyCount: 2,
            openSurveyCount: 1
        })
        expect(active.id).toBeGreaterThan(0)
    })
})

describe("saveTemplateQuestions", () => {
    it("rejects unauthenticated callers", async () => {
        const template = await createSurveyTemplate()
        const result = await saveTemplateQuestions(template.id, [yesNo("Hi?")])
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("rejects authenticated non-admins", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "captain" }])
        const result = await saveTemplateQuestions(template.id, [yesNo("Hi?")])
        expect(result).toEqual({ status: false, message: "Unauthorized." })
        expect(await questionRows(template.id)).toHaveLength(0)
    })

    // --- CRUD --------------------------------------------------------------

    it("inserts questions with sort order taken from the array index", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveTemplateQuestions(template.id, [
            yesNo("First"),
            text("Second"),
            yesNo("Third")
        ])
        expect(result.status).toBe(true)

        const rows = await questionRows(template.id)
        expect(rows.map((r) => [r.prompt, r.sort_order])).toEqual([
            ["First", 0],
            ["Second", 1],
            ["Third", 2]
        ])
        expect(rows[1].type).toBe("text")
        expect(rows[1].config).toEqual({ type: "text", variant: "short" })
    })

    it("updates existing rows in place and reorders them", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])
        await saveTemplateQuestions(template.id, [
            yesNo("First"),
            yesNo("Second")
        ])
        const [first, second] = await questionRows(template.id)

        const result = await saveTemplateQuestions(template.id, [
            { ...yesNo("Second renamed", second.id), required: true },
            yesNo("First", first.id)
        ])
        expect(result.status).toBe(true)

        const rows = await questionRows(template.id)
        expect(rows.map((r) => [r.id, r.prompt, r.sort_order])).toEqual([
            [second.id, "Second renamed", 0],
            [first.id, "First", 1]
        ])
        expect(rows[0].required).toBe(true)
    })

    it("deletes an omitted question that has no answers", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])
        await saveTemplateQuestions(template.id, [yesNo("Keep"), yesNo("Drop")])
        const rows = await questionRows(template.id)
        const keep = rows[0]

        const result = await saveTemplateQuestions(template.id, [
            yesNo("Keep", keep.id)
        ])
        expect(result.status).toBe(true)

        const after = await questionRows(template.id)
        expect(after).toHaveLength(1)
        expect(after[0].id).toBe(keep.id)
    })

    it("archives rather than deletes an omitted question that has answers", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])
        await saveTemplateQuestions(template.id, [
            yesNo("Keep"),
            yesNo("Answered")
        ])
        const rows = await questionRows(template.id)
        const [keep, answered] = rows
        await seedAnswer(template.id, answered.id)

        const result = await saveTemplateQuestions(template.id, [
            yesNo("Keep", keep.id)
        ])
        expect(result.status).toBe(true)

        const after = await questionRows(template.id)
        expect(after).toHaveLength(2)
        const kept = after.find((r) => r.id === answered.id)
        expect(kept?.archived_at).toBeInstanceOf(Date)
    })

    // The delete-vs-archive decision and the answered-question set are read
    // inside the save's transaction, behind a FOR UPDATE lock on the template
    // row. survey_answers.question_id cascades on delete, so a stale read here
    // would destroy answers.
    it("reads the answered set at save time, not when the payload was built", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])
        await saveTemplateQuestions(template.id, [
            yesNo("Keep"),
            yesNo("Answered")
        ])
        const [keep, answered] = await questionRows(template.id)

        // Payload first, answer second, save last.
        const payload = [yesNo("Keep", keep.id)]
        await seedAnswer(template.id, answered.id)
        const result = await saveTemplateQuestions(template.id, payload)
        expect(result.status).toBe(true)

        const after = await questionRows(template.id)
        expect(
            after.find((r) => r.id === answered.id)?.archived_at
        ).toBeInstanceOf(Date)
        const remaining = await db
            .select()
            .from(surveyAnswers)
            .where(eq(surveyAnswers.question_id, answered.id))
        expect(remaining).toHaveLength(1)
    })

    // Discriminating test for the row lock: the answer is committed by a
    // concurrent writer while the save is already in flight. Only a save that
    // takes the lock BEFORE reading the answered set sees it — one that reads
    // first would delete the question and cascade the answer away.
    it("takes the template lock before reading, so a concurrent answer is seen", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])
        await saveTemplateQuestions(template.id, [
            yesNo("Keep"),
            yesNo("Answered")
        ])
        const [keep, answered] = await questionRows(template.id)
        const survey = await createSurvey(template.id, { status: "closed" })

        let pending: Promise<
            Awaited<ReturnType<typeof saveTemplateQuestions>>
        > | null = null

        await db.transaction(async (tx) => {
            await tx
                .select({ id: surveyTemplates.id })
                .from(surveyTemplates)
                .where(eq(surveyTemplates.id, template.id))
                .for("update")

            // The save starts while this transaction holds the lock.
            pending = saveTemplateQuestions(template.id, [
                yesNo("Keep", keep.id)
            ])
            await new Promise((resolve) => setTimeout(resolve, 200))

            // ...and an answer lands before the lock is released.
            const [response] = await tx
                .insert(surveyResponses)
                .values({ survey_id: survey.id, status: "submitted" })
                .returning()
            await tx.insert(surveyAnswers).values({
                response_id: response.id,
                question_id: answered.id,
                value_bool: true
            })
        })

        const result = await (pending as unknown as Promise<
            Awaited<ReturnType<typeof saveTemplateQuestions>>
        >)
        expect(result.status).toBe(true)

        const after = await questionRows(template.id)
        expect(
            after.find((r) => r.id === answered.id)?.archived_at
        ).toBeInstanceOf(Date)
        const survivingAnswers = await db
            .select()
            .from(surveyAnswers)
            .where(eq(surveyAnswers.question_id, answered.id))
        expect(survivingAnswers).toHaveLength(1)
    })

    it("rejects the same question id twice in one payload", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])
        await saveTemplateQuestions(template.id, [yesNo("Once")])
        const [row] = await questionRows(template.id)

        const result = await saveTemplateQuestions(template.id, [
            yesNo("Once", row.id),
            yesNo("Again", row.id)
        ])
        expect(result).toEqual({
            status: false,
            message: "Duplicate question in payload."
        })
        expect(await questionRows(template.id)).toHaveLength(1)
    })

    it("rejects an id that is not on the template", async () => {
        const template = await createSurveyTemplate()
        const other = await createSurveyTemplate({ name: "Other" })
        const foreign = await createSurveyQuestion(other.id)
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveTemplateQuestions(template.id, [
            yesNo("Mine", foreign.id)
        ])
        expect(result.status).toBe(false)
        if (result.status) throw new Error("expected failure")
        expect(result.message).toContain("changed while you were editing")
    })

    // --- validation --------------------------------------------------------

    it("rejects an empty prompt", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveTemplateQuestions(template.id, [yesNo("   ")])
        expect(result.status).toBe(false)
        expect(await questionRows(template.id)).toHaveLength(0)
    })

    it("rejects a config the type registry refuses", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveTemplateQuestions(template.id, [
            {
                id: null,
                type: "single_choice",
                prompt: "Pick one",
                helpText: null,
                required: false,
                config: {
                    type: "single_choice",
                    options: [{ key: "a", label: "A" }]
                },
                visibility: { conditions: [], roleTags: [] }
            }
        ])
        expect(result.status).toBe(false)
        if (result.status) throw new Error("expected failure")
        expect(result.message).toContain("at least two options")
        expect(await questionRows(template.id)).toHaveLength(0)
    })

    it("rejects a config whose type disagrees with the question type", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveTemplateQuestions(template.id, [
            {
                ...yesNo("Mismatched"),
                config: { type: "text", variant: "short" }
            }
        ])
        expect(result.status).toBe(false)
        expect(await questionRows(template.id)).toHaveLength(0)
    })

    it("rejects an unknown role tag", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveTemplateQuestions(template.id, [
            {
                ...yesNo("Gated"),
                visibility: {
                    conditions: [],
                    roleTags: ["not_a_tag"] as never
                }
            }
        ])
        expect(result.status).toBe(false)
        expect(await questionRows(template.id)).toHaveLength(0)
    })

    it("rejects a forward reference in the visibility graph", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])
        await saveTemplateQuestions(template.id, [
            yesNo("First"),
            yesNo("Second")
        ])
        const [first, second] = await questionRows(template.id)

        // Put the dependant ahead of the question it branches on.
        const result = await saveTemplateQuestions(template.id, [
            {
                ...yesNo("First", first.id),
                visibility: {
                    conditions: [
                        {
                            questionId: second.id,
                            operator: "in",
                            values: ["yes"]
                        }
                    ],
                    roleTags: []
                }
            },
            yesNo("Second", second.id)
        ])
        expect(result.status).toBe(false)
        if (result.status) throw new Error("expected failure")
        expect(result.message).toContain("comes before it")

        // Nothing was written: the transaction rolled back.
        const after = await questionRows(template.id)
        expect(after.map((r) => r.visibility.conditions)).toEqual([[], []])
    })

    it("accepts a backward reference in the visibility graph", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])
        await saveTemplateQuestions(template.id, [
            yesNo("First"),
            yesNo("Second")
        ])
        const [first, second] = await questionRows(template.id)

        const result = await saveTemplateQuestions(template.id, [
            yesNo("First", first.id),
            {
                ...yesNo("Second", second.id),
                visibility: {
                    conditions: [
                        {
                            questionId: first.id,
                            operator: "in",
                            values: ["yes"]
                        }
                    ],
                    roleTags: []
                }
            }
        ])
        expect(result.status).toBe(true)

        const after = await questionRows(template.id)
        expect(after[1].visibility.conditions).toEqual([
            { questionId: first.id, operator: "in", values: ["yes"] }
        ])
    })

    // --- lock rules --------------------------------------------------------

    it("refuses to change the type of a question that has answers", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])
        await saveTemplateQuestions(template.id, [yesNo("Answered")])
        const [row] = await questionRows(template.id)
        await seedAnswer(template.id, row.id)

        const result = await saveTemplateQuestions(template.id, [
            text("Answered", row.id)
        ])
        expect(result.status).toBe(false)
        if (result.status) throw new Error("expected failure")
        expect(result.message).toContain("locked")

        const after = await questionRows(template.id)
        expect(after[0].type).toBe("yes_no")
    })

    it("allows rewording a question that has answers", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])
        await saveTemplateQuestions(template.id, [yesNo("Answered")])
        const [row] = await questionRows(template.id)
        await seedAnswer(template.id, row.id)

        const result = await saveTemplateQuestions(template.id, [
            { ...yesNo("Answered, reworded", row.id), helpText: "Be honest" }
        ])
        expect(result.status).toBe(true)

        const after = await questionRows(template.id)
        expect(after[0].prompt).toBe("Answered, reworded")
        expect(after[0].help_text).toBe("Be honest")
    })
})

// --- template CRUD ---------------------------------------------------------

describe("createSurveyTemplate", () => {
    it("rejects authenticated non-admins", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const result = await createSurveyTemplateAction({
            name: "Nope",
            description: null
        })
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("creates a template and returns its id", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await createSurveyTemplateAction({
            name: "  End of season  ",
            description: "  Yearly check-in  "
        })
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected a template")

        const [row] = await db
            .select()
            .from(surveyTemplates)
            .where(eq(surveyTemplates.id, result.data.templateId))
        expect(row.name).toBe("End of season")
        expect(row.description).toBe("Yearly check-in")
        expect(row.is_archived).toBe(false)
    })

    it("rejects an empty name", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await createSurveyTemplateAction({
            name: "  ",
            description: null
        })
        expect(result.status).toBe(false)
    })
})

describe("updateSurveyTemplate", () => {
    it("renames a template and clears a blank description", async () => {
        const template = await createSurveyTemplate({
            description: "old"
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await updateSurveyTemplate(template.id, {
            name: "Renamed",
            description: "   "
        })
        expect(result.status).toBe(true)

        const [row] = await db
            .select()
            .from(surveyTemplates)
            .where(eq(surveyTemplates.id, template.id))
        expect(row.name).toBe("Renamed")
        expect(row.description).toBeNull()
    })

    it("fails for a template that does not exist", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await updateSurveyTemplate(999999, {
            name: "Ghost",
            description: null
        })
        expect(result.status).toBe(false)
    })
})

describe("archiveSurveyTemplate", () => {
    it("refuses while an open survey still uses the template", async () => {
        const template = await createSurveyTemplate()
        await createSurvey(template.id, { status: "open" })
        await createUserWithRoles([{ role: "admin" }])

        const result = await archiveSurveyTemplate(template.id)
        expect(result).toEqual({
            status: false,
            message: "Close its open surveys first."
        })
    })

    it("archives and restores a template", async () => {
        const template = await createSurveyTemplate()
        await createSurvey(template.id, { status: "closed" })
        await createUserWithRoles([{ role: "admin" }])

        expect((await archiveSurveyTemplate(template.id)).status).toBe(true)
        let [row] = await db
            .select()
            .from(surveyTemplates)
            .where(eq(surveyTemplates.id, template.id))
        expect(row.is_archived).toBe(true)

        expect((await restoreSurveyTemplate(template.id)).status).toBe(true)
        ;[row] = await db
            .select()
            .from(surveyTemplates)
            .where(eq(surveyTemplates.id, template.id))
        expect(row.is_archived).toBe(false)
    })
})

// --- per-question archive / restore ----------------------------------------

describe("archiveTemplateQuestion", () => {
    it("refuses when another active question branches on it", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])
        await saveTemplateQuestions(template.id, [
            yesNo("Parent"),
            yesNo("Child")
        ])
        const [parent, child] = await questionRows(template.id)
        await saveTemplateQuestions(template.id, [
            yesNo("Parent", parent.id),
            {
                ...yesNo("Child", child.id),
                visibility: {
                    conditions: [
                        {
                            questionId: parent.id,
                            operator: "in",
                            values: ["yes"]
                        }
                    ],
                    roleTags: []
                }
            }
        ])

        const result = await archiveTemplateQuestion(template.id, parent.id)
        expect(result.status).toBe(false)
        if (result.status) throw new Error("expected failure")
        expect(result.message).toContain("depends on this one")
    })

    it("archives a question and restores it", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])
        await saveTemplateQuestions(template.id, [yesNo("Solo")])
        const [row] = await questionRows(template.id)

        expect(
            (await archiveTemplateQuestion(template.id, row.id)).status
        ).toBe(true)
        let [after] = await questionRows(template.id)
        expect(after.archived_at).toBeInstanceOf(Date)

        expect(
            (await restoreTemplateQuestion(template.id, row.id)).status
        ).toBe(true)
        ;[after] = await questionRows(template.id)
        expect(after.archived_at).toBeNull()
    })

    it("audits question archive and restore under their own action names", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])
        await saveTemplateQuestions(template.id, [yesNo("Solo")])
        const [row] = await questionRows(template.id)

        await archiveTemplateQuestion(template.id, row.id)
        await restoreTemplateQuestion(template.id, row.id)

        const entries = await db
            .select({
                action: auditLog.action,
                entityType: auditLog.entity_type,
                entityId: auditLog.entity_id
            })
            .from(auditLog)
            .orderBy(asc(auditLog.id))
        expect(
            entries.filter((e) => e.action.startsWith("survey_question_"))
        ).toEqual([
            {
                action: "survey_question_archive",
                entityType: "survey_question",
                entityId: String(row.id)
            },
            {
                action: "survey_question_restore",
                entityType: "survey_question",
                entityId: String(row.id)
            }
        ])
    })

    it("refuses a restore that would push the template past the question limit", async () => {
        const template = await createSurveyTemplate()
        await db.insert(surveyQuestions).values(
            Array.from({ length: SURVEY_LIMITS.maxQuestions }, (_, i) => ({
                template_id: template.id,
                sort_order: i,
                type: "yes_no" as const,
                prompt: `Question ${i}`,
                config: { type: "yes_no" as const },
                visibility: { conditions: [], roleTags: [] }
            }))
        )
        const [archived] = await db
            .insert(surveyQuestions)
            .values({
                template_id: template.id,
                sort_order: SURVEY_LIMITS.maxQuestions,
                type: "yes_no",
                prompt: "One too many",
                config: { type: "yes_no" },
                visibility: { conditions: [], roleTags: [] },
                archived_at: new Date()
            })
            .returning()
        await createUserWithRoles([{ role: "admin" }])

        const result = await restoreTemplateQuestion(template.id, archived.id)
        expect(result.status).toBe(false)
        if (result.status) throw new Error("expected failure")
        expect(result.message).toContain(
            `at most ${SURVEY_LIMITS.maxQuestions} questions`
        )

        const [after] = await db
            .select()
            .from(surveyQuestions)
            .where(eq(surveyQuestions.id, archived.id))
        expect(after.archived_at).toBeInstanceOf(Date)
    })
})

// --- editor payload --------------------------------------------------------

describe("getSurveyTemplateEditor", () => {
    it("rejects authenticated non-admins", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "captain" }])
        const result = await getSurveyTemplateEditor(template.id)
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("returns null for a template that does not exist", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await getSurveyTemplateEditor(999999)
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected a result")
        expect(result.data).toBeNull()
    })

    it("returns active and archived questions with their answer flags", async () => {
        const template = await createSurveyTemplate({ name: "Editor" })
        await createUserWithRoles([{ role: "admin" }])
        await saveTemplateQuestions(template.id, [
            yesNo("Answered"),
            yesNo("Untouched")
        ])
        const [answered] = await questionRows(template.id)
        await seedAnswer(template.id, answered.id)
        await createSurveyQuestion(template.id, {
            prompt: "Old one",
            sort_order: 5,
            archived_at: new Date()
        })
        await createSurvey(template.id, { title: "Fall run", status: "open" })

        const result = await getSurveyTemplateEditor(template.id)
        expect(result.status).toBe(true)
        if (!result.status || !result.data) throw new Error("expected editor")

        expect(result.data.template).toMatchObject({
            id: template.id,
            name: "Editor",
            isArchived: false
        })
        expect(
            result.data.questions.map((q) => [
                q.prompt,
                q.hasAnswers,
                q.archivedAt !== null
            ])
        ).toEqual([
            ["Answered", true, false],
            ["Untouched", false, false],
            ["Old one", false, true]
        ])
        expect(result.data.surveys.map((s) => [s.title, s.status])).toEqual([
            ["Fall run", "open"],
            ["Fall survey", "closed"]
        ])
    })
})

// --- survey instances ------------------------------------------------------

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function isoFromNow(ms: number): string {
    return new Date(Date.now() + ms).toISOString()
}

/** A season with one signed-up player, plus a template with one question. */
async function seedInstanceScene() {
    const season = await createSeason()
    const player = await createUser()
    await createSignup({ season: season.id, player: player.id })
    const template = await createSurveyTemplate({ name: "Season wrap" })
    const question = await createSurveyQuestion(template.id, {
        prompt: "Did you have fun?"
    })
    return { season, player, template, question }
}

function baseSettings(
    overrides: Partial<SurveySettingsInput> = {}
): SurveySettingsInput {
    return {
        title: "Fall wrap-up",
        intro: null,
        seasonId: null,
        isAnonymous: false,
        opensAt: null,
        closesAt: null,
        reminderIntervalDays: 0,
        reminderMaxCount: 0,
        ...overrides
    }
}

async function surveyRow(surveyId: number) {
    const [row] = await db
        .select()
        .from(surveys)
        .where(eq(surveys.id, surveyId))
    return row
}

/** Creates a draft targeting the season's signups and publishes it. */
async function publishedScene() {
    const scene = await seedInstanceScene()
    const admin = await createUserWithRoles([{ role: "admin" }])
    const created = await createSurveyAction({
        templateId: scene.template.id,
        seasonId: scene.season.id,
        title: "Fall wrap-up"
    })
    if (!created.status) throw new Error(created.message)
    const surveyId = created.data.surveyId

    const audience = await updateSurveyAudience(surveyId, {
        groups: [{ type: "season_signups" }],
        addUserIds: [],
        removeUserIds: []
    })
    if (!audience.status) throw new Error(audience.message)

    const published = await publishSurveyAction(surveyId)
    if (!published.status) throw new Error(published.message)

    return { ...scene, admin, surveyId, published: published.data }
}

describe("getSurveys", () => {
    it("rejects unauthenticated callers", async () => {
        expect(await getSurveys()).toEqual({
            status: false,
            message: "Unauthorized."
        })
    })

    it("rejects authenticated non-admins", async () => {
        await createUserWithRoles([{ role: "captain" }])
        expect(await getSurveys()).toEqual({
            status: false,
            message: "Unauthorized."
        })
    })

    it("lists surveys with their template, season and response counts", async () => {
        const scene = await publishedScene()

        const result = await getSurveys()
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected surveys")

        expect(result.data).toHaveLength(1)
        expect(result.data[0]).toMatchObject({
            id: scene.surveyId,
            title: "Fall wrap-up",
            templateId: scene.template.id,
            templateName: "Season wrap",
            seasonLabel: "Fall 2026",
            status: "open",
            isAnonymous: false,
            // The season-signups group also sweeps in admins/directors
            // (global, no season restriction) alongside the signed-up
            // player, so the invite list is player + admin.
            recipients: 2,
            submitted: 0,
            reminderCount: 0
        })
        expect(result.data[0].publishedAt).toBeInstanceOf(Date)
    })
})

describe("createSurvey", () => {
    it("rejects authenticated non-admins", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "captain" }])

        const result = await createSurveyAction({
            templateId: template.id,
            seasonId: null,
            title: "Nope"
        })
        expect(result).toEqual({ status: false, message: "Unauthorized." })
        expect(await db.select().from(surveys)).toHaveLength(0)
    })

    it("creates a draft with a trimmed title and audits it", async () => {
        const season = await createSeason()
        const template = await createSurveyTemplate()
        const admin = await createUserWithRoles([{ role: "admin" }])

        const result = await createSurveyAction({
            templateId: template.id,
            seasonId: season.id,
            title: "  Fall wrap-up  "
        })
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected a survey")

        const row = await surveyRow(result.data.surveyId)
        expect(row).toMatchObject({
            template_id: template.id,
            season_id: season.id,
            title: "Fall wrap-up",
            status: "draft",
            is_anonymous: false,
            created_by: admin.id
        })
        expect(row.question_ids).toBeNull()

        const entries = await db
            .select({ action: auditLog.action })
            .from(auditLog)
        expect(entries.map((e) => e.action)).toContain("survey_create")
    })

    it("rejects an empty title and an unknown template", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])

        expect(
            (
                await createSurveyAction({
                    templateId: template.id,
                    seasonId: null,
                    title: "   "
                })
            ).status
        ).toBe(false)
        expect(
            (
                await createSurveyAction({
                    templateId: 999999,
                    seasonId: null,
                    title: "Ghost"
                })
            ).status
        ).toBe(false)
        expect(await db.select().from(surveys)).toHaveLength(0)
    })
})

describe("updateSurveySettings", () => {
    it("stores a trimmed title, intro, window and reminder cadence", async () => {
        const scene = await seedInstanceScene()
        await createUserWithRoles([{ role: "admin" }])
        const survey = await createSurvey(scene.template.id)
        const closesAt = isoFromNow(WEEK_MS)

        const result = await updateSurveySettings(
            survey.id,
            baseSettings({
                title: "  Fall wrap-up  ",
                intro: "  Tell us how it went.  ",
                seasonId: scene.season.id,
                isAnonymous: true,
                opensAt: isoFromNow(1000),
                closesAt,
                reminderIntervalDays: 3,
                reminderMaxCount: 2
            })
        )
        expect(result.status).toBe(true)

        const row = await surveyRow(survey.id)
        expect(row).toMatchObject({
            title: "Fall wrap-up",
            intro: "Tell us how it went.",
            season_id: scene.season.id,
            is_anonymous: true,
            reminder_interval_days: 3,
            reminder_max_count: 2
        })
        expect(row.closes_at?.toISOString()).toBe(closesAt)
    })

    it("rejects an out-of-range reminder cadence and a bad window", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])
        const survey = await createSurvey(template.id)

        expect(
            (
                await updateSurveySettings(
                    survey.id,
                    baseSettings({ reminderIntervalDays: 91 })
                )
            ).status
        ).toBe(false)
        expect(
            (
                await updateSurveySettings(
                    survey.id,
                    baseSettings({ reminderMaxCount: 21 })
                )
            ).status
        ).toBe(false)
        expect(
            (
                await updateSurveySettings(
                    survey.id,
                    baseSettings({
                        opensAt: isoFromNow(WEEK_MS),
                        closesAt: isoFromNow(1000)
                    })
                )
            ).status
        ).toBe(false)
        expect(
            (
                await updateSurveySettings(
                    survey.id,
                    baseSettings({ closesAt: "not a date" })
                )
            ).status
        ).toBe(false)
        expect(
            (
                await updateSurveySettings(
                    survey.id,
                    baseSettings({
                        title: "x".repeat(SURVEY_LIMITS.maxTitleLength + 1)
                    })
                )
            ).status
        ).toBe(false)

        expect((await surveyRow(survey.id)).title).toBe("Fall survey")
    })

    it("refuses to change anonymity or season once published", async () => {
        const scene = await publishedScene()

        const anonymity = await updateSurveySettings(
            scene.surveyId,
            baseSettings({ seasonId: scene.season.id, isAnonymous: true })
        )
        expect(anonymity.status).toBe(false)
        if (anonymity.status) throw new Error("expected failure")
        expect(anonymity.message).toContain("after publishing")

        const season = await updateSurveySettings(
            scene.surveyId,
            baseSettings({ seasonId: null })
        )
        expect(season.status).toBe(false)

        const row = await surveyRow(scene.surveyId)
        expect(row.is_anonymous).toBe(false)
        expect(row.season_id).toBe(scene.season.id)
    })

    it("refuses a close date in the past while the survey is open", async () => {
        const scene = await publishedScene()

        const result = await updateSurveySettings(
            scene.surveyId,
            baseSettings({
                seasonId: scene.season.id,
                closesAt: isoFromNow(-1000)
            })
        )
        expect(result.status).toBe(false)
        if (result.status) throw new Error("expected failure")
        expect(result.message).toContain("future")
    })

    it("retitles an open survey", async () => {
        const scene = await publishedScene()

        const result = await updateSurveySettings(
            scene.surveyId,
            baseSettings({
                title: "Fall wrap-up (reopened)",
                seasonId: scene.season.id,
                closesAt: isoFromNow(WEEK_MS)
            })
        )
        expect(result.status).toBe(true)
        expect((await surveyRow(scene.surveyId)).title).toBe(
            "Fall wrap-up (reopened)"
        )
    })
})

describe("updateSurveyAudience", () => {
    it("stores a sanitized definition while the survey is a draft", async () => {
        const scene = await seedInstanceScene()
        await createUserWithRoles([{ role: "admin" }])
        const survey = await createSurvey(scene.template.id, {
            season_id: scene.season.id
        })

        const result = await updateSurveyAudience(survey.id, {
            groups: [
                { type: "season_signups", divisionId: 0 },
                { type: "season_captains" }
            ],
            addUserIds: [scene.player.id, scene.player.id],
            removeUserIds: []
        })
        expect(result.status).toBe(true)

        const row = await surveyRow(survey.id)
        expect(row.audience).toEqual({
            groups: [{ type: "season_signups" }, { type: "season_captains" }],
            addUserIds: [scene.player.id],
            removeUserIds: []
        })
    })

    it("rejects a group that is missing the id it needs", async () => {
        const scene = await seedInstanceScene()
        await createUserWithRoles([{ role: "admin" }])
        const survey = await createSurvey(scene.template.id, {
            season_id: scene.season.id
        })

        const result = await updateSurveyAudience(survey.id, {
            groups: [{ type: "season_division" }],
            addUserIds: [],
            removeUserIds: []
        })
        expect(result.status).toBe(false)
        if (result.status) throw new Error("expected failure")
        expect(result.message).toContain("requires a division")
    })

    it("refuses once the survey is published", async () => {
        const scene = await publishedScene()

        const result = await updateSurveyAudience(scene.surveyId, {
            groups: [],
            addUserIds: [],
            removeUserIds: []
        })
        expect(result.status).toBe(false)
        if (result.status) throw new Error("expected failure")
        expect(result.message).toContain("after publishing")
    })
})

describe("previewSurveyAudience", () => {
    it("counts the audience and names its members", async () => {
        const scene = await seedInstanceScene()
        // The season-signups group also sweeps in admins/directors (global,
        // no season restriction), so the actor ends up on the invite list
        // beside the signed-up player.
        const admin = await createUserWithRoles([{ role: "admin" }])
        const survey = await createSurvey(scene.template.id, {
            season_id: scene.season.id,
            audience: {
                groups: [{ type: "season_signups" }],
                addUserIds: [],
                removeUserIds: []
            }
        })

        const result = await previewSurveyAudience(survey.id)
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected a preview")

        const expectedNames = [scene.player, admin]
            .sort(
                (a, b) =>
                    a.last_name.localeCompare(b.last_name) ||
                    a.first_name.localeCompare(b.first_name)
            )
            .map((user) => `${user.first_name} ${user.last_name}`)

        expect(result.data.total).toBe(2)
        expect(result.data.names).toEqual(expectedNames)
        expect(result.data.groupCounts).toEqual([
            { label: "Season signups (Fall 2026)", count: 2 }
        ])
    })
})

describe("publishSurvey", () => {
    it("rejects unauthenticated callers", async () => {
        const template = await createSurveyTemplate()
        const survey = await createSurvey(template.id)

        expect(await publishSurveyAction(survey.id)).toEqual({
            status: false,
            message: "Unauthorized."
        })
        expect((await surveyRow(survey.id)).status).toBe("draft")
    })

    it("rejects authenticated non-admins", async () => {
        const template = await createSurveyTemplate()
        const survey = await createSurvey(template.id)
        await createUserWithRoles([{ role: "captain" }])

        expect(await publishSurveyAction(survey.id)).toEqual({
            status: false,
            message: "Unauthorized."
        })
        expect((await surveyRow(survey.id)).status).toBe("draft")
    })

    it("opens the survey, writes the invite list and audits the count", async () => {
        const scene = await publishedScene()

        // The season-signups group sweeps in the acting admin alongside the
        // signed-up player, so the invite list is both of them.
        expect(scene.published.recipients).toBe(2)
        expect(scene.published.invitations.sent).toBe(2)

        const row = await surveyRow(scene.surveyId)
        expect(row.status).toBe("open")
        expect(row.published_at).toBeInstanceOf(Date)
        expect(row.question_ids).toEqual([scene.question.id])

        const recipients = await db
            .select()
            .from(surveyRecipients)
            .where(eq(surveyRecipients.survey_id, scene.surveyId))
        expect(recipients.map((r) => r.user_id).sort()).toEqual(
            [scene.player.id, scene.admin.id].sort()
        )

        const [entry] = await db
            .select({
                action: auditLog.action,
                summary: auditLog.summary,
                entityId: auditLog.entity_id
            })
            .from(auditLog)
            .where(eq(auditLog.action, "survey_publish"))
        expect(entry.entityId).toBe(String(scene.surveyId))
        expect(entry.summary).toContain("2")
    })

    it("fails on an empty audience and leaves the survey a draft", async () => {
        const scene = await seedInstanceScene()
        await createUserWithRoles([{ role: "admin" }])
        const survey = await createSurvey(scene.template.id, {
            season_id: scene.season.id
        })

        const result = await publishSurveyAction(survey.id)
        expect(result).toEqual({
            status: false,
            message: "The audience is empty."
        })
        expect((await surveyRow(survey.id)).status).toBe("draft")
    })

    it("refuses to publish twice", async () => {
        const scene = await publishedScene()

        const result = await publishSurveyAction(scene.surveyId)
        expect(result.status).toBe(false)
        if (result.status) throw new Error("expected failure")
        expect(result.message).toContain("already been published")
    })
})

describe("deleteSurvey", () => {
    it("deletes a draft", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])
        const survey = await createSurvey(template.id)

        expect((await deleteSurvey(survey.id)).status).toBe(true)
        expect(await db.select().from(surveys)).toHaveLength(0)
    })

    it("refuses once the survey is published", async () => {
        const scene = await publishedScene()

        const result = await deleteSurvey(scene.surveyId)
        expect(result.status).toBe(false)
        if (result.status) throw new Error("expected failure")
        expect(result.message).toContain("draft")
        expect(await surveyRow(scene.surveyId)).toBeDefined()
    })
})

describe("closeSurvey", () => {
    it("closes an open survey, and its recipients can no longer answer", async () => {
        const scene = await publishedScene()

        const result = await closeSurveyAction(scene.surveyId)
        expect(result.status).toBe(true)

        const row = await surveyRow(scene.surveyId)
        expect(row.status).toBe("closed")
        expect(row.closed_at).toBeInstanceOf(Date)

        loginAs(scene.player)
        const save = await saveSurveyDraft(scene.surveyId, {
            [scene.question.id]: true
        })
        expect(save.status).toBe(false)
        expect(await db.select().from(surveyResponses)).toHaveLength(0)
    })

    it("refuses a survey that is not open", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])
        const survey = await createSurvey(template.id)

        expect((await closeSurveyAction(survey.id)).status).toBe(false)
    })
})

describe("survey recipients", () => {
    it("adds, invites and removes a recipient on an open survey", async () => {
        const scene = await publishedScene()
        const latecomer = await createUser()
        loginAs(scene.admin)

        const added = await addSurveyRecipients(scene.surveyId, [
            latecomer.id,
            latecomer.id
        ])
        expect(added.status).toBe(true)
        if (!added.status) throw new Error("expected an add")
        expect(added.data.added).toBe(1)
        expect(added.data.invitations.sent).toBe(1)

        const removed = await removeSurveyRecipient(
            scene.surveyId,
            latecomer.id
        )
        expect(removed.status).toBe(true)

        const rows = await db
            .select()
            .from(surveyRecipients)
            .where(eq(surveyRecipients.survey_id, scene.surveyId))
        const row = rows.find((r) => r.user_id === latecomer.id)
        expect(row?.removed_at).toBeInstanceOf(Date)

        const actions = (
            await db.select({ action: auditLog.action }).from(auditLog)
        ).map((e) => e.action)
        expect(actions).toContain("survey_recipient_add")
        expect(actions).toContain("survey_recipient_remove")
    })

    it("rejects authenticated non-admins", async () => {
        const scene = await publishedScene()
        const latecomer = await createUser()
        await createUserWithRoles([{ role: "captain" }])

        expect(
            await addSurveyRecipients(scene.surveyId, [latecomer.id])
        ).toEqual({ status: false, message: "Unauthorized." })
        expect(
            await removeSurveyRecipient(scene.surveyId, scene.player.id)
        ).toEqual({ status: false, message: "Unauthorized." })
    })

    it("refuses to remove someone who is not on the list", async () => {
        const scene = await publishedScene()
        const stranger = await createUser()
        loginAs(scene.admin)

        const result = await removeSurveyRecipient(scene.surveyId, stranger.id)
        expect(result.status).toBe(false)
    })
})

describe("resendSurveyInvitations", () => {
    it("skips anyone already invited and audits the resend", async () => {
        const scene = await publishedScene()

        const result = await resendSurveyInvitations(scene.surveyId)
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected a dispatch")
        // The publish invite already claimed the dedupe key.
        expect(result.data.sent).toBe(0)
        expect(result.data.skipped).toBe(2)

        const actions = (
            await db.select({ action: auditLog.action }).from(auditLog)
        ).map((e) => e.action)
        expect(actions).toContain("survey_invitations_resend")
    })

    it("refuses a draft", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])
        const survey = await createSurvey(template.id)

        expect((await resendSurveyInvitations(survey.id)).status).toBe(false)
    })
})

describe("sendSurveyReminderNow", () => {
    it("rejects unauthenticated callers", async () => {
        const template = await createSurveyTemplate()
        const survey = await createSurvey(template.id, { status: "open" })

        expect(await sendSurveyReminderNow(survey.id)).toEqual({
            status: false,
            message: "Unauthorized."
        })
    })

    it("rejects authenticated non-admins", async () => {
        const template = await createSurveyTemplate()
        const survey = await createSurvey(template.id, { status: "open" })
        await createUserWithRoles([{ role: "captain" }])

        expect(await sendSurveyReminderNow(survey.id)).toEqual({
            status: false,
            message: "Unauthorized."
        })
    })

    it("sends to the one pending recipient, increments reminder_count, and audits", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const template = await createSurveyTemplate()
        const survey = await createSurvey(template.id, { status: "open" })
        const submitted = await createUser()
        const pending = await createUser()
        await createSurveyRecipient(survey.id, submitted.id, {
            submitted_at: new Date()
        })
        await createSurveyRecipient(survey.id, pending.id)

        const result = await sendSurveyReminderNow(survey.id)
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected a dispatch")
        expect(result.data.sent).toBe(1)

        const messages = sentBatchMessages()
        expect(messages).toHaveLength(1)
        expect(messages[0].to).toBe(pending.email)

        const row = await surveyRow(survey.id)
        expect(row.reminder_count).toBe(1)

        const actions = (
            await db.select({ action: auditLog.action }).from(auditLog)
        ).map((e) => e.action)
        expect(actions).toContain("survey_reminder")
    })

    it("refuses a draft", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "admin" }])
        const survey = await createSurvey(template.id)

        const result = await sendSurveyReminderNow(survey.id)
        expect(result).toEqual({
            status: false,
            message: "Survey is not open."
        })
    })
})

describe("getSurveyEditor", () => {
    it("rejects authenticated non-admins", async () => {
        const template = await createSurveyTemplate()
        const survey = await createSurvey(template.id)
        await createUserWithRoles([{ role: "captain" }])

        expect(await getSurveyEditor(survey.id)).toEqual({
            status: false,
            message: "Unauthorized."
        })
    })

    it("returns null for a survey that does not exist", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await getSurveyEditor(999999)
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected a result")
        expect(result.data).toBeNull()
    })

    it("returns the frozen questions and the invite list once published", async () => {
        const scene = await publishedScene()

        const result = await getSurveyEditor(scene.surveyId)
        expect(result.status).toBe(true)
        if (!result.status || !result.data) throw new Error("expected editor")

        expect(result.data.survey.id).toBe(scene.surveyId)
        expect(result.data.templateName).toBe("Season wrap")
        expect(result.data.questions.map((q) => q.id)).toEqual([
            scene.question.id
        ])
        // The season-signups group sweeps in the acting admin alongside the
        // signed-up player, so both end up on the invite list.
        expect(result.data.recipients).toHaveLength(2)
        const playerRecipient = result.data.recipients.find(
            (recipient) => recipient.userId === scene.player.id
        )
        expect(playerRecipient).toMatchObject({
            userId: scene.player.id,
            email: scene.player.email,
            submittedAt: null,
            removedAt: null
        })
        expect(playerRecipient?.name).toContain(scene.player.last_name)
    })
})

describe("getSurveyEditorOptions", () => {
    it("rejects authenticated non-admins", async () => {
        await createUserWithRoles([{ role: "captain" }])
        expect(await getSurveyEditorOptions()).toEqual({
            status: false,
            message: "Unauthorized."
        })
    })

    it("returns the seasons, this season's divisions and teams, and users", async () => {
        const season = await createSeason()
        const division = await createDivision()
        const captain = await createUser()
        const team = await createTeam({
            season: season.id,
            captain: captain.id,
            division: division.id,
            name: "Spikers"
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await getSurveyEditorOptions()
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected options")

        expect(result.data.seasons[0]).toEqual({
            id: season.id,
            label: "Fall 2026"
        })
        expect(result.data.divisions).toEqual([
            { id: division.id, name: division.name }
        ])
        expect(result.data.teams).toEqual([
            { id: team.id, name: "Spikers", divisionId: division.id }
        ])
        expect(result.data.users.length).toBeGreaterThan(0)
    })
})

// --- results and trends ------------------------------------------------

/** A submitted yes/no response, seeded straight into the tables. */
async function seedYesNoResponse(
    surveyId: number,
    questionId: number,
    value: boolean,
    overrides: Partial<typeof surveyResponses.$inferInsert> = {}
) {
    const [response] = await db
        .insert(surveyResponses)
        .values({
            survey_id: surveyId,
            status: "submitted",
            role_tags: [],
            submitted_on: "2026-09-01",
            ...overrides
        })
        .returning()
    await db.insert(surveyAnswers).values({
        response_id: response.id,
        question_id: questionId,
        value_bool: value
    })
    return response
}

async function resultsScene() {
    const template = await createSurveyTemplate()
    const question = await createSurveyQuestion(template.id)
    const survey = await createSurvey(template.id, {
        status: "open",
        question_ids: [question.id]
    })
    return { template, question, survey }
}

describe("getSurveyResults", () => {
    it("rejects unauthenticated callers", async () => {
        const { survey } = await resultsScene()
        const result = await getSurveyResults(survey.id, {})
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("rejects authenticated non-admins", async () => {
        const { survey } = await resultsScene()
        await createUserWithRoles([{ role: "captain" }])
        const result = await getSurveyResults(survey.id, {})
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("aggregates seeded responses across segments and filters by role tag", async () => {
        const { question, survey } = await resultsScene()
        await seedYesNoResponse(survey.id, question.id, true, {
            role_tags: ["captain"]
        })
        await seedYesNoResponse(survey.id, question.id, true, {
            role_tags: ["captain"]
        })
        await seedYesNoResponse(survey.id, question.id, false, {
            role_tags: ["coach"]
        })
        await createUserWithRoles([{ role: "admin" }])

        const all = await getSurveyResults(survey.id, {})
        expect(all.status).toBe(true)
        if (!all.status) throw new Error("expected results")
        expect(all.data.report.submitted).toBe(3)
        expect(all.data.report.filteredCount).toBe(3)
        expect(all.data.survey).toMatchObject({
            id: survey.id,
            title: survey.title,
            status: "open",
            isAnonymous: false,
            templateId: survey.template_id
        })
        const allAggregate = all.data.report.byQuestion[0].aggregate
        if (allAggregate.type !== "yes_no") throw new Error("expected yes_no")
        expect(allAggregate.answered).toBe(3)

        const filtered = await getSurveyResults(survey.id, {
            roleTag: "captain"
        })
        if (!filtered.status) throw new Error("expected results")
        expect(filtered.data.report.filteredCount).toBe(2)
        const filteredAggregate = filtered.data.report.byQuestion[0].aggregate
        if (filteredAggregate.type !== "yes_no") {
            throw new Error("expected yes_no")
        }
        expect(filteredAggregate.answered).toBe(2)
        expect(filteredAggregate.yes).toBe(2)
    })

    it("suppresses a filtered segment under the minimum cell on an anonymous survey", async () => {
        const template = await createSurveyTemplate()
        const question = await createSurveyQuestion(template.id)
        const survey = await createSurvey(template.id, {
            status: "open",
            is_anonymous: true,
            question_ids: [question.id]
        })
        for (let i = 0; i < 3; i++) {
            await seedYesNoResponse(survey.id, question.id, true, {
                role_tags: ["captain"]
            })
        }
        await createUserWithRoles([{ role: "admin" }])

        const result = await getSurveyResults(survey.id, {
            roleTag: "captain"
        })
        if (!result.status) throw new Error("expected results")
        expect(result.data.report.suppressed).toBe(true)
        expect(result.data.report.byQuestion[0].aggregate).toMatchObject({
            answered: 0
        })
    })
})

describe("getSurveyFilterOptions", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await getSurveyFilterOptions()
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("rejects authenticated non-admins", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const result = await getSurveyFilterOptions()
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("returns divisions for an admin", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await getSurveyFilterOptions()
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected filter options")
        expect(Array.isArray(result.data.divisions)).toBe(true)
    })
})

describe("getSurveyRawResponses", () => {
    it("rejects authenticated non-admins", async () => {
        const { survey } = await resultsScene()
        await createUserWithRoles([{ role: "captain" }])
        const result = await getSurveyRawResponses(survey.id)
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("omits identity on an anonymous survey and includes it on an identified one for an admin", async () => {
        const template = await createSurveyTemplate()
        const question = await createSurveyQuestion(template.id)
        const identified = await createSurvey(template.id, {
            status: "open",
            question_ids: [question.id]
        })
        const anonymous = await createSurvey(template.id, {
            status: "open",
            is_anonymous: true,
            question_ids: [question.id]
        })

        const respondent = await createUser({
            first_name: "Robin",
            last_name: "Reader"
        })
        await seedYesNoResponse(identified.id, question.id, true, {
            user_id: respondent.id
        })
        await seedYesNoResponse(anonymous.id, question.id, true)

        await createUserWithRoles([{ role: "admin" }])

        const identifiedResult = await getSurveyRawResponses(identified.id)
        if (!identifiedResult.status) throw new Error("expected responses")
        expect(identifiedResult.data.anonymous).toBe(false)
        expect(identifiedResult.data.responses).toHaveLength(1)
        expect(identifiedResult.data.responses[0].name).toContain("Reader")
        expect(identifiedResult.data.responses[0].email).toBe(respondent.email)

        const anonymousResult = await getSurveyRawResponses(anonymous.id)
        if (!anonymousResult.status) throw new Error("expected responses")
        expect(anonymousResult.data.anonymous).toBe(true)
        expect(anonymousResult.data.responses).toHaveLength(1)
        expect(anonymousResult.data.responses[0].name).toBeUndefined()
        expect(anonymousResult.data.responses[0].email).toBeUndefined()
    })
})

describe("getTemplateTrends", () => {
    it("rejects authenticated non-admins", async () => {
        const template = await createSurveyTemplate()
        await createUserWithRoles([{ role: "captain" }])
        const result = await getTemplateTrends(template.id)
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("orders instances across two seasons and reports the trend series", async () => {
        const template = await createSurveyTemplate()
        const question = await createSurveyQuestion(template.id)

        const springSeason = await createSeason({
            year: 2026,
            season: "spring"
        })
        const fallSeason = await createSeason({ year: 2026, season: "fall" })

        const springSurvey = await createSurvey(template.id, {
            title: "Spring check-in",
            status: "closed",
            season_id: springSeason.id,
            question_ids: [question.id]
        })
        const fallSurvey = await createSurvey(template.id, {
            title: "Fall wrap-up",
            status: "closed",
            season_id: fallSeason.id,
            question_ids: [question.id]
        })

        await seedYesNoResponse(springSurvey.id, question.id, false)
        await seedYesNoResponse(fallSurvey.id, question.id, true)
        await seedYesNoResponse(fallSurvey.id, question.id, true)

        await createUserWithRoles([{ role: "admin" }])

        const result = await getTemplateTrends(template.id)
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected trends")

        expect(result.data.template).toEqual({
            id: template.id,
            name: template.name
        })
        expect(result.data.trends).toHaveLength(1)

        const series = result.data.trends[0].series.find((s) => s.key === "yes")
        expect(series).toBeDefined()
        expect(series?.points.map((p) => p.label)).toEqual([
            "Spring check-in (Spring 2026)",
            "Fall wrap-up (Fall 2026)"
        ])
        expect(series?.points.map((p) => p.value)).toEqual([0, 100])
    })
})
