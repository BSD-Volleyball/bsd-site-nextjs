"use server"

import { db } from "@/database/db"
import {
    seasons,
    surveyQuestions,
    surveyRecipients,
    surveys,
    surveyTemplates
} from "@/database/schema"
import { logAuditEntry } from "@/lib/audit-log"
import type { DispatchResult } from "@/lib/notifications/dispatch"
import {
    buildTrend,
    aggregateSurvey,
    type QuestionTrend,
    type ReportResponse,
    type SegmentFilter,
    type SurveyReport
} from "@/lib/surveys/reporting"
import { questionsForSurvey } from "@/lib/surveys/questions-for-survey"
import {
    loadSurveyResponses,
    loadRawResponses,
    loadTemplateInstances
} from "@/lib/surveys/results-data"
import { resolveAudience } from "@/lib/surveys/audience"
import {
    addRecipients,
    closeSurvey as closeSurveyRun,
    publishSurvey as publishSurveyRun,
    removeRecipient,
    sendSurveyInvitations
} from "@/lib/surveys/lifecycle"
import { sendSurveyReminder } from "@/lib/surveys/reminders"
import {
    getEditorOptions,
    getSurveyEditorData,
    labelAudienceGroups,
    listSurveys,
    type SurveyEditorData,
    type SurveyEditorOptions,
    type SurveyListRow,
    type SurveySettingsInput
} from "@/lib/surveys/surveys"
import {
    canArchiveQuestion,
    type TemplateQuestionInput
} from "@/lib/surveys/template-rules"
import {
    assertActiveQuestionLimit,
    assertVisibilityGraphSound,
    getTemplateEditorData,
    getTemplateQuestions,
    listTemplates,
    lockTemplate,
    rowToQuestionDef,
    saveTemplateQuestions as saveTemplateQuestionRows,
    type TemplateEditorData,
    type TemplateSummary
} from "@/lib/surveys/templates"
import {
    SURVEY_GROUP_TYPES,
    SURVEY_LIMITS,
    isSurveyRoleTag,
    type SurveyAudienceDefinition,
    type SurveyAudienceGroup,
    type SurveyGender,
    type SurveyQuestionDef,
    type SurveyStatus,
    validateAudience
} from "@/lib/surveys/types"
import { listUserNames } from "@/lib/user-directory"
import { formatPlayerName } from "@/lib/utils"
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
import { hasPermissionBySession } from "@/next/session"
import { and, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"

const MANAGE_SURVEYS_PATH = "/dashboard/manage-surveys"
const MY_SURVEYS_PATH = "/dashboard/surveys"

/** Names shown in the audience preview, capped so the payload stays small. */
const PREVIEW_NAME_LIMIT = 200

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
            action: "survey_question_archive",
            entityType: "survey_question",
            entityId: qid,
            summary: `Archived question "${target.prompt}" on survey template ${id}.`
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
        // again, and the active list must still fit under the question
        // ceiling; either failure rolls the restore back.
        await db.transaction(async (tx) => {
            await lockTemplate(id, tx)
            await tx
                .update(surveyQuestions)
                .set({ archived_at: null })
                .where(eq(surveyQuestions.id, qid))
            await assertActiveQuestionLimit(id, tx)
            await assertVisibilityGraphSound(id, tx)
        })

        await logAuditEntry({
            userId: session.user.id,
            action: "survey_question_restore",
            entityType: "survey_question",
            entityId: qid,
            summary: `Restored question "${target.prompt}" on survey template ${id}.`
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

// ---------------------------------------------------------------------------
// Surveys (instances)
// ---------------------------------------------------------------------------

export interface CreateSurveyInput {
    templateId: number
    seasonId: number | null
    title: string
}

export interface SurveyEditorOptionsPayload extends SurveyEditorOptions {
    users: { id: string; name: string }[]
}

export interface AudiencePreview {
    total: number
    groupCounts: { label: string; count: number }[]
    names: string[]
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

export const createSurvey = withAction(
    async (
        input: CreateSurveyInput
    ): Promise<ActionResult<{ surveyId: number }>> => {
        await requirePermission("surveys:manage")
        const session = await requireSession()
        const templateId = requirePositiveInt(input?.templateId, "template ID")
        const title = cleanSurveyTitle(input?.title)
        const seasonId = optionalSeasonId(input?.seasonId)

        const [template] = await db
            .select({
                id: surveyTemplates.id,
                isArchived: surveyTemplates.is_archived
            })
            .from(surveyTemplates)
            .where(eq(surveyTemplates.id, templateId))
            .limit(1)
        if (!template) return fail("Survey template not found.")
        if (template.isArchived) return fail("That template is archived.")
        if (seasonId !== null) await assertSeasonExists(seasonId)

        const [row] = await db
            .insert(surveys)
            .values({
                template_id: templateId,
                season_id: seasonId,
                title,
                created_by: session.user.id
            })
            .returning({ id: surveys.id })

        await logAuditEntry({
            userId: session.user.id,
            action: "survey_create",
            entityType: "survey",
            entityId: row.id,
            summary: `Created survey "${title}".`
        })
        revalidatePath(MANAGE_SURVEYS_PATH)
        return ok({ surveyId: row.id })
    }
)

export const updateSurveySettings = withAction(
    async (
        surveyId: number,
        settings: SurveySettingsInput
    ): Promise<ActionResult<void>> => {
        await requirePermission("surveys:manage")
        const session = await requireSession()
        const id = requirePositiveInt(surveyId, "survey ID")
        if (typeof settings !== "object" || settings === null) {
            return fail("Invalid survey settings.")
        }
        const survey = await loadSurvey(id)

        const title = cleanSurveyTitle(settings.title)
        const intro =
            typeof settings.intro === "string" ? settings.intro.trim() : ""
        const opensAt = parseInstant(settings.opensAt, "open date")
        const closesAt = parseInstant(settings.closesAt, "close date")
        if (opensAt !== null && closesAt !== null && opensAt >= closesAt) {
            return fail("The close date must come after the open date.")
        }
        // A survey that is already taking answers cannot be given a deadline
        // that has already gone by: it would shut the moment it was saved.
        if (
            survey.status === "open" &&
            closesAt !== null &&
            closesAt <= new Date()
        ) {
            return fail(
                "The close date must be in the future while the survey is open."
            )
        }
        const reminderIntervalDays = boundedInt(
            settings.reminderIntervalDays,
            "Reminder interval",
            0,
            90
        )
        const reminderMaxCount = boundedInt(
            settings.reminderMaxCount,
            "Reminder count",
            0,
            20
        )

        // Both are baked into the recipient rows at publish — the season
        // decides who was invited and what their role tags meant, and
        // anonymity is what people were promised when they answered.
        const seasonId = optionalSeasonId(settings.seasonId)
        const isAnonymous = settings.isAnonymous === true
        if (survey.status !== "draft") {
            if (isAnonymous !== survey.is_anonymous) {
                return fail("Anonymity can't be changed after publishing.")
            }
            if (seasonId !== survey.season_id) {
                return fail("The season can't be changed after publishing.")
            }
        }
        if (seasonId !== null) await assertSeasonExists(seasonId)

        await db
            .update(surveys)
            .set({
                title,
                intro: intro === "" ? null : intro,
                season_id: seasonId,
                is_anonymous: isAnonymous,
                opens_at: opensAt,
                closes_at: closesAt,
                reminder_interval_days: reminderIntervalDays,
                reminder_max_count: reminderMaxCount,
                updated_at: new Date()
            })
            .where(eq(surveys.id, id))

        await logAuditEntry({
            userId: session.user.id,
            action: "survey_update",
            entityType: "survey",
            entityId: id,
            summary: `Updated settings on survey "${title}".`
        })
        revalidatePath(MANAGE_SURVEYS_PATH)
        return ok(undefined, "Survey saved.")
    }
)

export const updateSurveyAudience = withAction(
    async (
        surveyId: number,
        audience: SurveyAudienceDefinition
    ): Promise<ActionResult<void>> => {
        await requirePermission("surveys:manage")
        const session = await requireSession()
        const id = requirePositiveInt(surveyId, "survey ID")
        const survey = await loadSurvey(id)
        if (survey.status !== "draft") {
            return fail("The audience can't be changed after publishing.")
        }

        const definition = sanitizeAudience(audience)
        const errors = validateAudience(definition, survey.season_id)
        if (errors.length > 0) return fail(errors[0])

        await db
            .update(surveys)
            .set({ audience: definition, updated_at: new Date() })
            .where(eq(surveys.id, id))

        await logAuditEntry({
            userId: session.user.id,
            action: "survey_update",
            entityType: "survey",
            entityId: id,
            summary: `Updated the audience on survey "${survey.title}".`
        })
        revalidatePath(MANAGE_SURVEYS_PATH)
        return ok(undefined, "Audience saved.")
    }
)

export const previewSurveyAudience = withAction(
    async (surveyId: number): Promise<ActionResult<AudiencePreview>> => {
        await requirePermission("surveys:manage")
        await requireSession()
        const id = requirePositiveInt(surveyId, "survey ID")
        const survey = await loadSurvey(id)

        const { recipients, groupCounts } = await resolveAudience(
            survey.audience,
            survey.season_id
        )
        const labels = await labelAudienceGroups(
            groupCounts.map((entry) => entry.group),
            survey.season_id
        )

        const names = [...recipients]
            .sort(
                (a, b) =>
                    a.lastName.localeCompare(b.lastName) ||
                    a.firstName.localeCompare(b.firstName)
            )
            .slice(0, PREVIEW_NAME_LIMIT)
            .map((recipient) =>
                formatPlayerName(recipient.firstName, recipient.lastName)
            )

        return ok({
            total: recipients.length,
            groupCounts: groupCounts.map((entry, index) => ({
                label: labels[index],
                count: entry.count
            })),
            names
        })
    }
)

export const publishSurvey = withAction(
    async (
        surveyId: number
    ): Promise<
        ActionResult<{ recipients: number; invitations: DispatchResult }>
    > => {
        await requirePermission("surveys:manage")
        const session = await requireSession()
        const id = requirePositiveInt(surveyId, "survey ID")
        const survey = await loadSurvey(id)

        // Every publishability rule lives in the lifecycle transaction and
        // surfaces as an ActionError, which withAction turns into fail().
        const result = await publishSurveyRun(id, session.user.id)

        await logAuditEntry({
            userId: session.user.id,
            action: "survey_publish",
            entityType: "survey",
            entityId: id,
            summary: `Published survey "${survey.title}" to ${result.recipients} recipient(s); ${result.invitations.sent} invitation(s) sent.`
        })
        revalidatePath(MANAGE_SURVEYS_PATH)
        revalidatePath(MY_SURVEYS_PATH)
        return ok(
            result,
            `Published to ${result.recipients} recipient(s); ${result.invitations.sent} invitation(s) sent.`
        )
    }
)

export const closeSurvey = withAction(
    async (surveyId: number): Promise<ActionResult<void>> => {
        await requirePermission("surveys:manage")
        const session = await requireSession()
        const id = requirePositiveInt(surveyId, "survey ID")
        const survey = await loadSurvey(id)
        if (survey.status !== "open") {
            return fail("Only an open survey can be closed.")
        }

        await closeSurveyRun(id, "manual")

        await logAuditEntry({
            userId: session.user.id,
            action: "survey_close",
            entityType: "survey",
            entityId: id,
            summary: `Closed survey "${survey.title}".`
        })
        revalidatePath(MANAGE_SURVEYS_PATH)
        revalidatePath(MY_SURVEYS_PATH)
        return ok(undefined, "Survey closed.")
    }
)

export const deleteSurvey = withAction(
    async (surveyId: number): Promise<ActionResult<void>> => {
        await requirePermission("surveys:manage")
        const session = await requireSession()
        const id = requirePositiveInt(surveyId, "survey ID")
        const survey = await loadSurvey(id)
        // Once it is published there are answers and an invite list behind it;
        // closing is the way to end a survey, not deleting it.
        if (survey.status !== "draft") {
            return fail("Only a draft survey can be deleted.")
        }

        await db.delete(surveys).where(eq(surveys.id, id))

        await logAuditEntry({
            userId: session.user.id,
            action: "survey_delete",
            entityType: "survey",
            entityId: id,
            summary: `Deleted draft survey "${survey.title}".`
        })
        revalidatePath(MANAGE_SURVEYS_PATH)
        return ok(undefined, "Draft deleted.")
    }
)

export const addSurveyRecipients = withAction(
    async (
        surveyId: number,
        userIds: string[]
    ): Promise<
        ActionResult<{ added: number; invitations: DispatchResult }>
    > => {
        await requirePermission("surveys:manage")
        const session = await requireSession()
        const id = requirePositiveInt(surveyId, "survey ID")
        if (!Array.isArray(userIds)) return fail("Invalid recipient list.")
        const ids = sanitizeUserIds(userIds)
        if (ids.length === 0) return fail("Pick at least one person to add.")
        const survey = await loadSurvey(id)

        const result = await addRecipients(id, ids, session.user.id)
        if (result.added === 0) {
            return ok(result, "Everyone selected was already on the list.")
        }

        await logAuditEntry({
            userId: session.user.id,
            action: "survey_recipient_add",
            entityType: "survey",
            entityId: id,
            summary: `Added ${result.added} recipient(s) to survey "${survey.title}"; ${result.invitations.sent} invitation(s) sent.`
        })
        revalidatePath(MANAGE_SURVEYS_PATH)
        revalidatePath(MY_SURVEYS_PATH)
        return ok(result, `Added ${result.added} recipient(s).`)
    }
)

export const removeSurveyRecipient = withAction(
    async (surveyId: number, userId: string): Promise<ActionResult<void>> => {
        await requirePermission("surveys:manage")
        const session = await requireSession()
        const id = requirePositiveInt(surveyId, "survey ID")
        const targetId = requireNonEmptyString(userId, "User")
        const survey = await loadSurvey(id)

        const [existing] = await db
            .select({ id: surveyRecipients.id })
            .from(surveyRecipients)
            .where(
                and(
                    eq(surveyRecipients.survey_id, id),
                    eq(surveyRecipients.user_id, targetId),
                    isNull(surveyRecipients.removed_at)
                )
            )
            .limit(1)
        if (!existing) return fail("That person is not on the invite list.")

        await removeRecipient(id, targetId)

        await logAuditEntry({
            userId: session.user.id,
            action: "survey_recipient_remove",
            entityType: "survey",
            entityId: id,
            summary: `Removed a recipient from survey "${survey.title}".`
        })
        revalidatePath(MANAGE_SURVEYS_PATH)
        revalidatePath(MY_SURVEYS_PATH)
        return ok(undefined, "Recipient removed.")
    }
)

export const resendSurveyInvitations = withAction(
    async (surveyId: number): Promise<ActionResult<DispatchResult>> => {
        await requirePermission("surveys:manage")
        const session = await requireSession()
        const id = requirePositiveInt(surveyId, "survey ID")
        const survey = await loadSurvey(id)
        if (survey.status !== "open") {
            return fail("Only an open survey can be re-invited.")
        }

        // The dedupe key makes this safe: anyone already invited is skipped,
        // so a resend only reaches recipients who never got the first one.
        const invitations = await sendSurveyInvitations(id)

        await logAuditEntry({
            userId: session.user.id,
            action: "survey_invitations_resend",
            entityType: "survey",
            entityId: id,
            summary: `Resent invitations for survey "${survey.title}": ${invitations.sent} sent, ${invitations.skipped} already invited.`
        })
        revalidatePath(MANAGE_SURVEYS_PATH)
        return ok(
            invitations,
            `${invitations.sent} invitation(s) sent; ${invitations.skipped} already invited.`
        )
    }
)

export const sendSurveyReminderNow = withAction(
    async (surveyId: number): Promise<ActionResult<DispatchResult>> => {
        await requirePermission("surveys:manage")
        const session = await requireSession()
        const id = requirePositiveInt(surveyId, "survey ID")
        const survey = await loadSurvey(id)
        if (survey.status !== "open") {
            return fail("Survey is not open.")
        }

        // force: true bypasses the interval/max-count gate but still claims
        // the round (optimistic compare-and-set on reminder_count), so a
        // concurrent cron run or a double click can't send two rounds at once.
        const result = await sendSurveyReminder(id, { force: true })
        if (!result.claimed) {
            return fail("Could not send a reminder right now. Try again.")
        }

        await logAuditEntry({
            userId: session.user.id,
            action: "survey_reminder",
            entityType: "survey",
            entityId: id,
            summary: `Sent a reminder for survey "${survey.title}": ${result.sent} sent, ${result.skipped} skipped.`
        })
        revalidatePath(MANAGE_SURVEYS_PATH)
        return ok(
            {
                sent: result.sent,
                skipped: result.skipped,
                failed: result.failed
            },
            `Reminder sent to ${result.sent} recipient(s)`
        )
    }
)

// ---------------------------------------------------------------------------

async function loadSurvey(surveyId: number) {
    const [survey] = await db
        .select()
        .from(surveys)
        .where(eq(surveys.id, surveyId))
        .limit(1)
    if (!survey) throw new ActionError("Survey not found.")
    return survey
}

async function assertSeasonExists(seasonId: number): Promise<void> {
    const [season] = await db
        .select({ id: seasons.id })
        .from(seasons)
        .where(eq(seasons.id, seasonId))
        .limit(1)
    if (!season) throw new ActionError("Season not found.")
}

function cleanSurveyTitle(value: unknown): string {
    const title = requireNonEmptyString(value, "Survey title")
    if (title.length > SURVEY_LIMITS.maxTitleLength) {
        throw new ActionError(
            `Survey titles are at most ${SURVEY_LIMITS.maxTitleLength} characters.`
        )
    }
    return title
}

function optionalSeasonId(value: unknown): number | null {
    if (value === null || value === undefined) return null
    return requirePositiveInt(value, "season ID")
}

/**
 * The client sends UTC instants as ISO strings; anything that does not parse
 * is a bug or a hand-written post, never a date to store.
 */
function parseInstant(value: unknown, label: string): Date | null {
    if (value === null || value === undefined || value === "") return null
    if (typeof value !== "string") throw new ActionError(`Invalid ${label}.`)
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
        throw new ActionError(`Invalid ${label}.`)
    }
    return parsed
}

function boundedInt(
    value: unknown,
    label: string,
    min: number,
    max: number
): number {
    const n = typeof value === "number" ? value : Number(value)
    if (!Number.isInteger(n) || n < min || n > max) {
        throw new ActionError(
            `${label} must be a whole number between ${min} and ${max}.`
        )
    }
    return n
}

/**
 * Rebuilds the audience definition from whatever crossed the RSC boundary:
 * unknown group types are refused outright, and a scope id that is not a
 * positive integer is dropped so validateAudience reports the missing scope
 * in the words the editor shows.
 */
function sanitizeAudience(input: unknown): SurveyAudienceDefinition {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
        throw new ActionError("Invalid audience.")
    }
    const raw = input as Partial<SurveyAudienceDefinition>
    return {
        groups: Array.isArray(raw.groups) ? raw.groups.map(sanitizeGroup) : [],
        addUserIds: sanitizeUserIds(raw.addUserIds),
        removeUserIds: sanitizeUserIds(raw.removeUserIds)
    }
}

function sanitizeGroup(input: unknown): SurveyAudienceGroup {
    const raw = (input ?? {}) as Partial<SurveyAudienceGroup>
    const spec = SURVEY_GROUP_TYPES.find((group) => group.type === raw.type)
    if (!spec) {
        throw new ActionError(
            `Unknown audience group "${String(raw.type ?? "")}".`
        )
    }

    const group: SurveyAudienceGroup = { type: spec.type }
    if (spec.needs === "division" && isPositiveInt(raw.divisionId)) {
        group.divisionId = raw.divisionId
    }
    if (spec.needs === "team" && isPositiveInt(raw.teamId)) {
        group.teamId = raw.teamId
    }
    if (spec.needs === "event" && isPositiveInt(raw.eventId)) {
        group.eventId = raw.eventId
    }
    return group
}

function sanitizeUserIds(input: unknown): string[] {
    if (!Array.isArray(input)) return []
    const ids = input
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter((id) => id !== "")
    return [...new Set(ids)]
}

function isPositiveInt(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0
}

// ---------------------------------------------------------------------------
// Results and trends
// ---------------------------------------------------------------------------

export interface SurveyResultsSurveySummary {
    id: number
    title: string
    status: SurveyStatus
    isAnonymous: boolean
    closesAt: Date | null
    templateId: number
}

export const getSurveyResults = withAction(
    async (
        surveyId: number,
        filter: SegmentFilter
    ): Promise<
        ActionResult<{
            report: SurveyReport
            questions: SurveyQuestionDef[]
            survey: SurveyResultsSurveySummary
        }>
    > => {
        await requirePermission("surveys:view_results")
        await requireSession()
        const id = requirePositiveInt(surveyId, "survey ID")
        const survey = await loadSurvey(id)

        const templateQuestions = await getTemplateQuestions(survey.template_id)
        const questions = questionsForSurvey(
            { questionIds: survey.question_ids },
            templateQuestions
        )
        const cleanFilter = sanitizeSegmentFilter(filter)
        const { invited, responses } = await loadSurveyResponses(id)
        const report = aggregateSurvey({
            questions,
            responses,
            invited,
            filter: cleanFilter,
            anonymous: survey.is_anonymous
        })

        return ok({
            report,
            questions,
            survey: {
                id: survey.id,
                title: survey.title,
                status: survey.status,
                isAnonymous: survey.is_anonymous,
                closesAt: survey.closes_at,
                templateId: survey.template_id
            }
        })
    }
)

export const getSurveyRawResponses = withAction(
    async (
        surveyId: number
    ): Promise<
        ActionResult<{
            questions: SurveyQuestionDef[]
            responses: (ReportResponse & { name?: string; email?: string })[]
            anonymous: boolean
        }>
    > => {
        await requirePermission("surveys:view_results")
        await requireSession()
        const id = requirePositiveInt(surveyId, "survey ID")
        const survey = await loadSurvey(id)

        const templateQuestions = await getTemplateQuestions(survey.template_id)
        const questions = questionsForSurvey(
            { questionIds: survey.question_ids },
            templateQuestions
        )
        // Only a caller who can also manage surveys sees names on an
        // identified survey; an anonymous survey never joins identity.
        const includeIdentity =
            !survey.is_anonymous &&
            (await hasPermissionBySession("surveys:manage"))
        const responses = await loadRawResponses(id, includeIdentity)

        return ok({ questions, responses, anonymous: survey.is_anonymous })
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

/**
 * Rebuilds a segment filter from whatever crossed the RSC boundary: an
 * unknown role tag, a non-positive division id or an unrecognised gender is
 * dropped rather than rejected outright, so a stale filter degrades to "no
 * filter on that field" instead of failing the whole request.
 */
function sanitizeSegmentFilter(input: unknown): SegmentFilter {
    if (typeof input !== "object" || input === null) return {}
    const raw = input as Partial<SegmentFilter>
    const filter: SegmentFilter = {}
    if (isSurveyRoleTag(raw.roleTag)) filter.roleTag = raw.roleTag
    if (isPositiveInt(raw.divisionId)) filter.divisionId = raw.divisionId
    if (isSurveyGender(raw.gender)) filter.gender = raw.gender
    return filter
}

function isSurveyGender(value: unknown): value is SurveyGender {
    return value === "male" || value === "non_male"
}
