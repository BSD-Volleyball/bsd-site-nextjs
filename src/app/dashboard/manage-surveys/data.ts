import "server-only"

import { db } from "@/database/db"
import { surveyTemplates } from "@/database/schema"
import { buildTrend, type QuestionTrend } from "@/lib/surveys/reporting"
import { loadTemplateInstances } from "@/lib/surveys/results-data"
import {
    getEditorOptions,
    getSurveyEditorData,
    listCurrentSeasonDivisions,
    listSurveys,
    type SurveyEditorData,
    type SurveyEditorOptions,
    type SurveyListRow
} from "@/lib/surveys/surveys"
import {
    getTemplateQuestions,
    listTemplates,
    type TemplateSummary
} from "@/lib/surveys/templates"
import type { SurveyQuestionDef } from "@/lib/surveys/types"
import { listUserNames } from "@/lib/user-directory"
import {
    type ActionResult,
    fail,
    ok,
    requirePermission,
    requirePositiveInt,
    requireSession,
    withAction
} from "@/next/action-helpers"
import { eq } from "drizzle-orm"

export const getSurveyTemplates = withAction(
    async (): Promise<ActionResult<TemplateSummary[]>> => {
        await requirePermission("surveys:manage")
        await requireSession()
        return ok(await listTemplates())
    }
)

export interface SurveyEditorOptionsPayload extends SurveyEditorOptions {
    users: { id: string; name: string }[]
}

export const getSurveys = withAction(
    async (): Promise<ActionResult<SurveyListRow[]>> => {
        await requirePermission("surveys:manage")
        await requireSession()
        return ok(await listSurveys())
    }
)

export const getSurveyEditorOptions = withAction(
    async (): Promise<ActionResult<SurveyEditorOptionsPayload>> => {
        await requirePermission("surveys:manage")
        const session = await requireSession()
        const options = await getEditorOptions()
        return ok({ ...options, users: await listUserNames(session.user.id) })
    }
)

export const getSurveyEditor = withAction(
    async (
        surveyId: number
    ): Promise<ActionResult<SurveyEditorData | null>> => {
        await requirePermission("surveys:manage")
        await requireSession()
        const id = requirePositiveInt(surveyId, "survey ID")
        return ok(await getSurveyEditorData(id))
    }
)

/**
 * The narrow set of filter options the results page's Select controls need.
 * Deliberately separate from `getSurveyEditorOptions` (gated on
 * `surveys:manage`) so a `surveys:view_results`-only viewer can load the
 * results page's division filter without an editor-level permission.
 */
export const getSurveyFilterOptions = withAction(
    async (): Promise<
        ActionResult<{ divisions: { id: number; name: string }[] }>
    > => {
        await requirePermission("surveys:view_results")
        await requireSession()
        return ok({ divisions: await listCurrentSeasonDivisions() })
    }
)

export const getTemplateTrends = withAction(
    async (
        templateId: number
    ): Promise<
        ActionResult<{
            template: { id: number; name: string }
            questions: SurveyQuestionDef[]
            trends: QuestionTrend[]
        }>
    > => {
        await requirePermission("surveys:view_results")
        await requireSession()
        const id = requirePositiveInt(templateId, "template ID")

        const [template] = await db
            .select({ id: surveyTemplates.id, name: surveyTemplates.name })
            .from(surveyTemplates)
            .where(eq(surveyTemplates.id, id))
            .limit(1)
        if (!template) return fail("Survey template not found.")

        const instances = await loadTemplateInstances(id)
        const appearingIds = new Set<number>()
        for (const instance of instances) {
            for (const key of Object.keys(instance.aggregates)) {
                appearingIds.add(Number(key))
            }
        }

        const allQuestions = await getTemplateQuestions(id)
        const questions = allQuestions.filter((question) =>
            appearingIds.has(question.id)
        )
        const trends = buildTrend(questions, instances)

        return ok({ template, questions, trends })
    }
)
