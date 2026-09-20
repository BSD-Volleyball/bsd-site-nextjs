/**
 * surveys.ts — the reads behind the survey instance list and editor.
 *
 * A survey instance is mostly a row plus two derived things the admin screens
 * always want: how far its recipients have got, and which questions it is
 * actually asking. The second one is not the template's current question list —
 * a published survey froze its ids at publish — so the editor goes through
 * questionsForSurvey rather than reading the template directly, and shows the
 * same set the respondent sees.
 *
 * Counts deliberately ignore removed recipients: someone taken off the invite
 * list is no longer part of the denominator, so "12 of 40" stays honest after
 * an audience correction.
 *
 * Framework-independent: db + drizzle + lib only.
 */

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/database/db"
import {
    divisions,
    seasons,
    surveyRecipients,
    surveys,
    surveyTemplates,
    teams,
    users
} from "@/database/schema"
import { formatSeasonLabel } from "@/lib/season-utils"
import { getSeasonConfig } from "@/lib/site-config"
import { formatPlayerName } from "@/lib/utils"
import { questionsForSurvey } from "./questions-for-survey"
import { getTemplateQuestions } from "./templates"
import {
    type SurveyAudienceGroup,
    type SurveyQuestionDef,
    type SurveyRoleTag,
    type SurveyStatus,
    describeAudienceGroup
} from "./types"

export interface SurveyListRow {
    id: number
    title: string
    templateName: string
    templateId: number
    seasonLabel: string | null
    status: SurveyStatus
    isAnonymous: boolean
    recipients: number
    submitted: number
    closesAt: Date | null
    publishedAt: Date | null
    reminderCount: number
    reminderMaxCount: number
}

export interface SurveyEditorRecipient {
    id: number
    userId: string
    name: string
    email: string
    roleTags: SurveyRoleTag[]
    submittedAt: Date | null
    removedAt: Date | null
}

export interface SurveyEditorData {
    survey: typeof surveys.$inferSelect
    templateName: string
    questions: SurveyQuestionDef[]
    recipients: SurveyEditorRecipient[]
}

export interface SurveyEditorOptions {
    seasons: { id: number; label: string }[]
    divisions: { id: number; name: string }[]
    teams: { id: number; name: string; divisionId: number | null }[]
}

/** The settings form's payload. Timestamps cross as ISO strings (UTC instants). */
export interface SurveySettingsInput {
    title: string
    intro: string | null
    seasonId: number | null
    isAnonymous: boolean
    opensAt: string | null
    closesAt: string | null
    reminderIntervalDays: number
    reminderMaxCount: number
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/** Every survey, newest first, with the progress counts the list page shows. */
export async function listSurveys(): Promise<SurveyListRow[]> {
    const rows = await db
        .select({
            survey: surveys,
            templateName: surveyTemplates.name,
            seasonName: seasons.season,
            seasonYear: seasons.year
        })
        .from(surveys)
        .innerJoin(surveyTemplates, eq(surveys.template_id, surveyTemplates.id))
        .leftJoin(seasons, eq(surveys.season_id, seasons.id))
        .orderBy(desc(surveys.id))
    if (rows.length === 0) return []

    const counts = await countRecipients(rows.map((row) => row.survey.id))

    return rows.map((row) => {
        const count = counts.get(row.survey.id)
        return {
            id: row.survey.id,
            title: row.survey.title,
            templateName: row.templateName,
            templateId: row.survey.template_id,
            seasonLabel: seasonLabel(row.seasonName, row.seasonYear),
            status: row.survey.status,
            isAnonymous: row.survey.is_anonymous,
            recipients: count?.recipients ?? 0,
            submitted: count?.submitted ?? 0,
            closesAt: row.survey.closes_at,
            publishedAt: row.survey.published_at,
            reminderCount: row.survey.reminder_count,
            reminderMaxCount: row.survey.reminder_max_count
        }
    })
}

async function countRecipients(
    surveyIds: number[]
): Promise<Map<number, { recipients: number; submitted: number }>> {
    const rows = await db
        .select({
            surveyId: surveyRecipients.survey_id,
            submittedAt: surveyRecipients.submitted_at
        })
        .from(surveyRecipients)
        .where(
            and(
                inArray(surveyRecipients.survey_id, surveyIds),
                isNull(surveyRecipients.removed_at)
            )
        )

    const counts = new Map<number, { recipients: number; submitted: number }>()
    for (const row of rows) {
        const entry = counts.get(row.surveyId) ?? {
            recipients: 0,
            submitted: 0
        }
        entry.recipients += 1
        if (row.submittedAt !== null) entry.submitted += 1
        counts.set(row.surveyId, entry)
    }
    return counts
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

/** Everything the survey editor renders, or null when the survey is gone. */
export async function getSurveyEditorData(
    surveyId: number
): Promise<SurveyEditorData | null> {
    const [row] = await db
        .select({ survey: surveys, templateName: surveyTemplates.name })
        .from(surveys)
        .innerJoin(surveyTemplates, eq(surveys.template_id, surveyTemplates.id))
        .where(eq(surveys.id, surveyId))
        .limit(1)
    if (!row) return null

    const templateQuestions = await getTemplateQuestions(row.survey.template_id)
    const recipients = await db
        .select({
            id: surveyRecipients.id,
            userId: surveyRecipients.user_id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            email: users.email,
            roleTags: surveyRecipients.role_tags,
            submittedAt: surveyRecipients.submitted_at,
            removedAt: surveyRecipients.removed_at
        })
        .from(surveyRecipients)
        .innerJoin(users, eq(users.id, surveyRecipients.user_id))
        .where(eq(surveyRecipients.survey_id, surveyId))
        .orderBy(asc(users.last_name), asc(users.first_name))

    return {
        survey: row.survey,
        templateName: row.templateName,
        questions: questionsForSurvey(
            { questionIds: row.survey.question_ids },
            templateQuestions
        ),
        recipients: recipients.map((recipient) => ({
            id: recipient.id,
            userId: recipient.userId,
            name: formatPlayerName(
                recipient.firstName,
                recipient.lastName,
                recipient.preferredName
            ),
            email: recipient.email,
            roleTags: recipient.roleTags,
            submittedAt: recipient.submittedAt,
            removedAt: recipient.removedAt
        }))
    }
}

/**
 * The pickers the editor needs: every season for the season field, and the
 * current season's divisions and teams for the audience builder. Divisions
 * come from this season's teams rather than the division table, so a division
 * that is not running this season never appears as a targetable group.
 */
/**
 * Team rows for the current season, joined to their division. Shared by
 * `getEditorOptions` (which also needs team names) and
 * `listCurrentSeasonDivisions` (which only needs the distinct divisions).
 */
async function loadCurrentSeasonTeams(): Promise<
    {
        id: number
        name: string
        divisionId: number
        divisionName: string
        divisionLevel: number
    }[]
> {
    const config = await getSeasonConfig()
    if (!config.seasonId) return []
    return db
        .select({
            id: teams.id,
            name: teams.name,
            divisionId: teams.division,
            divisionName: divisions.name,
            divisionLevel: divisions.level
        })
        .from(teams)
        .innerJoin(divisions, eq(teams.division, divisions.id))
        .where(eq(teams.season, config.seasonId))
        .orderBy(asc(divisions.level), asc(teams.name))
}

/** The distinct divisions fielding a team in the current season, in level order. */
export async function listCurrentSeasonDivisions(): Promise<
    { id: number; name: string }[]
> {
    const teamRows = await loadCurrentSeasonTeams()
    const divisionOptions = new Map<number, { id: number; name: string }>()
    for (const team of teamRows) {
        if (!divisionOptions.has(team.divisionId)) {
            divisionOptions.set(team.divisionId, {
                id: team.divisionId,
                name: team.divisionName
            })
        }
    }
    return [...divisionOptions.values()]
}

export async function getEditorOptions(): Promise<SurveyEditorOptions> {
    const seasonRows = await db
        .select({
            id: seasons.id,
            season: seasons.season,
            year: seasons.year
        })
        .from(seasons)
        .orderBy(desc(seasons.id))

    const teamRows = await loadCurrentSeasonTeams()
    const divisionOptions = new Map<number, { id: number; name: string }>()
    for (const team of teamRows) {
        if (!divisionOptions.has(team.divisionId)) {
            divisionOptions.set(team.divisionId, {
                id: team.divisionId,
                name: team.divisionName
            })
        }
    }

    return {
        seasons: seasonRows.map((season) => ({
            id: season.id,
            label: formatSeasonLabel({
                seasonName: season.season,
                seasonYear: season.year
            })
        })),
        divisions: [...divisionOptions.values()],
        teams: teamRows.map((team) => ({
            id: team.id,
            name: team.name,
            divisionId: team.divisionId
        }))
    }
}

/**
 * Display labels for an audience definition's groups, in the same order.
 * The names behind a division or team id live in the database, so the label a
 * preview shows is built here rather than in the action.
 */
export async function labelAudienceGroups(
    groups: SurveyAudienceGroup[],
    seasonId: number | null
): Promise<string[]> {
    if (groups.length === 0) return []

    const label =
        seasonId === null ? undefined : await loadSeasonLabel(seasonId)
    const divisionNames = await loadNames(
        divisions,
        groups.map((group) => group.divisionId)
    )
    const teamNames = await loadNames(
        teams,
        groups.map((group) => group.teamId)
    )

    return groups.map((group) =>
        describeAudienceGroup(group, {
            seasonLabel: label,
            divisionName:
                group.divisionId === undefined
                    ? undefined
                    : divisionNames.get(group.divisionId),
            teamName:
                group.teamId === undefined
                    ? undefined
                    : teamNames.get(group.teamId)
        })
    )
}

// ---------------------------------------------------------------------------

async function loadNames(
    table: typeof divisions | typeof teams,
    ids: (number | undefined)[]
): Promise<Map<number, string>> {
    const wanted = [
        ...new Set(ids.filter((id): id is number => typeof id === "number"))
    ]
    if (wanted.length === 0) return new Map()

    const rows = await db
        .select({ id: table.id, name: table.name })
        .from(table)
        .where(inArray(table.id, wanted))
    return new Map(rows.map((row) => [row.id, row.name]))
}

async function loadSeasonLabel(seasonId: number): Promise<string | undefined> {
    const [row] = await db
        .select({ season: seasons.season, year: seasons.year })
        .from(seasons)
        .where(eq(seasons.id, seasonId))
        .limit(1)
    return row ? (seasonLabel(row.season, row.year) ?? undefined) : undefined
}

function seasonLabel(name: string | null, year: number | null): string | null {
    if (name === null || year === null) return null
    const label = formatSeasonLabel({ seasonName: name, seasonYear: year })
    return label === "" ? null : label
}
