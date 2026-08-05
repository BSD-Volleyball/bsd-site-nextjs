import { describe, expect, it } from "vitest"
import { formatShortDate } from "./date-utils"

describe("formatShortDate", () => {
    it("renders a date-only string as M/D", () => {
        expect(formatShortDate("2026-08-13")).toBe("8/13")
        expect(formatShortDate("2026-11-05")).toBe("11/5")
    })

    // The whole point of parsing date-only strings as local midnight: a naive
    // new Date("2026-03-01") is UTC midnight and renders as Feb 28 in the US.
    it("does not shift the day in western timezones", () => {
        expect(formatShortDate("2026-03-01")).toBe("3/1")
        expect(formatShortDate("2026-01-01")).toBe("1/1")
    })
})
