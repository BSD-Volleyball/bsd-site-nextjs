/**
 * results-data.ts — the db reads behind survey results and trend reporting.
 *
 * Pure db + drizzle + lib: no Next imports. Turns submitted response/answer
 * rows into the `ReportResponse[]` shape `reporting.ts` aggregates, and turns
 * a template's run history into the `TrendInstance[]` shape `buildTrend`
 * consumes.
 */

import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/database/db"
import {
    seasons,
    surveyAnswers,
    surveyRecipients,
    surveyResponses,
    surveys,
    users
} from "@/database/schema"
import { ActionError } from "@/lib/action-result"
import { formatSeasonLabel } from "@/lib/season-utils"
import { formatPlayerName } from "@/lib/utils"
import { QUESTION_TYPE_DEFS } from "./question-types"
import { questionsForSurvey, seriesOrderKey } from "./questions-for-survey"
import {
    aggregateSurvey,
    type ReportResponse,
    type TrendInstance
} from "./reporting"
import { getTemplateQuestions } from "./templates"
import type { AnswerMap, SurveyQuestionDef } from "./types"

type SurveyRow = typeof surveys.$inferSelect

async function loadSurveyRow(surveyId: number): Promise<SurveyRow> {
    const [row] = await db
        .select()
        .from(surveys)
        .where(eq(surveys.id, surveyId))
        .limit(1)
    if (!row) throw new ActionError("Survey not found.")
    return row
}

async function questionMapForSurvey(
    templateId: number
): Promise<Map<number, SurveyQuestionDef>> {
    const questions = await getTemplateQuestions(templateId)
    return new Map(questions.map((question) => [question.id, question]))
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

/**
 * Decodes the stored answer columns back into `AnswerMap`s, one per response.
 * A row whose question is not on the given map (deleted, or belongs to a
 * different template) is skipped.
 */
async function loadAnswerMaps(
    responseIds: number[],
    questionById: Map<number, SurveyQuestionDef>
): Promise<Map<number, AnswerMap>> {
    if (responseIds.length === 0) return new Map()

    const rows = await db
        .select()
        .from(surveyAnswers)
        .where(inArray(surveyAnswers.response_id, responseIds))

    const byResponse = new Map<number, AnswerMap>()
    for (const row of rows) {
        const question = questionById.get(row.question_id)
        if (!question) continue
        const value = QUESTION_TYPE_DEFS[question.type].fromColumns(row)
        if (value === null) continue
        const map = byResponse.get(row.response_id) ?? {}
        map[row.question_id] = value
        byResponse.set(row.response_id, map)
    }
    return byResponse
}

/**
 * Invited count + submitted responses (with answers decoded) for one survey.
 *
 * The counting rule, so the response rate can never exceed 100%: `invited` is
 * the recipients still on the list (`removed_at IS NULL`), and `submitted` is
 * the submitted responses that belong to one of those recipients. A response
 * whose recipient was later removed is left out of both sides rather than
 * counted against a denominator it is no longer part of. An anonymous
 * survey's submitted response has its `recipient_id` cleared on purpose (that
 * is what makes it anonymous), so it has no recipient to check and always
 * counts.
 */
async function loadInvitedAndResponses(
    surveyId: number,
    questionById: Map<number, SurveyQuestionDef>
): Promise<{ invited: number; responses: ReportResponse[] }> {
    const [invitedRows, responseRows] = await Promise.all([
        db
            .select({ id: surveyRecipients.id })
            .from(surveyRecipients)
            .where(
                and(
                    eq(surveyRecipients.survey_id, surveyId),
                    isNull(surveyRecipients.removed_at)
                )
            ),
        db
            .select({ response: surveyResponses, recipient: surveyRecipients })
            .from(surveyResponses)
            .leftJoin(
                surveyRecipients,
                eq(surveyRecipients.id, surveyResponses.recipient_id)
            )
            .where(
                and(
                    eq(surveyResponses.survey_id, surveyId),
                    eq(surveyResponses.status, "submitted")
                )
            )
    ])

    const counted = responseRows.filter(
        (row) => row.recipient === null || row.recipient.removed_at === null
    )

    const answers = await loadAnswerMaps(
        counted.map((row) => row.response.id),
        questionById
    )

    const responses: ReportResponse[] = counted.map(({ response }) => ({
        responseId: response.id,
        submittedOn: response.submitted_on,
        roleTags: response.role_tags,
        divisionId: response.division_id,
        gender: response.gender,
        answers: answers.get(response.id) ?? {}
    }))

    return { invited: invitedRows.length, responses }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Submitted responses for one survey, ready to feed `aggregateSurvey`, plus
 * the invited count (recipients still on the list, i.e. `removed_at IS NULL`).
 */
export async function loadSurveyResponses(
    surveyId: number
): Promise<{ invited: number; responses: ReportResponse[] }> {
    const survey = await loadSurveyRow(surveyId)
    const questionById = await questionMapForSurvey(survey.template_id)
    return loadInvitedAndResponses(surveyId, questionById)
}

/**
 * Submitted responses with an optional name/email attached. Identity is only
 * joined when `includeIdentity` is true; an anonymous survey's submitted
 * responses have `user_id = null` so the join would come back empty anyway.
 */
export async function loadRawResponses(
    surveyId: number,
    includeIdentity: boolean
): Promise<(ReportResponse & { name?: string; email?: string })[]> {
    const survey = await loadSurveyRow(surveyId)
    const questionById = await questionMapForSurvey(survey.template_id)

    const rows = await db
        .select({
            response: surveyResponses,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            email: users.email
        })
        .from(surveyResponses)
        .leftJoin(users, eq(users.id, surveyResponses.user_id))
        .where(
            and(
                eq(surveyResponses.survey_id, surveyId),
                eq(surveyResponses.status, "submitted")
            )
        )

    const answers = await loadAnswerMaps(
        rows.map((row) => row.response.id),
        questionById
    )

    return rows.map((row) => {
        const base: ReportResponse & { name?: string; email?: string } = {
            responseId: row.response.id,
            submittedOn: row.response.submitted_on,
            roleTags: row.response.role_tags,
            divisionId: row.response.division_id,
            gender: row.response.gender,
            answers: answers.get(row.response.id) ?? {}
        }
        if (
            includeIdentity &&
            row.firstName !== null &&
            row.lastName !== null
        ) {
            base.name = formatPlayerName(
                row.firstName,
                row.lastName,
                row.preferredName
            )
            base.email = row.email ?? undefined
        }
        return base
    })
}

/**
 * One trend point per open-or-closed run of a template. Aggregation uses an
 * empty filter and `anonymous: false` deliberately: trend values are already
 * coarse (means, percentages, counts), so per-instance small-cell suppression
 * would just hide data without protecting anyone the per-response detail
 * report wouldn't already protect.
 */
export async function loadTemplateInstances(
    templateId: number
): Promise<TrendInstance[]> {
    const questions = await getTemplateQuestions(templateId)
    const questionById = new Map(
        questions.map((question) => [question.id, question])
    )

    const rows = await db
        .select({
            survey: surveys,
            seasonName: seasons.season,
            seasonYear: seasons.year
        })
        .from(surveys)
        .leftJoin(seasons, eq(surveys.season_id, seasons.id))
        .where(
            and(
                eq(surveys.template_id, templateId),
                inArray(surveys.status, ["open", "closed"])
            )
        )
        .orderBy(desc(surveys.id))

    const instances: TrendInstance[] = []
    for (const row of rows) {
        const instanceQuestions = questionsForSurvey(
            { questionIds: row.survey.question_ids },
            questions
        )
        const { invited, responses } = await loadInvitedAndResponses(
            row.survey.id,
            questionById
        )
        const report = aggregateSurvey({
            questions: instanceQuestions,
            responses,
            invited,
            filter: {},
            anonymous: false
        })

        const aggregates: TrendInstance["aggregates"] = {}
        for (const { question, aggregate } of report.byQuestion) {
            aggregates[question.id] = aggregate
        }

        const seasonLabel =
            row.seasonName !== null && row.seasonYear !== null
                ? formatSeasonLabel({
                      seasonName: row.seasonName,
                      seasonYear: row.seasonYear
                  })
                : ""
        const label =
            seasonLabel === ""
                ? row.survey.title
                : `${row.survey.title} (${seasonLabel})`

        instances.push({
            surveyId: row.survey.id,
            label,
            orderKey: seriesOrderKey({
                seasonYear: row.seasonYear,
                seasonName: row.seasonName,
                publishedAt: row.survey.published_at
            }),
            submitted: responses.length,
            aggregates
        })
    }

    return instances
}
