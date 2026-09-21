import { describe, expect, it } from "vitest"

import {
    FIRST_MATCH_GRACE_MINUTES,
    gameRules,
    ruleLines,
    seasonCodeFor,
    sheetCode,
    sheetTag,
    startNote,
    tallyRowCount,
    TEMPLATE_VERSION,
    TURNAROUND_MINUTES
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

describe("sheetTag", () => {
    const night = {
        seasonCode: "F26",
        ordinal: 3,
        date: "2026-10-05",
        eventType: "regular_season" as const
    }

    it("identifies the sheet and the template that printed it", () => {
        expect(sheetTag(night, 4)).toBe(
            `BSD${TEMPLATE_VERSION}:F26:W3:2026-10-05:4`
        )
    })

    it("marks playoff nights with P", () => {
        expect(sheetTag({ ...night, eventType: "playoff" }, 1)).toBe(
            `BSD${TEMPLATE_VERSION}:F26:P3:2026-10-05:1`
        )
    })

    it("still identifies a sheet with no court assigned", () => {
        expect(sheetTag(night, null)).toBe(
            `BSD${TEMPLATE_VERSION}:F26:W3:2026-10-05:TBD`
        )
    })

    it("stays short enough for a small printed code", () => {
        expect(sheetTag(night, 4).length).toBeLessThanOrEqual(32)
    })
})

describe("startNote", () => {
    const aa = (time: string | null) => ({ time, divisionName: "AA" })

    it("pins the first match on a court to the clock", () => {
        expect(startNote(aa("19:00:00"), null)).toBe(
            "Start no later than 7:10pm"
        )
        expect(FIRST_MATCH_GRACE_MINUTES).toBe(10)
    })

    it("rolls the clock over the hour correctly", () => {
        expect(startNote(aa("20:55:00"), null)).toBe(
            "Start no later than 9:05pm"
        )
    })

    it("tells later matches to follow the previous one", () => {
        expect(startNote(aa("20:10:00"), aa("19:00:00"))).toBe(
            `Start ${TURNAROUND_MINUTES} mins after previous match ends`
        )
    })

    it("pins a new division's first match even mid-court", () => {
        // Playoff week 2: one court hosts two divisions in separate blocks,
        // so the later block does not follow on from the earlier one.
        const a = { time: "20:40:00", divisionName: "A" }
        expect(startNote(a, { divisionName: "AA" })).toBe(
            "Start no later than 8:50pm"
        )
    })

    it("says nothing when a first match has no scheduled time", () => {
        expect(startNote(aa(null), null)).toBeNull()
    })
})
