import { describe, expect, it } from "vitest"
import {
    coverageDateTitle,
    formatCoverageDate,
    formatSlotLabel,
    normalizeTime,
    personTone
} from "./format"

describe("normalizeTime", () => {
    it("pads HH:MM to HH:MM:SS", () => {
        expect(normalizeTime("19:00")).toBe("19:00:00")
    })
    it("pads single-digit hours", () => {
        expect(normalizeTime("7:30:00")).toBe("07:30:00")
    })
    it("keeps HH:MM:SS", () => {
        expect(normalizeTime("20:15:00")).toBe("20:15:00")
    })
    it("returns null for null/empty", () => {
        expect(normalizeTime(null)).toBeNull()
        expect(normalizeTime("")).toBeNull()
    })
})

describe("formatSlotLabel", () => {
    it("renders 12-hour time", () => {
        expect(formatSlotLabel("19:00:00")).toBe("7:00 PM")
    })
    it("renders TBD for null", () => {
        expect(formatSlotLabel(null)).toBe("TBD")
    })
})

describe("formatCoverageDate", () => {
    it("renders a short weekday date", () => {
        expect(formatCoverageDate("2026-10-06")).toBe("Tue, Oct 6")
    })
})

describe("coverageDateTitle", () => {
    it("uses the event label when set", () => {
        expect(
            coverageDateTitle({
                eventType: "regular_season",
                ordinal: 3,
                label: "Rivalry Night"
            })
        ).toBe("Rivalry Night")
    })
    it("falls back to Week N", () => {
        expect(
            coverageDateTitle({
                eventType: "regular_season",
                ordinal: 3,
                label: null
            })
        ).toBe("Week 3")
    })
    it("falls back to Playoffs Week N", () => {
        expect(
            coverageDateTitle({ eventType: "playoff", ordinal: 1, label: null })
        ).toBe("Playoffs Week 1")
    })
})

describe("personTone", () => {
    it("is admin for a counting non-leadership person", () => {
        expect(
            personTone({
                counts: true,
                isLeadership: false,
                unavailable: false
            })
        ).toBe("admin")
    })

    it("is admin_unavailable for an unavailable non-leadership person", () => {
        expect(
            personTone({
                counts: false,
                isLeadership: false,
                unavailable: true
            })
        ).toBe("admin_unavailable")
    })

    it("is leadership_covering for a counting leadership person", () => {
        expect(
            personTone({ counts: true, isLeadership: true, unavailable: false })
        ).toBe("leadership_covering")
    })

    it("is leadership for a non-counting leadership person", () => {
        expect(
            personTone({
                counts: false,
                isLeadership: true,
                unavailable: false
            })
        ).toBe("leadership")
    })

    it("is other for a non-admin, non-leadership person", () => {
        expect(
            personTone({
                counts: false,
                isLeadership: false,
                unavailable: false
            })
        ).toBe("other")
    })
})
