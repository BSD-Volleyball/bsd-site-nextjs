import { describe, expect, it } from "vitest"

import {
    gameRules,
    ruleLines,
    seasonCodeFor,
    sheetCode,
    sheetDeepLink,
    tallyRowCount,
    TEMPLATE_VERSION
} from "./sheet-config"

describe("gameRules", () => {
    it("stops the regular-season grid at the 27-point cap", () => {
        for (const rule of gameRules("regular_season")) {
            expect(rule.maxPoint).toBe(27)
            expect(rule.preStruck).toBe(0)
        }
    })

    it("pre-strikes the four points playoff games start with", () => {
        const rules = gameRules("playoff")
        expect(rules.map((r) => r.maxPoint)).toEqual([30, 30, 35])
        for (const rule of rules) {
            expect(rule.preStruck).toBe(4)
        }
    })

    it("always fits a game into three printed rows", () => {
        for (const eventType of ["regular_season", "playoff"] as const) {
            for (const rule of gameRules(eventType)) {
                expect(tallyRowCount(rule)).toBe(3)
            }
        }
    })
})

describe("ruleLines", () => {
    it("prints only the rules that apply to the night", () => {
        const regular = ruleLines("regular_season").join(" ")
        expect(regular).toContain("27-point cap")
        expect(regular).not.toContain("start at 4")

        const playoff = ruleLines("playoff").join(" ")
        expect(playoff).toContain("start at 4")
        expect(playoff).not.toContain("27-point cap")
    })
})

describe("seasonCodeFor", () => {
    it("abbreviates the season and year", () => {
        expect(seasonCodeFor("fall", 2026)).toBe("F26")
        expect(seasonCodeFor("Spring", 2027)).toBe("S27")
        expect(seasonCodeFor("summer", 2030)).toBe("U30")
    })

    it("pads a single-digit year", () => {
        expect(seasonCodeFor("fall", 2005)).toBe("F05")
    })
})

describe("sheetCode", () => {
    const fall = { seasonCode: "F26", ordinal: 3 }

    it("marks regular-season weeks with W and playoffs with P", () => {
        expect(sheetCode({ ...fall, eventType: "regular_season" }, 4)).toBe(
            "F26-W3-C4"
        )
        expect(sheetCode({ ...fall, eventType: "playoff" }, 1)).toBe(
            "F26-P3-C1"
        )
    })

    it("labels a court that has not been assigned", () => {
        expect(sheetCode({ ...fall, eventType: "regular_season" }, null)).toBe(
            "F26-W3-CTBD"
        )
    })
})

describe("sheetDeepLink", () => {
    it("carries the date, court and template version", () => {
        const url = new URL(
            sheetDeepLink("https://bumpsetdrink.com", "2026-10-05", 4)
        )
        expect(url.pathname).toBe("/dashboard/enter-scores")
        expect(url.searchParams.get("date")).toBe("2026-10-05")
        expect(url.searchParams.get("court")).toBe("4")
        expect(url.searchParams.get("v")).toBe(String(TEMPLATE_VERSION))
    })

    it("omits the court when there is none", () => {
        const url = new URL(
            sheetDeepLink("https://bumpsetdrink.com", "2026-10-05", null)
        )
        expect(url.searchParams.has("court")).toBe(false)
    })

    it("does not double a trailing slash on the site url", () => {
        expect(
            sheetDeepLink("https://bumpsetdrink.com/", "2026-10-05", 2)
        ).toContain("https://bumpsetdrink.com/dashboard/enter-scores?")
    })
})
