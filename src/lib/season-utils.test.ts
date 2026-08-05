import { describe, expect, it } from "vitest"

import { dateRecencyKey, seasonRecencyKey } from "@/lib/season-utils"

describe("seasonRecencyKey", () => {
    it("orders seasons within a year: winter > fall > summer > spring", () => {
        const spring = seasonRecencyKey(2025, "spring")
        const summer = seasonRecencyKey(2025, "summer")
        const fall = seasonRecencyKey(2025, "fall")
        const winter = seasonRecencyKey(2025, "winter")
        expect(spring).toBeLessThan(summer)
        expect(summer).toBeLessThan(fall)
        expect(fall).toBeLessThan(winter)
    })

    it("orders any season of a later year above any season of an earlier year", () => {
        expect(seasonRecencyKey(2026, "spring")).toBeGreaterThan(
            seasonRecencyKey(2025, "winter")
        )
    })

    it("is case-insensitive and falls back to mid-year for unknown names", () => {
        expect(seasonRecencyKey(2025, "Fall")).toBe(
            seasonRecencyKey(2025, "fall")
        )
        expect(seasonRecencyKey(2025, "mystery")).toBe(2025 * 12 + 6)
    })
})

describe("dateRecencyKey", () => {
    it("orders a November tournament above the fall season but below winter", () => {
        const tournament = dateRecencyKey(2025, "2025-11-08")
        expect(tournament).toBeGreaterThan(seasonRecencyKey(2025, "fall"))
        expect(tournament).toBeGreaterThan(seasonRecencyKey(2025, "summer"))
        expect(tournament).toBeLessThan(seasonRecencyKey(2025, "winter"))
    })

    it("falls back to mid-year for malformed or missing dates", () => {
        expect(dateRecencyKey(2025, "not-a-date")).toBe(2025 * 12 + 6)
        expect(dateRecencyKey(2025, null)).toBe(2025 * 12 + 6)
    })
})
