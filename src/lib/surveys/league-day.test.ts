import { describe, expect, it } from "vitest"
import { getLeagueDateString } from "@/lib/date-utils"
import { leagueDateString, leagueDayMidnight } from "./league-day"

describe("leagueDateString", () => {
    it("uses the league day, not the UTC day, on a UTC evening", () => {
        // 2026-07-04 23:30 in New York is already July 5 in UTC.
        expect(leagueDateString(new Date("2026-07-05T03:30:00Z"))).toBe(
            "2026-07-04"
        )
    })

    it("uses the league day on a UTC morning that is still yesterday", () => {
        // 2026-01-15 19:00 EST is 2026-01-16 00:00 UTC.
        expect(leagueDateString(new Date("2026-01-16T00:00:00Z"))).toBe(
            "2026-01-15"
        )
    })

    it("zero-pads single-digit months and days", () => {
        expect(leagueDateString(new Date("2026-03-08T16:00:00Z"))).toBe(
            "2026-03-08"
        )
    })

    it("agrees with getLeagueDateString for the current instant", () => {
        expect(leagueDateString()).toBe(getLeagueDateString(0))
    })
})

describe("leagueDayMidnight", () => {
    it("anchors a summer (EDT) instant to 04:00 UTC", () => {
        // 2026-07-04 18:30 in New York.
        const now = new Date("2026-07-04T22:30:00Z")
        expect(leagueDayMidnight(now).toISOString()).toBe(
            "2026-07-04T04:00:00.000Z"
        )
    })

    it("anchors a winter (EST) instant to 05:00 UTC", () => {
        // 2026-01-15 13:00 in New York.
        const now = new Date("2026-01-15T18:00:00Z")
        expect(leagueDayMidnight(now).toISOString()).toBe(
            "2026-01-15T05:00:00.000Z"
        )
    })

    it("uses the league day, not the UTC day, late in the evening", () => {
        // 2026-07-04 23:30 in New York is already July 5 in UTC.
        const now = new Date("2026-07-05T03:30:00Z")
        expect(leagueDayMidnight(now).toISOString()).toBe(
            "2026-07-04T04:00:00.000Z"
        )
    })

    it("uses the pre-transition offset on the spring-forward day", () => {
        // DST starts 2026-03-08 at 2am, so that day's midnight is still EST.
        const now = new Date("2026-03-08T16:00:00Z")
        expect(leagueDayMidnight(now).toISOString()).toBe(
            "2026-03-08T05:00:00.000Z"
        )
    })

    it("uses the pre-transition offset on the fall-back day", () => {
        // DST ends 2026-11-01 at 2am, so that day's midnight is still EDT.
        const now = new Date("2026-11-01T20:00:00Z")
        expect(leagueDayMidnight(now).toISOString()).toBe(
            "2026-11-01T04:00:00.000Z"
        )
    })

    it("defaults to the current instant", () => {
        const midnight = leagueDayMidnight()
        expect(midnight.getTime()).toBeLessThanOrEqual(Date.now())
        expect(Date.now() - midnight.getTime()).toBeLessThan(
            25 * 60 * 60 * 1000
        )
    })
})
