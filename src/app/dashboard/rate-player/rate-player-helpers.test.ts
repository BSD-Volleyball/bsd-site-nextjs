import { describe, expect, it } from "vitest"

import { resolveDefaultLookupType } from "./rate-player-helpers"

const tryoutDates = ["2026-09-12", "2026-09-19", "2026-09-26"]

const base = {
    phase: "prep_tryout_week_1" as const,
    tryoutDates,
    today: "2026-09-01",
    draftStarted: false,
    byTeamAvailable: true
}

describe("resolveDefaultLookupType", () => {
    it("is direct in the off-season and once the season is complete", () => {
        expect(
            resolveDefaultLookupType({
                ...base,
                phase: "off_season",
                today: "2026-09-20",
                draftStarted: true
            })
        ).toBe("direct")
        expect(
            resolveDefaultLookupType({
                ...base,
                phase: "complete",
                today: "2026-12-01",
                draftStarted: true
            })
        ).toBe("direct")
    })

    it("is direct before the first tryout", () => {
        expect(resolveDefaultLookupType({ ...base, today: "2026-09-11" })).toBe(
            "direct"
        )
    })

    it("switches to each tryout on its date and holds until the next one", () => {
        expect(resolveDefaultLookupType({ ...base, today: "2026-09-12" })).toBe(
            "tryout1"
        )
        expect(resolveDefaultLookupType({ ...base, today: "2026-09-18" })).toBe(
            "tryout1"
        )
        expect(resolveDefaultLookupType({ ...base, today: "2026-09-19" })).toBe(
            "tryout2"
        )
        expect(resolveDefaultLookupType({ ...base, today: "2026-09-25" })).toBe(
            "tryout2"
        )
        expect(resolveDefaultLookupType({ ...base, today: "2026-09-26" })).toBe(
            "tryout3"
        )
        expect(
            resolveDefaultLookupType({
                ...base,
                phase: "draft",
                today: "2026-10-05"
            })
        ).toBe("tryout3")
    })

    it("switches to By Team once drafting has started", () => {
        expect(
            resolveDefaultLookupType({
                ...base,
                phase: "draft",
                today: "2026-10-05",
                draftStarted: true
            })
        ).toBe("byTeam")
        expect(
            resolveDefaultLookupType({
                ...base,
                phase: "regular_season",
                today: "2026-10-20",
                draftStarted: true
            })
        ).toBe("byTeam")
    })

    it("falls back to the tryout rule when By Team is not offered", () => {
        expect(
            resolveDefaultLookupType({
                ...base,
                phase: "draft",
                today: "2026-10-05",
                draftStarted: true,
                byTeamAvailable: false
            })
        ).toBe("tryout3")
    })

    it("handles seasons with fewer than three tryout dates", () => {
        expect(
            resolveDefaultLookupType({
                ...base,
                tryoutDates: ["2026-09-12"],
                today: "2026-10-01"
            })
        ).toBe("tryout1")
        expect(
            resolveDefaultLookupType({
                ...base,
                tryoutDates: [],
                today: "2026-10-01"
            })
        ).toBe("direct")
    })
})
