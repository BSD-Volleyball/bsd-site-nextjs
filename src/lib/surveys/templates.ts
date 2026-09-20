/**
 * templates.ts — reads and writes for the survey template bank.
 *
 * The template editor posts a whole question list at once, so the save is a
 * diff: rows that came back keep their ids (and their answers), rows that are
 * new are inserted, and rows that were dropped are either archived (answers
 * exist and must keep resolving to a question) or deleted outright.
 *
 * Every rule the editor applies client-side is re-applied here as the
 * authority: prompt limits, the type registry's own config check, the lock
 * rules in template-rules.ts, and the branching graph in visibility.ts. The
 * graph is checked inside the transaction against the rows as they will
 * actually be, so a new question may be pointed at by a later one in the same
 * save; a failure throws ActionError and rolls the whole save back.
 *
 * Framework-independent: db + drizzle + lib only.
 */

import { type DbExecutor, db } from "@/database/db"
import {
    seasons,
    surveyAnswers,
    surveyQuestions,
    surveys,
    surveyTemplates
} from "@/database/schema"
import { ActionError } from "@/lib/action-result"
import { formatSeasonLabel } from "@/lib/season-utils"
import { QUESTION_TYPE_DEFS } from "./question-types"
import {
    type TemplateQuestionInput,
    validateQuestionUpdate
} from "./template-rules"
import {
    type SurveyQuestionDef,
    type SurveyStatus,
    SURVEY_LIMITS,
    isSurveyQuestionType,
    isSurveyRoleTag
} from "./types"
import { validateVisibilityGraph } from "./visibility"
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm"

export interface TemplateSummary {
    id: number
    name: string
    description: string | null
    isArchived: boolean
    /** Active (unarchived) questions only. */
    questionCount: number
    /** Every instance ever run from the template. */
    surveyCount: number
    openSurveyCount: number
    updatedAt: Date
}

export interface TemplateEditorData {
    template: {
        id: number
        name: string
        description: string | null
        isArchived: boolean
    }
    /** Active questions in sort order, then the archived ones (restorable). */
    questions: (SurveyQuestionDef & { hasAnswers: boolean })[]
    surveys: {
        id: number
        title: string
        status: SurveyStatus
        seasonLabel: string | null
    }[]
}

type QuestionRow = typeof surveyQuestions.$inferSelect

/** The pure projection of a survey_questions row every survey module accepts. */
export function rowToQuestionDef(row: QuestionRow): SurveyQuestionDef {
    return {
        id: row.id,
        sortOrder: row.sort_order,
        type: row.type,
        prompt: row.prompt,
        helpText: row.help_text,
        required: row.required,
        config: row.config,
        visibility: row.visibility,
        archivedAt: row.archived_at
    }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every template, newest first, with the counts the list page shows. */
export async function listTemplates(): Promise<TemplateSummary[]> {
    const templates = await db
        .select()
        .from(surveyTemplates)
        .orderBy(desc(surveyTemplates.updated_at), desc(surveyTemplates.id))
    if (templates.length === 0) return []

    const templateIds = templates.map((t) => t.id)

    const questionRows = await db
        .select({ templateId: surveyQuestions.template_id })
        .from(surveyQuestions)
        .where(
            and(
                inArray(surveyQuestions.template_id, templateIds),
                isNull(surveyQuestions.archived_at)
            )
        )
    const surveyRows = await db
        .select({ templateId: surveys.template_id, status: surveys.status })
        .from(surveys)
        .where(inArray(surveys.template_id, templateIds))

    const questionCounts = countBy(questionRows.map((r) => r.templateId))
    const surveyCounts = countBy(surveyRows.map((r) => r.templateId))
    const openCounts = countBy(
        surveyRows.filter((r) => r.status === "open").map((r) => r.templateId)
    )

    return templates.map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        isArchived: template.is_archived,
        questionCount: questionCounts.get(template.id) ?? 0,
        surveyCount: surveyCounts.get(template.id) ?? 0,
        openSurveyCount: openCounts.get(template.id) ?? 0,
        updatedAt: template.updated_at
    }))
}

function countBy(ids: number[]): Map<number, number> {
    const counts = new Map<number, number>()
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
    return counts
}

/** Everything the template editor renders, or null when the template is gone. */
export async function getTemplateEditorData(
    templateId: number
): Promise<TemplateEditorData | null> {
    const [template] = await db
        .select()
        .from(surveyTemplates)
        .where(eq(surveyTemplates.id, templateId))
        .limit(1)
    if (!template) return null

    const rows = await selectQuestionRows(templateId)
    const answered = await questionIdsWithAnswers(rows.map((row) => row.id))

    const instances = await db
        .select({
            id: surveys.id,
            title: surveys.title,
            status: surveys.status,
            seasonName: seasons.season,
            seasonYear: seasons.year
        })
        .from(surveys)
        .leftJoin(seasons, eq(surveys.season_id, seasons.id))
        .where(eq(surveys.template_id, templateId))
        .orderBy(desc(surveys.id))

    return {
        template: {
            id: template.id,
            name: template.name,
            description: template.description,
            isArchived: template.is_archived
        },
        questions: rows.map((row) => ({
            ...rowToQuestionDef(row),
            hasAnswers: answered.has(row.id)
        })),
        surveys: instances.map((instance) => {
            const label =
                instance.seasonName === null || instance.seasonYear === null
                    ? ""
                    : formatSeasonLabel({
                          seasonName: instance.seasonName,
                          seasonYear: instance.seasonYear
                      })
            return {
                id: instance.id,
                title: instance.title,
                status: instance.status,
                seasonLabel: label === "" ? null : label
            }
        })
    }
}

/** Every question on the template, active ones first, each in sort order. */
export async function getTemplateQuestions(
    templateId: number,
    executor: DbExecutor = db
): Promise<SurveyQuestionDef[]> {
    const rows = await selectQuestionRows(templateId, executor)
    return rows.map(rowToQuestionDef)
}

/**
 * Active questions in sort order, then archived ones — the editor lists the
 * live template first and offers the archived tail for restore.
 */
async function selectQuestionRows(
    templateId: number,
    executor: DbExecutor = db
): Promise<QuestionRow[]> {
    const rows = await executor
        .select()
        .from(surveyQuestions)
        .where(eq(surveyQuestions.template_id, templateId))
        .orderBy(asc(surveyQuestions.sort_order), asc(surveyQuestions.id))

    return [
        ...rows.filter((row) => row.archived_at === null),
        ...rows.filter((row) => row.archived_at !== null)
    ]
}

/** Which of the given questions already have at least one answer row. */
export async function questionIdsWithAnswers(
    questionIds: number[],
    executor: DbExecutor = db
): Promise<Set<number>> {
    if (questionIds.length === 0) return new Set()
    const rows = await executor
        .selectDistinct({ questionId: surveyAnswers.question_id })
        .from(surveyAnswers)
        .where(inArray(surveyAnswers.question_id, questionIds))
    return new Set(rows.map((row) => row.questionId))
}

// ---------------------------------------------------------------------------
// The diff save
// ---------------------------------------------------------------------------

/** A validated input, ready to write. */
interface CleanedInput extends TemplateQuestionInput {
    sortOrder: number
}

/**
 * Replaces the template's active question list with `inputs`, in array order.
 * Throws ActionError with a message the editor can show when any rule fails;
 * nothing is written unless every rule passes.
 *
 * Everything that reads the database happens inside the transaction, behind a
 * `FOR UPDATE` lock on the template row. The delete-vs-archive decision turns
 * on whether a question has answers, and `survey_answers.question_id` cascades
 * on delete — reading that set before the transaction would let an answer
 * arriving in the gap be deleted silently. The lock also serialises two admins
 * saving the same template, so neither gets a success return over the other's
 * lost edit.
 */
export async function saveTemplateQuestions(
    templateId: number,
    inputs: TemplateQuestionInput[]
): Promise<void> {
    if (!Array.isArray(inputs)) {
        throw new ActionError("Invalid question list.")
    }
    if (inputs.length > SURVEY_LIMITS.maxQuestions) {
        throw new ActionError(
            `A template can hold at most ${SURVEY_LIMITS.maxQuestions} questions.`
        )
    }

    // Input-shape validation needs no database, so it stays outside the lock.
    const cleaned = inputs.map(cleanInput)
    assertNoDuplicateIds(cleaned)

    await db.transaction(async (tx) => {
        await lockTemplate(templateId, tx)

        const existingRows = await selectQuestionRows(templateId, tx)
        const activeById = new Map(
            existingRows
                .filter((row) => row.archived_at === null)
                .map((row) => [row.id, row])
        )
        for (const input of cleaned) {
            if (input.id !== null && !activeById.has(input.id)) {
                throw new ActionError(
                    "This template's questions changed while you were editing. Reload and try again."
                )
            }
        }

        const answered = await questionIdsWithAnswers(
            [...activeById.keys()],
            tx
        )

        for (const input of cleaned) {
            if (input.id === null) continue
            const existing = activeById.get(input.id)
            if (!existing) continue
            const error = validateQuestionUpdate(
                rowToQuestionDef(existing),
                input,
                answered.has(input.id)
            )
            if (error) {
                throw new ActionError(`"${input.prompt}" is locked: ${error}`)
            }
        }

        const keptIds = new Set(
            cleaned.map((input) => input.id).filter((id) => id !== null)
        )
        const droppedIds = [...activeById.keys()].filter(
            (id) => !keptIds.has(id)
        )

        for (const input of cleaned) {
            const values = {
                sort_order: input.sortOrder,
                type: input.type,
                prompt: input.prompt,
                help_text: input.helpText,
                required: input.required,
                config: input.config,
                visibility: input.visibility
            }
            if (input.id === null) {
                await tx
                    .insert(surveyQuestions)
                    .values({ template_id: templateId, ...values })
            } else {
                await tx
                    .update(surveyQuestions)
                    .set(values)
                    .where(eq(surveyQuestions.id, input.id))
            }
        }

        const toArchive = droppedIds.filter((id) => answered.has(id))
        const toDelete = droppedIds.filter((id) => !answered.has(id))
        if (toArchive.length > 0) {
            await tx
                .update(surveyQuestions)
                .set({ archived_at: new Date() })
                .where(inArray(surveyQuestions.id, toArchive))
        }
        if (toDelete.length > 0) {
            await tx
                .delete(surveyQuestions)
                .where(inArray(surveyQuestions.id, toDelete))
        }

        await tx
            .update(surveyTemplates)
            .set({ updated_at: new Date() })
            .where(eq(surveyTemplates.id, templateId))

        // New rows only have ids now, so the graph is checked against the
        // saved shape. A failure throws and the whole save rolls back.
        await assertVisibilityGraphSound(templateId, tx)
    })
}

/**
 * Serialises writers against one template. Every read the save decides on is
 * taken after this, so nothing it saw can change underneath it. Callers hold
 * it for the rest of their transaction.
 */
export async function lockTemplate(
    templateId: number,
    executor: DbExecutor
): Promise<void> {
    const [row] = await executor
        .select({ id: surveyTemplates.id })
        .from(surveyTemplates)
        .where(eq(surveyTemplates.id, templateId))
        .limit(1)
        .for("update")
    if (!row) throw new ActionError("Survey template not found.")
}

/**
 * The same row twice in one payload would make the diff ambiguous: one copy
 * would win the update and the other would silently vanish.
 */
function assertNoDuplicateIds(cleaned: CleanedInput[]): void {
    const seen = new Set<number>()
    for (const input of cleaned) {
        if (input.id === null) continue
        if (seen.has(input.id)) {
            throw new ActionError("Duplicate question in payload.")
        }
        seen.add(input.id)
    }
}

/** Validates one posted question, in the order the editor surfaces problems. */
function cleanInput(input: TemplateQuestionInput, index: number): CleanedInput {
    const prompt = typeof input?.prompt === "string" ? input.prompt.trim() : ""
    if (prompt === "") {
        throw new ActionError(`Question ${index + 1} needs a prompt.`)
    }
    if (prompt.length > SURVEY_LIMITS.maxPromptLength) {
        throw new ActionError(
            `"${prompt.slice(0, 40)}..." is longer than ${SURVEY_LIMITS.maxPromptLength} characters.`
        )
    }

    const helpText =
        typeof input.helpText === "string" && input.helpText.trim() !== ""
            ? input.helpText.trim()
            : null
    if (helpText !== null && helpText.length > SURVEY_LIMITS.maxHelpLength) {
        throw new ActionError(
            `"${prompt}": help text is longer than ${SURVEY_LIMITS.maxHelpLength} characters.`
        )
    }

    if (!isSurveyQuestionType(input.type)) {
        throw new ActionError(`"${prompt}" has an unknown question type.`)
    }
    if (input.config?.type !== input.type) {
        throw new ActionError(
            `"${prompt}": question config does not match its type.`
        )
    }
    const configError = QUESTION_TYPE_DEFS[input.type].validateConfig(
        input.config
    )
    if (configError) {
        throw new ActionError(`"${prompt}": ${configError}`)
    }

    const conditions = input.visibility?.conditions
    const roleTags = input.visibility?.roleTags
    if (!Array.isArray(conditions) || !Array.isArray(roleTags)) {
        throw new ActionError(`"${prompt}" has invalid visibility rules.`)
    }
    if (!roleTags.every(isSurveyRoleTag)) {
        throw new ActionError(`"${prompt}" refers to an unknown role tag.`)
    }

    const id = input.id ?? null
    if (id !== null && (!Number.isInteger(id) || id <= 0)) {
        throw new ActionError(`"${prompt}" has an invalid question ID.`)
    }

    return {
        id,
        type: input.type,
        prompt,
        helpText,
        required: input.required === true,
        config: input.config,
        visibility: { conditions, roleTags },
        sortOrder: index
    }
}

/**
 * Throws when the template's active questions have grown past the editor's
 * ceiling. Restoring an archived question is the one path that can cross it
 * without going through `saveTemplateQuestions`.
 */
export async function assertActiveQuestionLimit(
    templateId: number,
    executor: DbExecutor = db
): Promise<void> {
    const rows = await selectQuestionRows(templateId, executor)
    const active = rows.filter((row) => row.archived_at === null).length
    if (active > SURVEY_LIMITS.maxQuestions) {
        throw new ActionError(
            `A template can hold at most ${SURVEY_LIMITS.maxQuestions} questions.`
        )
    }
}

/**
 * Re-reads the template's active questions and throws the first branching
 * problem. Archived questions are left out: their own rules go away with
 * them, and an active question that still points at one reads as a dangling
 * reference, which is exactly the error to raise.
 */
export async function assertVisibilityGraphSound(
    templateId: number,
    executor: DbExecutor = db
): Promise<void> {
    const rows = await selectQuestionRows(templateId, executor)
    const active = rows
        .filter((row) => row.archived_at === null)
        .map(rowToQuestionDef)
    const errors = validateVisibilityGraph(active)
    if (errors.length > 0) throw new ActionError(errors[0])
}
