import { asc, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    surveyAnswers,
    surveyQuestions,
    surveyResponses,
    surveyTemplates
} from "@/database/schema"
import type { TemplateQuestionInput } from "@/lib/surveys/template-rules"
import {
    createSurvey,
    createSurveyQuestion,
    createSurveyTemplate
} from "@/test/factories"
import { createUserWithRoles } from "@/test/session"
import {
    archiveSurveyTemplate,
    archiveTemplateQuestion,
    createSurveyTemplate as createSurveyTemplateAction,
    getSurveyTemplateEditor,
    getSurveyTemplates,
    restoreSurveyTemplate,
    restoreTemplateQuestion,
    saveTemplateQuestions,
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
