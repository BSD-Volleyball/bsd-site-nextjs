import type {
    LexicalEmailTemplateContent,
    LexicalInlineNode,
    LexicalTextNode,
    LexicalParagraphNode,
    LexicalListNode,
    LexicalListItemNode
} from "@/lib/email-template-content"

export interface TemplateVariable {
    key: string
    label: string
    category: string
    description: string
}

export type TemplateVariableValues = Record<string, string>

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
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

    // Dates
    {
        key: "tryout_1_date",
        label: "Tryout 1 Date",
        category: "Dates",
        description: "First tryout date"
    },
    {
        key: "tryout_2_date",
        label: "Tryout 2 Date",
        category: "Dates",
        description: "Second tryout date"
    },
    {
        key: "tryout_3_date",
        label: "Tryout 3 Date",
        category: "Dates",
        description: "Third tryout date"
    },
    {
        key: "season_1_date",
        label: "Season Week 1 Date",
        category: "Dates",
        description: "First week of season date"
    },
    {
        key: "season_2_date",
        label: "Season Week 2 Date",
        category: "Dates",
        description: "Second week of season date"
    },
    {
        key: "season_3_date",
        label: "Season Week 3 Date",
        category: "Dates",
        description: "Third week of season date"
    },
    {
        key: "season_4_date",
        label: "Season Week 4 Date",
        category: "Dates",
        description: "Fourth week of season date"
    },
    {
        key: "season_5_date",
        label: "Season Week 5 Date",
        category: "Dates",
        description: "Fifth week of season date"
    },
    {
        key: "season_6_date",
        label: "Season Week 6 Date",
        category: "Dates",
        description: "Sixth week of season date"
    },
    {
        key: "captain_select_date",
        label: "Captain Select Date",
        category: "Dates",
        description: "Date captains are selected"
    },
    {
        key: "draft_1_date",
        label: "Draft 1 Date",
        category: "Dates",
        description: "First draft date"
    },
    {
        key: "draft_2_date",
        label: "Draft 2 Date",
        category: "Dates",
        description: "Second draft date"
    },
    {
        key: "draft_3_date",
        label: "Draft 3 Date",
        category: "Dates",
        description: "Third draft date"
    },
    {
        key: "draft_4_date",
        label: "Draft 4 Date",
        category: "Dates",
        description: "Fourth draft date"
    },
    {
        key: "draft_5_date",
        label: "Draft 5 Date",
        category: "Dates",
        description: "Fifth draft date"
    },
    {
        key: "draft_6_date",
        label: "Draft 6 Date",
        category: "Dates",
        description: "Sixth draft date"
    },
    {
        key: "playoff_1_date",
        label: "Playoff Week 1 Date",
        category: "Dates",
        description: "First playoff date"
    },
    {
        key: "playoff_2_date",
        label: "Playoff Week 2 Date",
        category: "Dates",
        description: "Second playoff date"
    },
    {
        key: "playoff_3_date",
        label: "Playoff Week 3 Date",
        category: "Dates",
        description: "Third playoff date"
    },

    // Session Times
    {
        key: "tryout_1_s1_time",
        label: "Tryout 1 Session 1 Time",
        category: "Session Times",
        description: "First tryout, first session time"
    },
    {
        key: "tryout_1_s2_time",
        label: "Tryout 1 Session 2 Time",
        category: "Session Times",
        description: "First tryout, second session time"
    },
    {
        key: "tryout_2_s1_time",
        label: "Tryout 2 Session 1 Time",
        category: "Session Times",
        description: "Second tryout, first session time"
    },
    {
        key: "tryout_2_s2_time",
        label: "Tryout 2 Session 2 Time",
        category: "Session Times",
        description: "Second tryout, second session time"
    },
    {
        key: "tryout_2_s3_time",
        label: "Tryout 2 Session 3 Time",
        category: "Session Times",
        description: "Second tryout, third session time"
    },
    {
        key: "tryout_3_s1_time",
        label: "Tryout 3 Session 1 Time",
        category: "Session Times",
        description: "Third tryout, first session time"
    },
    {
        key: "tryout_3_s2_time",
        label: "Tryout 3 Session 2 Time",
        category: "Session Times",
        description: "Third tryout, second session time"
    },
    {
        key: "tryout_3_s3_time",
        label: "Tryout 3 Session 3 Time",
        category: "Session Times",
        description: "Third tryout, third session time"
    },
    {
        key: "season_s1_time",
        label: "Season Session 1 Time",
        category: "Session Times",
        description: "Regular season, first session time"
    },
    {
        key: "season_s2_time",
        label: "Season Session 2 Time",
        category: "Session Times",
        description: "Regular season, second session time"
    },
    {
        key: "season_s3_time",
        label: "Season Session 3 Time",
        category: "Session Times",
        description: "Regular season, third session time"
    }
]

export function getTemplateVariable(key: string): TemplateVariable | undefined {
    return TEMPLATE_VARIABLES.find((v) => v.key === key)
}

export function getTemplateVariablesByCategory(): Map<
    string,
    TemplateVariable[]
> {
    const map = new Map<string, TemplateVariable[]>()
    for (const variable of TEMPLATE_VARIABLES) {
        const existing = map.get(variable.category) ?? []
        existing.push(variable)
        map.set(variable.category, existing)
    }
    return map
}

function resolveInlineNode(
    node: LexicalInlineNode,
    values: TemplateVariableValues
): LexicalTextNode {
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
