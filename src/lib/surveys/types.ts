/**
 * types.ts — shared survey vocabulary.
 *
 * The contract every other survey module builds on: question types and their
 * configs, visibility rules, audience definitions, and the limits the editor
 * and the runtime both enforce.
 *
 * Client components import this for labels and guards, so it must stay free of
 * server-only imports (the RecipientGroupType import below is type-only and is
 * erased at compile time).
 */

import type { RecipientGroupType } from "@/lib/email-recipients"

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export const SURVEY_QUESTION_TYPES = [
    "section",
    "yes_no",
    "rating",
    "likert",
    "single_choice",
    "multi_choice",
    "text",
    "ranking"
] as const
export type SurveyQuestionType = (typeof SURVEY_QUESTION_TYPES)[number]

export interface SurveyOption {
    key: string
    label: string
}

export type RatingPreset = "1-5" | "1-10" | "nps"

export type SurveyQuestionConfig =
    | { type: "section" }
    | { type: "yes_no" }
    | {
          type: "rating"
          min: number
          max: number
          minLabel?: string
          maxLabel?: string
          preset?: RatingPreset
      }
    | { type: "likert"; options: SurveyOption[] }
    | { type: "single_choice"; options: SurveyOption[] }
    | {
          type: "multi_choice"
          options: SurveyOption[]
          minSelections?: number
          maxSelections?: number
      }
    | { type: "text"; variant: "short" | "long"; maxLength?: number }
    | { type: "ranking"; options: SurveyOption[] }

// ---------------------------------------------------------------------------
// Role tags
// ---------------------------------------------------------------------------

export const SURVEY_ROLE_TAGS = [
    "signed_up",
    "rostered",
    "captain",
    "coach",
    "commissioner",
    "referee",
    "ref_coordinator",
    "waitlisted",
    "dropped",
    "first_season",
    "returning",
    "admin",
    "leadership_group",
    "tryout_volunteer"
] as const
export type SurveyRoleTag = (typeof SURVEY_ROLE_TAGS)[number]

export const SURVEY_ROLE_TAG_LABELS: Record<
    SurveyRoleTag,
    { label: string; description: string }
> = {
    signed_up: {
        label: "Signed up",
        description: "Has a signup for the survey's season."
    },
    rostered: {
        label: "Rostered",
        description: "Was drafted onto a team for the survey's season."
    },
    captain: {
        label: "Captain",
        description: "Captains a team in the survey's season."
    },
    coach: {
        label: "Coach",
        description: "Coaches a team in the survey's season."
    },
    commissioner: {
        label: "Commissioner",
        description: "Holds the commissioner role for a division or the league."
    },
    referee: {
        label: "Referee",
        description: "Is on the referee list for the survey's season."
    },
    ref_coordinator: {
        label: "Ref coordinator",
        description: "Coordinates the referees for the league."
    },
    waitlisted: {
        label: "Waitlisted",
        description: "Signed up but is still waiting for a spot."
    },
    dropped: {
        label: "Dropped",
        description: "Dropped out of the survey's season after signing up."
    },
    first_season: {
        label: "First season",
        description: "The survey's season is this player's first one."
    },
    returning: {
        label: "Returning",
        description: "Played at least one season before the survey's season."
    },
    admin: {
        label: "Admin",
        description: "Holds an admin or director role."
    },
    leadership_group: {
        label: "Leadership group",
        description: "Belongs to the league's leadership group."
    },
    tryout_volunteer: {
        label: "Tryout volunteer",
        description: "Is assigned to a tryout job in the survey's season."
    }
}

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

/** yes_no values are "yes" | "no"; choice/likert values are option keys; ranking uses the first-place key. */
export type SurveyAnswerCondition =
    | { questionId: number; operator: "in" | "not_in"; values: string[] }
    | { questionId: number; operator: "eq" | "gte" | "lte"; value: number }

export interface SurveyVisibility {
    conditions: SurveyAnswerCondition[]
    roleTags: SurveyRoleTag[]
}

export const EMPTY_VISIBILITY: SurveyVisibility = {
    conditions: [],
    roleTags: []
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export type AnswerValue = boolean | number | string | string[]

/** Answers keyed by question id. Plain object so it crosses the RSC boundary. */
export type AnswerMap = Record<number, AnswerValue>

/** The question shape every pure module accepts (a projection of a survey_questions row). */
export interface SurveyQuestionDef {
    id: number
    sortOrder: number
    type: SurveyQuestionType
    prompt: string
    helpText: string | null
    required: boolean
    config: SurveyQuestionConfig
    visibility: SurveyVisibility
    archivedAt: Date | null
}

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

export interface SurveyAudienceGroup {
    type: RecipientGroupType
    divisionId?: number
    teamId?: number
    eventId?: number
}

export interface SurveyAudienceDefinition {
    groups: SurveyAudienceGroup[]
    addUserIds: string[]
    removeUserIds: string[]
}

export const EMPTY_AUDIENCE: SurveyAudienceDefinition = {
    groups: [],
    addUserIds: [],
    removeUserIds: []
}

// ---------------------------------------------------------------------------
// Survey state
// ---------------------------------------------------------------------------

export type SurveyStatus = "draft" | "open" | "closed"
export type SurveyResponseStatus = "draft" | "submitted"
export type SurveyGender = "male" | "non_male"

export interface RespondentSegments {
    roleTags: SurveyRoleTag[]
    divisionId: number | null
    gender: SurveyGender | null
}

// ---------------------------------------------------------------------------
// Presets and limits
// ---------------------------------------------------------------------------

export const RATING_PRESETS: Record<
    RatingPreset,
    {
        min: number
        max: number
        minLabel: string
        maxLabel: string
        label: string
    }
> = {
    "1-5": {
        min: 1,
        max: 5,
        minLabel: "Poor",
        maxLabel: "Excellent",
        label: "1 to 5"
    },
    "1-10": {
        min: 1,
        max: 10,
        minLabel: "Poor",
        maxLabel: "Excellent",
        label: "1 to 10"
    },
    nps: {
        min: 0,
        max: 10,
        minLabel: "Not at all likely",
        maxLabel: "Extremely likely",
        label: "NPS (0 to 10)"
    }
}

export const LIKERT_OPTIONS: SurveyOption[] = [
    { key: "strongly_disagree", label: "Strongly disagree" },
    { key: "disagree", label: "Disagree" },
    { key: "neutral", label: "Neutral" },
    { key: "agree", label: "Agree" },
    { key: "strongly_agree", label: "Strongly agree" }
]

export const SURVEY_LIMITS = {
    maxQuestions: 60,
    maxOptions: 20,
    maxPromptLength: 500,
    maxHelpLength: 1000,
    maxTextAnswerLength: 5000,
    maxTitleLength: 200
} as const

// ---------------------------------------------------------------------------
// Guards and audience helpers
// ---------------------------------------------------------------------------

export function isSurveyQuestionType(v: unknown): v is SurveyQuestionType {
    return (
        typeof v === "string" &&
        (SURVEY_QUESTION_TYPES as readonly string[]).includes(v)
    )
}

export function isSurveyRoleTag(v: unknown): v is SurveyRoleTag {
    return (
        typeof v === "string" &&
        (SURVEY_ROLE_TAGS as readonly string[]).includes(v)
    )
}

/**
 * The audience groups a survey can target, in the order the editor lists them.
 * "self" is never a survey audience, and the event-scoped tryout volunteer
 * group is left out: surveys target a season, not one tryout night.
 */
export const SURVEY_GROUP_TYPES: {
    type: RecipientGroupType
    label: string
    needs: "none" | "season" | "division" | "team" | "event"
}[] = [
    { type: "all_users", label: "Everyone", needs: "none" },
    { type: "season_signups", label: "Season signups", needs: "season" },
    { type: "season_division", label: "Division", needs: "division" },
    { type: "season_team", label: "Team", needs: "team" },
    { type: "season_captains", label: "Captains", needs: "season" },
    {
        type: "season_commissioners",
        label: "Commissioners",
        needs: "season"
    },
    { type: "season_refs", label: "Referees", needs: "season" },
    { type: "all_refs", label: "All referees (all time)", needs: "none" },
    {
        type: "season_ref_interest",
        label: "Referee interest",
        needs: "season"
    },
    {
        type: "season_tryout_help",
        label: "Tryout volunteer sign-ups",
        needs: "season"
    },
    {
        type: "season_tryout_volunteers",
        label: "Assigned tryout volunteers",
        needs: "season"
    },
    { type: "leadership_group", label: "Leadership group", needs: "none" }
]

/** Group types that cannot be resolved without a season. */
export const SEASON_BOUND_GROUP_TYPES: RecipientGroupType[] =
    SURVEY_GROUP_TYPES.filter((g) => g.needs !== "none").map((g) => g.type)

/**
 * Season-bound group types need a season; groups scoped to a division, team or
 * event need that id. Returns one error string per problem, empty when valid.
 */
export function validateAudience(
    def: SurveyAudienceDefinition,
    seasonId: number | null
): string[] {
    const errors: string[] = []

    for (const group of def.groups) {
        const spec = SURVEY_GROUP_TYPES.find((g) => g.type === group.type)
        if (!spec) {
            errors.push(`Unknown audience group "${group.type}".`)
            continue
        }
        if (
            SEASON_BOUND_GROUP_TYPES.includes(spec.type) &&
            (seasonId === null || !Number.isInteger(seasonId) || seasonId <= 0)
        ) {
            errors.push(`${spec.label} requires a season.`)
        }
        if (spec.needs === "division" && !isPositiveInt(group.divisionId)) {
            errors.push(`${spec.label} requires a division.`)
        }
        if (spec.needs === "team" && !isPositiveInt(group.teamId)) {
            errors.push(`${spec.label} requires a team.`)
        }
        if (spec.needs === "event" && !isPositiveInt(group.eventId)) {
            errors.push(`${spec.label} requires an event.`)
        }
    }

    return errors
}

function isPositiveInt(value: number | undefined): boolean {
    return typeof value === "number" && Number.isInteger(value) && value > 0
}

/** Human label for a group, e.g. "Season signups (Fall 2026)", "Division: Rec A", "Team: Spikers". Falls back to the type label when names are missing. */
export function describeAudienceGroup(
    group: SurveyAudienceGroup,
    names?: { seasonLabel?: string; divisionName?: string; teamName?: string }
): string {
    const spec = SURVEY_GROUP_TYPES.find((g) => g.type === group.type)
    const label = spec?.label ?? group.type

    if (spec?.needs === "division" && names?.divisionName) {
        return `Division: ${names.divisionName}`
    }
    if (spec?.needs === "team" && names?.teamName) {
        return `Team: ${names.teamName}`
    }
    if (names?.seasonLabel && spec && spec.needs !== "none") {
        return `${label} (${names.seasonLabel})`
    }
    return label
}
