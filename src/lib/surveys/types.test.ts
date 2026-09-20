import { describe, expect, it } from "vitest"
import type { RecipientGroupType } from "@/lib/email-recipients"
import {
    describeAudienceGroup,
    isSurveyQuestionType,
    isSurveyRoleTag,
    SEASON_BOUND_GROUP_TYPES,
    SURVEY_GROUP_TYPES,
    validateAudience
} from "./types"

describe("guards", () => {
    it("recognizes question types", () => {
        expect(isSurveyQuestionType("multi_choice")).toBe(true)
        expect(isSurveyQuestionType("slider")).toBe(false)
        expect(isSurveyQuestionType(3)).toBe(false)
    })

    it("recognizes role tags", () => {
        expect(isSurveyRoleTag("captain")).toBe(true)
        expect(isSurveyRoleTag("mascot")).toBe(false)
        expect(isSurveyRoleTag(null)).toBe(false)
    })
})

describe("SURVEY_GROUP_TYPES", () => {
    it("omits self and the event-scoped tryout group", () => {
        const types = SURVEY_GROUP_TYPES.map((g) => g.type)
        expect(types).not.toContain("self")
        expect(types).not.toContain("season_tryout_volunteers_event")
    })

    it("marks every scoped group as season bound", () => {
        expect(SEASON_BOUND_GROUP_TYPES).toEqual(
            SURVEY_GROUP_TYPES.filter((g) => g.needs !== "none").map(
                (g) => g.type
            )
        )
        expect(SEASON_BOUND_GROUP_TYPES).not.toContain("all_users")
        expect(SEASON_BOUND_GROUP_TYPES).not.toContain("leadership_group")
    })
})

describe("validateAudience", () => {
    const empty = { addUserIds: [], removeUserIds: [] }

    it("accepts season-free groups without a season", () => {
        expect(
            validateAudience(
                { ...empty, groups: [{ type: "all_users" }] },
                null
            )
        ).toEqual([])
    })

    it("rejects season-bound groups without a season", () => {
        expect(
            validateAudience(
                { ...empty, groups: [{ type: "season_signups" }] },
                null
            )
        ).toHaveLength(1)
        expect(
            validateAudience(
                { ...empty, groups: [{ type: "season_signups" }] },
                7
            )
        ).toEqual([])
    })

    it("rejects groups missing their division or team", () => {
        expect(
            validateAudience(
                { ...empty, groups: [{ type: "season_division" }] },
                7
            )
        ).toHaveLength(1)
        expect(
            validateAudience(
                {
                    ...empty,
                    groups: [{ type: "season_division", divisionId: 3 }]
                },
                7
            )
        ).toEqual([])
        expect(
            validateAudience(
                { ...empty, groups: [{ type: "season_team", teamId: 0 }] },
                7
            )
        ).toHaveLength(1)
    })

    it("rejects unknown and disallowed group types", () => {
        expect(
            validateAudience({ ...empty, groups: [{ type: "self" }] }, 7)
        ).toHaveLength(1)
        expect(
            validateAudience(
                {
                    ...empty,
                    groups: [{ type: "made_up" as RecipientGroupType }]
                },
                7
            )
        ).toHaveLength(1)
    })

    it("reports one error per bad group", () => {
        expect(
            validateAudience(
                {
                    ...empty,
                    groups: [
                        { type: "season_signups" },
                        { type: "season_team" }
                    ]
                },
                null
            )
        ).toHaveLength(3)
    })
})

describe("describeAudienceGroup", () => {
    it("names the division or team when known", () => {
        expect(
            describeAudienceGroup(
                { type: "season_division", divisionId: 3 },
                { divisionName: "Rec A", seasonLabel: "Fall 2026" }
            )
        ).toBe("Division: Rec A")
        expect(
            describeAudienceGroup(
                { type: "season_team", teamId: 9 },
                { teamName: "Spikers" }
            )
        ).toBe("Team: Spikers")
    })

    it("appends the season to season-bound groups", () => {
        expect(
            describeAudienceGroup(
                { type: "season_signups" },
                { seasonLabel: "Fall 2026" }
            )
        ).toBe("Season signups (Fall 2026)")
    })

    it("falls back to the bare label", () => {
        expect(describeAudienceGroup({ type: "season_signups" })).toBe(
            "Season signups"
        )
        expect(
            describeAudienceGroup(
                { type: "all_users" },
                { seasonLabel: "Fall 2026" }
            )
        ).toBe("Everyone")
    })
})
