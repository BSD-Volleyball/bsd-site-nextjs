import type {
    LexicalEmailTemplateContent,
    LexicalInlineNode,
    LexicalParagraphNode,
    LexicalListNode,
    LexicalListItemNode
} from "@/lib/email-template-content"
import type { SeasonConfig } from "@/lib/site-config"
import {
    getEventsByType,
    formatEventDate,
    formatEventTime
} from "@/lib/site-config"

export interface TemplateVariable {
    key: string
    label: string
    category: string
    description: string
}

export type TemplateVariableValues = Record<string, string>

const ORDINALS = [
    "First",
    "Second",
    "Third",
    "Fourth",
    "Fifth",
    "Sixth",
    "Seventh",
    "Eighth",
    "Ninth",
    "Tenth"
]

function ordinal(i: number): string {
    return ORDINALS[i] ?? `#${i + 1}`
}

/** Variables that do not depend on season event data. */
const STATIC_VARIABLES: TemplateVariable[] = [
    // General
    {
        key: "division_name",
        label: "Division Name",
        category: "General",
        description: "Name of the selected division (e.g. AA)"
    },
    {
        key: "season_name",
        label: "Season Name",
        category: "General",
        description: "Current season label (e.g. Spring 2026)"
    },
    {
        key: "season_year",
        label: "Season Year",
        category: "General",
        description: "Current season year (e.g. 2026)"
    },
    {
        key: "gender_split",
        label: "Gender Split",
        category: "General",
        description: "Gender split for the selected division (e.g. 50/50)"
    },
    {
        key: "court_focus",
        label: "Court Focus",
        category: "General",
        description:
            "Court focus text based on selected division level (e.g. court 1 and 2)"
    },

    // People
    {
        key: "commissioner_name",
        label: "Commissioner Name",
        category: "People",
        description: "Name of the commissioner generating this message"
    },
    {
        key: "captain_names",
        label: "Captain Names",
        category: "People",
        description: "Bulleted list of selected captain first and last names"
    },
    {
        key: "other_commissioner",
        label: "Other Commissioner",
        category: "People",
        description:
            "First name of the other commissioner for this division (not the current user)"
    },
    {
        key: "user_preferred_name",
        label: "User Preferred Name",
        category: "People",
        description:
            "Logged-in user's preferred name if set, otherwise their first name"
    },
    {
        key: "user_last_name",
        label: "User Last Name",
        category: "People",
        description: "Logged-in user's last name"
    },

    // Draft
    {
        key: "captain_rounds",
        label: "Captain Rounds",
        category: "Draft",
        description: "Bulleted list of captains and their assigned draft rounds"
    },
    {
        key: "pair_diffs",
        label: "Pair Differentials",
        category: "Draft",
        description:
            "Bulleted list of pair picks and their assigned differentials"
    },
    {
        key: "team_members",
        label: "Team Members",
        category: "Draft",
        description: "Bulleted list of players on the team sorted by last name"
    },
    {
        key: "team_name",
        label: "Team Name",
        category: "Draft",
        description: "Name of the captain's team"
    }
]

function buildDateVariables(config: SeasonConfig): TemplateVariable[] {
    const vars: TemplateVariable[] = []

    for (const [i] of getEventsByType(config, "tryout").entries()) {
        vars.push({
            key: `tryout_${i + 1}_date`,
            label: `Tryout ${i + 1} Date`,
            category: "Dates",
            description: `${ordinal(i)} tryout date`
        })
    }

    for (const [i] of getEventsByType(
        config,
        "regular_season"
    ).entries()) {
        vars.push({
            key: `season_${i + 1}_date`,
            label: `Season Week ${i + 1} Date`,
            category: "Dates",
            description: `${ordinal(i)} week of season date`
        })
    }

    if (getEventsByType(config, "captain_select").length > 0) {
        vars.push({
            key: "captain_select_date",
            label: "Captain Select Date",
            category: "Dates",
            description: "Date captains are selected"
        })
    }

    const drafts = getEventsByType(config, "draft")
    for (const [i] of drafts.entries()) {
        vars.push({
            key: `draft_${i + 1}_date`,
            label: `Draft ${i + 1} Date`,
            category: "Dates",
            description: `${ordinal(i)} draft date`
        })
    }

    if (drafts.length > 0) {
        vars.push({
            key: "division_draft_date",
            label: "Division Draft Date",
            category: "Dates",
            description:
                "Draft date for the selected division based on division level"
        })
    }

    for (const [i] of getEventsByType(config, "playoff").entries()) {
        vars.push({
            key: `playoff_${i + 1}_date`,
            label: `Playoff Week ${i + 1} Date`,
            category: "Dates",
            description: `${ordinal(i)} playoff date`
        })
    }

    return vars
}

function buildTimeSlotVariables(config: SeasonConfig): TemplateVariable[] {
    const vars: TemplateVariable[] = []

    for (const [i, event] of getEventsByType(config, "tryout").entries()) {
        for (const [j] of event.timeSlots.entries()) {
            vars.push({
                key: `tryout_${i + 1}_s${j + 1}_time`,
                label: `Tryout ${i + 1} Session ${j + 1} Time`,
                category: "Session Times",
                description: `${ordinal(i)} tryout, ${ordinal(j).toLowerCase()} session time`
            })
        }
    }

    const regularSeason = getEventsByType(config, "regular_season")
    if (regularSeason[0]) {
        for (const [j] of regularSeason[0].timeSlots.entries()) {
            vars.push({
                key: `season_s${j + 1}_time`,
                label: `Season Session ${j + 1} Time`,
                category: "Session Times",
                description: `Regular season, ${ordinal(j).toLowerCase()} session time`
            })
        }
    }

    return vars
}

/**
 * Build the full list of template variables including season-specific
 * date and time slot entries derived from the given SeasonConfig.
 */
export function buildTemplateVariables(
    config: SeasonConfig
): TemplateVariable[] {
    return [
        ...STATIC_VARIABLES,
        ...buildDateVariables(config),
        ...buildTimeSlotVariables(config)
    ]
}

/**
 * Static-only variable list (General, People, Draft).
 * @deprecated Pass a SeasonConfig to {@link buildTemplateVariables} for the
 * complete list including dynamic date/time variables.
 */
export const TEMPLATE_VARIABLES = STATIC_VARIABLES

export function getTemplateVariable(
    key: string,
    config?: SeasonConfig
): TemplateVariable | undefined {
    const vars = config ? buildTemplateVariables(config) : STATIC_VARIABLES
    return vars.find((v) => v.key === key)
}

export function getTemplateVariablesByCategory(
    config?: SeasonConfig
): Map<string, TemplateVariable[]> {
    const vars = config ? buildTemplateVariables(config) : STATIC_VARIABLES
    const map = new Map<string, TemplateVariable[]>()
    for (const variable of vars) {
        const existing = map.get(variable.category) ?? []
        existing.push(variable)
        map.set(variable.category, existing)
    }
    return map
}

/**
 * Build template variable values for all season event dates and time slots.
 * Centralizes the mapping from SeasonConfig events to the backward-compatible
 * variable keys so individual components do not need to duplicate this logic.
 */
export function buildEventVariableValues(
    config: SeasonConfig,
    divisionLevel?: number | null
): TemplateVariableValues {
    const values: TemplateVariableValues = {}

    const tryouts = getEventsByType(config, "tryout")
    for (const [i, event] of tryouts.entries()) {
        values[`tryout_${i + 1}_date`] = formatEventDate(event.eventDate)
        for (const [j, ts] of event.timeSlots.entries()) {
            values[`tryout_${i + 1}_s${j + 1}_time`] = formatEventTime(
                ts.startTime
            )
        }
    }

    const regularSeason = getEventsByType(config, "regular_season")
    for (const [i, event] of regularSeason.entries()) {
        values[`season_${i + 1}_date`] = formatEventDate(event.eventDate)
    }
    if (regularSeason[0]) {
        for (const [j, ts] of regularSeason[0].timeSlots.entries()) {
            values[`season_s${j + 1}_time`] = formatEventTime(ts.startTime)
        }
    }

    const playoffs = getEventsByType(config, "playoff")
    for (const [i, event] of playoffs.entries()) {
        values[`playoff_${i + 1}_date`] = formatEventDate(event.eventDate)
    }

    const drafts = getEventsByType(config, "draft")
    for (const [i, event] of drafts.entries()) {
        values[`draft_${i + 1}_date`] = formatEventDate(event.eventDate)
    }

    const captainSelect = getEventsByType(config, "captain_select")
    if (captainSelect[0]) {
        values.captain_select_date = formatEventDate(
            captainSelect[0].eventDate
        )
    }

    if (divisionLevel != null && drafts[divisionLevel - 1]) {
        values.division_draft_date = formatEventDate(
            drafts[divisionLevel - 1].eventDate
        )
    }

    return values
}

function resolveInlineNode(
    node: LexicalInlineNode,
    values: TemplateVariableValues
): LexicalInlineNode {
    if (node.type === "template-variable") {
        const resolved = values[node.variableKey] ?? `[${node.variableKey}]`
        return {
            type: "text",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            text: resolved,
            version: 1
        }
    }
    return node
}

function resolveParagraph(
    paragraph: LexicalParagraphNode,
    values: TemplateVariableValues
): LexicalParagraphNode {
    return {
        ...paragraph,
        children: paragraph.children.map((node) =>
            resolveInlineNode(node, values)
        )
    }
}

function resolveListItem(
    item: LexicalListItemNode,
    values: TemplateVariableValues
): LexicalListItemNode {
    return {
        ...item,
        children: item.children.map((node) => resolveInlineNode(node, values))
    }
}

function resolveListNode(
    list: LexicalListNode,
    values: TemplateVariableValues
): LexicalListNode {
    return {
        ...list,
        children: list.children.map((item) => resolveListItem(item, values))
    }
}

export function resolveTemplateVariablesInContent(
    content: LexicalEmailTemplateContent,
    values: TemplateVariableValues
): LexicalEmailTemplateContent {
    return {
        root: {
            ...content.root,
            children: content.root.children.map((child) => {
                if (child.type === "paragraph") {
                    return resolveParagraph(child, values)
                }
                if (child.type === "list") {
                    return resolveListNode(child, values)
                }
                return child
            })
        }
    }
}

export function resolveSubjectVariables(
    subject: string,
    values: TemplateVariableValues
): string {
    let result = subject
    for (const [key, value] of Object.entries(values)) {
        result = result.replaceAll(`[${key}]`, value)
    }
    // Keep backward-compat with the old [division] key used before this system
    if (values.division_name) {
        result = result.replaceAll("[division]", values.division_name)
    }
    return result
}
