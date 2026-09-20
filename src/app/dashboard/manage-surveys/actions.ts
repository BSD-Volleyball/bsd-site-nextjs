"use server"

import { db } from "@/database/db"
import { surveyQuestions, surveys, surveyTemplates } from "@/database/schema"
import { logAuditEntry } from "@/lib/audit-log"
import {
    canArchiveQuestion,
    type TemplateQuestionInput
} from "@/lib/surveys/template-rules"
import {
    assertVisibilityGraphSound,
    getTemplateEditorData,
    listTemplates,
    rowToQuestionDef,
    saveTemplateQuestions as saveTemplateQuestionRows,
    type TemplateEditorData,
    type TemplateSummary
} from "@/lib/surveys/templates"
import { SURVEY_LIMITS } from "@/lib/surveys/types"
import {
    ActionError,
    type ActionResult,
    fail,
    ok,
    requireNonEmptyString,
    requirePermission,
    requirePositiveInt,
    requireSession,
    withAction
} from "@/next/action-helpers"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

const MANAGE_SURVEYS_PATH = "/dashboard/manage-surveys"

export interface TemplateFields {
    name: string
    description: string | null
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const getSurveyTemplates = withAction(
    async (): Promise<ActionResult<TemplateSummary[]>> => {
        await requirePermission("surveys:manage")
        await requireSession()
        return ok(await listTemplates())
    }
)

export const createSurveyTemplate = withAction(
    async (
        fields: TemplateFields
    ): Promise<ActionResult<{ templateId: number }>> => {
        await requirePermission("surveys:manage")
        const session = await requireSession()
        const { name, description } = cleanTemplateFields(fields)

        const [row] = await db
            .insert(surveyTemplates)
            .values({
                name,
                description,
                created_by: session.user.id
            })
            .returning({ id: surveyTemplates.id })

        await logAuditEntry({
            userId: session.user.id,
            action: "survey_template_create",
            entityType: "survey_template",
            entityId: row.id,
            summary: `Created survey template "${name}".`
        })
        revalidatePath(MANAGE_SURVEYS_PATH)
        return ok({ templateId: row.id })
    }
)

export const updateSurveyTemplate = withAction(
    async (
        templateId: number,
        fields: TemplateFields
    ): Promise<ActionResult<void>> => {
        await requirePermission("surveys:manage")
        const session = await requireSession()
        const id = requirePositiveInt(templateId, "template ID")
        const { name, description } = cleanTemplateFields(fields)

        const [existing] = await db
            .select({ id: surveyTemplates.id })
            .from(surveyTemplates)
            .where(eq(surveyTemplates.id, id))
            .limit(1)
        if (!existing) return fail("Survey template not found.")

        await db
            .update(surveyTemplates)
            .set({ name, description, updated_at: new Date() })
            .where(eq(surveyTemplates.id, id))

        await logAuditEntry({
            userId: session.user.id,
            action: "survey_template_update",
            entityType: "survey_template",
            entityId: id,
            summary: `Updated survey template "${name}".`
        })
        revalidatePath(MANAGE_SURVEYS_PATH)
        return ok(undefined, "Template saved.")
    }
)

export const archiveSurveyTemplate = withAction(
    async (templateId: number): Promise<ActionResult<void>> => {
        await requirePermission("surveys:manage")
        const session = await requireSession()
        const id = requirePositiveInt(templateId, "template ID")

        const [existing] = await db
            .select({ name: surveyTemplates.name })
            .from(surveyTemplates)
            .where(eq(surveyTemplates.id, id))
            .limit(1)
        if (!existing) return fail("Survey template not found.")

        const openSurveys = await db
            .select({ id: surveys.id })
            .from(surveys)
            .where(and(eq(surveys.template_id, id), eq(surveys.status, "open")))
            .limit(1)
        if (openSurveys.length > 0) {
            return fail("Close its open surveys first.")
        }

        await db
            .update(surveyTemplates)
            .set({ is_archived: true, updated_at: new Date() })
            .where(eq(surveyTemplates.id, id))

        await logAuditEntry({
            userId: session.user.id,
            action: "survey_template_archive",
            entityType: "survey_template",
            entityId: id,
            summary: `Archived survey template "${existing.name}".`
        })
        revalidatePath(MANAGE_SURVEYS_PATH)
        return ok(undefined, "Template archived.")
    }
)

export const restoreSurveyTemplate = withAction(
    async (templateId: number): Promise<ActionResult<void>> => {
        await requirePermission("surveys:manage")
        const session = await requireSession()
        const id = requirePositiveInt(templateId, "template ID")

        const [existing] = await db
            .select({ name: surveyTemplates.name })
            .from(surveyTemplates)
            .where(eq(surveyTemplates.id, id))
            .limit(1)
        if (!existing) return fail("Survey template not found.")

        await db
            .update(surveyTemplates)
            .set({ is_archived: false, updated_at: new Date() })
            .where(eq(surveyTemplates.id, id))

        await logAuditEntry({
            userId: session.user.id,
            action: "survey_template_restore",
            entityType: "survey_template",
            entityId: id,
            summary: `Restored survey template "${existing.name}".`
        })
        revalidatePath(MANAGE_SURVEYS_PATH)
        return ok(undefined, "Template restored.")
    }
)

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export const getSurveyTemplateEditor = withAction(
    async (
        templateId: number
    ): Promise<ActionResult<TemplateEditorData | null>> => {
        await requirePermission("surveys:manage")
        await requireSession()
        const id = requirePositiveInt(templateId, "template ID")
        return ok(await getTemplateEditorData(id))
    }
)

export const saveTemplateQuestions = withAction(
    async (
        templateId: number,
        questions: TemplateQuestionInput[]
    ): Promise<ActionResult<void>> => {
        await requirePermission("surveys:manage")
        const session = await requireSession()
        const id = requirePositiveInt(templateId, "template ID")
        if (!Array.isArray(questions)) return fail("Invalid question list.")

        const [existing] = await db
            .select({ name: surveyTemplates.name })
            .from(surveyTemplates)
            .where(eq(surveyTemplates.id, id))
            .limit(1)
        if (!existing) return fail("Survey template not found.")

        await saveTemplateQuestionRows(id, questions)

        await logAuditEntry({
            userId: session.user.id,
            action: "survey_template_update",
            entityType: "survey_template",
            entityId: id,
            summary: `Saved ${questions.length} question(s) on survey template "${existing.name}".`
        })
        revalidatePath(MANAGE_SURVEYS_PATH)
        return ok(undefined, "Questions saved.")
    }
)

export const archiveTemplateQuestion = withAction(
    async (
        templateId: number,
        questionId: number
    ): Promise<ActionResult<void>> => {
        await requirePermission("surveys:manage")
        const session = await requireSession()
        const id = requirePositiveInt(templateId, "template ID")
        const qid = requirePositiveInt(questionId, "question ID")

        const rows = await db
            .select()
            .from(surveyQuestions)
            .where(eq(surveyQuestions.template_id, id))
        const target = rows.find((row) => row.id === qid)
        if (!target) return fail("Question not found on this template.")
        if (target.archived_at !== null) {
            return fail("That question is already archived.")
        }

        const blocked = canArchiveQuestion(qid, rows.map(rowToQuestionDef))
        if (blocked) return fail(blocked)

        await db
            .update(surveyQuestions)
            .set({ archived_at: new Date() })
            .where(eq(surveyQuestions.id, qid))

        await logAuditEntry({
            userId: session.user.id,
            action: "survey_template_update",
            entityType: "survey_template",
            entityId: id,
            summary: `Archived question "${target.prompt}".`
        })
        revalidatePath(MANAGE_SURVEYS_PATH)
        return ok(undefined, "Question archived.")
    }
)

export const restoreTemplateQuestion = withAction(
    async (
        templateId: number,
        questionId: number
    ): Promise<ActionResult<void>> => {
        await requirePermission("surveys:manage")
        const session = await requireSession()
        const id = requirePositiveInt(templateId, "template ID")
        const qid = requirePositiveInt(questionId, "question ID")

        const [target] = await db
            .select()
            .from(surveyQuestions)
            .where(
                and(
                    eq(surveyQuestions.id, qid),
                    eq(surveyQuestions.template_id, id)
                )
            )
            .limit(1)
        if (!target) return fail("Question not found on this template.")
        if (target.archived_at === null) {
            return fail("That question is not archived.")
        }

        // Its own branching rules come back with it, so the graph has to hold
        // again; a dangling rule rolls the restore back.
        await db.transaction(async (tx) => {
            await tx
                .update(surveyQuestions)
                .set({ archived_at: null })
                .where(eq(surveyQuestions.id, qid))
            await assertVisibilityGraphSound(id, tx)
        })

        await logAuditEntry({
            userId: session.user.id,
            action: "survey_template_restore",
            entityType: "survey_template",
            entityId: id,
            summary: `Restored question "${target.prompt}".`
        })
        revalidatePath(MANAGE_SURVEYS_PATH)
        return ok(undefined, "Question restored.")
    }
)

// ---------------------------------------------------------------------------

function cleanTemplateFields(fields: TemplateFields): {
    name: string
    description: string | null
} {
    const name = requireNonEmptyString(fields?.name, "Template name")
    if (name.length > SURVEY_LIMITS.maxTitleLength) {
        throw new ActionError(
            `Template names are at most ${SURVEY_LIMITS.maxTitleLength} characters.`
        )
    }
    const description =
        typeof fields.description === "string" ? fields.description.trim() : ""
    return { name, description: description === "" ? null : description }
}
