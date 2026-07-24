import { describe, expect, it } from "vitest"
import type { LexicalEmailTemplateContent } from "@/lib/email-template-content"
import {
    buildEventVariableValues,
    findUnresolvedVariableKeys,
    getTemplateVariable,
    getTemplateVariablesByCategory,
    resolveSubjectVariables,
    resolveTemplateVariablesInContent
} from "@/lib/email-template-variables"
import type { SeasonConfig, SeasonEvent } from "@/lib/season-types"

let eventId = 0
function seasonEvent(
    eventType: SeasonEvent["eventType"],
    eventDate: string,
    startTimes: string[] = [],
    sortOrder = 0
): SeasonEvent {
    eventId++
    return {
        id: eventId,
        eventType,
        eventDate,
        sortOrder,
        label: null,
        timeSlots: startTimes.map((startTime, i) => ({
            id: eventId * 100 + i,
            startTime,
            slotLabel: null,
            sortOrder: i
        }))
    }
}

const config: SeasonConfig = {
    seasonId: 1,
    seasonAmount: "100.00",
    lateAmount: "120.00",
    maxPlayers: 96,
    seasonYear: 2026,
    seasonName: "fall",
    phase: "registration_open",
    events: [
        seasonEvent("tryout", "2026-09-05", ["18:00:00", "19:30:00"], 0),
        seasonEvent("tryout", "2026-09-12", ["18:00:00"], 1),
        seasonEvent("regular_season", "2026-09-19", ["19:00:00"], 0),
        seasonEvent("regular_season", "2026-09-26", [], 1),
        seasonEvent("playoff", "2026-11-07", [], 0),
        seasonEvent("draft", "2026-09-14", [], 0),
        seasonEvent("draft", "2026-09-15", [], 1),
        seasonEvent("captain_select", "2026-08-30", [], 0)
    ]
}

describe("buildEventVariableValues", () => {
    const values = buildEventVariableValues(config)

    it("maps tryout dates and time slots", () => {
        expect(values.tryout_1_date).toContain("September 5, 2026")
        expect(values.tryout_1_s1_time).toBe("6:00 PM")
        expect(values.tryout_1_s2_time).toBe("7:30 PM")
        expect(values.tryout_2_date).toContain("September 12, 2026")
    })

    it("maps season, playoff, draft, and captain-select dates", () => {
        expect(values.season_1_date).toContain("September 19, 2026")
        expect(values.season_2_date).toContain("September 26, 2026")
        expect(values.season_s1_time).toBe("7:00 PM")
        expect(values.playoff_1_date).toContain("November 7, 2026")
        expect(values.draft_1_date).toContain("September 14, 2026")
        expect(values.captain_select_date).toContain("August 30, 2026")
    })

    it("resolves the division draft date from the division level", () => {
        const withLevel = buildEventVariableValues(config, 2)
        expect(withLevel.division_draft_date).toContain("September 15, 2026")
        expect(values.division_draft_date).toBeUndefined()
    })
})

describe("resolveSubjectVariables", () => {
    it("replaces bracketed keys, including repeats", () => {
        const result = resolveSubjectVariables(
            "[season_name] draft for [division_name] ([division_name])",
            { season_name: "Fall 2026", division_name: "AA" }
        )
        expect(result).toBe("Fall 2026 draft for AA (AA)")
    })

    it("supports the legacy [division] key", () => {
        expect(
            resolveSubjectVariables("Captains for [division]", {
                division_name: "BB"
            })
        ).toBe("Captains for BB")
    })

    it("leaves unknown keys untouched", () => {
        expect(resolveSubjectVariables("[mystery]", {})).toBe("[mystery]")
    })
})

describe("resolveTemplateVariablesInContent", () => {
    it("replaces template-variable nodes with text and marks unknown keys", () => {
        const content: LexicalEmailTemplateContent = {
            root: {
                type: "root",
                direction: null,
                format: "",
                indent: 0,
                version: 1,
                children: [
                    {
                        type: "paragraph",
                        direction: null,
                        format: "",
                        indent: 0,
                        version: 1,
                        children: [
                            {
                                type: "template-variable",
                                variableKey: "division_name",
                                version: 1
                            },
                            {
                                type: "template-variable",
                                variableKey: "nope",
                                version: 1
                            }
                        ]
                    }
                ]
            }
        }

        const resolved = resolveTemplateVariablesInContent(content, {
            division_name: "AA"
        })
        const [paragraph] = resolved.root.children
        if (paragraph.type !== "paragraph")
            throw new Error("expected paragraph")
        expect(paragraph.children[0]).toMatchObject({
            type: "text",
            text: "AA"
        })
        expect(paragraph.children[1]).toMatchObject({
            type: "text",
            text: "[nope]"
        })
    })
})

describe("findUnresolvedVariableKeys", () => {
    const emptyContent: LexicalEmailTemplateContent = {
        root: {
            type: "root",
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: []
        }
    }

    function contentWithVariables(keys: string[]): LexicalEmailTemplateContent {
        return {
            root: {
                type: "root",
                direction: null,
                format: "",
                indent: 0,
                version: 1,
                children: [
                    {
                        type: "paragraph",
                        direction: null,
                        format: "",
                        indent: 0,
                        version: 1,
                        children: keys.map((variableKey) => ({
                            type: "template-variable" as const,
                            variableKey,
                            version: 1
                        }))
                    }
                ]
            }
        }
    }

    it("flags known subject variables missing from values", () => {
        expect(
            findUnresolvedVariableKeys(
                "[season_name] kickoff, brought to you by [captain_names]",
                emptyContent,
                { season_name: "Fall 2026" },
                config
            )
        ).toEqual(["captain_names"])
    })

    it("flags season-derived date variables in the subject", () => {
        expect(
            findUnresolvedVariableKeys(
                "Tryouts on [tryout_1_date]",
                emptyContent,
                {},
                config
            )
        ).toEqual(["tryout_1_date"])
    })

    it("ignores bracketed text that is not a known variable", () => {
        expect(
            findUnresolvedVariableKeys(
                "[fun] stuff [really]",
                emptyContent,
                {},
                config
            )
        ).toEqual([])
    })

    it("treats the legacy [division] key as division_name", () => {
        expect(
            findUnresolvedVariableKeys("[division]", emptyContent, {}, config)
        ).toEqual(["division"])
        expect(
            findUnresolvedVariableKeys(
                "[division]",
                emptyContent,
                { division_name: "AA" },
                config
            )
        ).toEqual([])
    })

    it("flags unresolved template-variable nodes in the content", () => {
        expect(
            findUnresolvedVariableKeys(
                "No variables here",
                contentWithVariables(["division_name", "season_name"]),
                { season_name: "Fall 2026" },
                config
            )
        ).toEqual(["division_name"])
    })

    it("dedupes keys repeated across subject and content", () => {
        expect(
            findUnresolvedVariableKeys(
                "[captain_names] and again [captain_names]",
                contentWithVariables(["captain_names"]),
                {},
                config
            )
        ).toEqual(["captain_names"])
    })
})

describe("variable catalog", () => {
    it("groups static variables by category", () => {
        const byCategory = getTemplateVariablesByCategory()
        expect(byCategory.get("General")?.length).toBeGreaterThan(0)
        expect(byCategory.get("People")?.length).toBeGreaterThan(0)
    })

    it("finds variables by key and returns undefined for unknowns", () => {
        expect(getTemplateVariable("division_name")?.label).toBe(
            "Division Name"
        )
        expect(getTemplateVariable("does_not_exist")).toBeUndefined()
    })
})
