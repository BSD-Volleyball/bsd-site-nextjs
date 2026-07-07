import { describe, expect, it } from "vitest"
import {
    addMinutes,
    buildICalendar,
    type CalendarEvent,
    parseTime,
    VENUE_LOCATION
} from "@/lib/generate-ical"

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
    return {
        uid: "match-1@bsd",
        summary: "BSD Match",
        description: "Week 1 match",
        location: VENUE_LOCATION,
        dateStr: "20260912",
        startTime: "19:00",
        endTime: "20:10",
        ...overrides
    }
}

describe("parseTime", () => {
    it("parses HH:mm and HH:mm:ss", () => {
        expect(parseTime("19:05")).toEqual({ hour: 19, minute: 5 })
        expect(parseTime("07:30:00")).toEqual({ hour: 7, minute: 30 })
    })

    it("defaults missing minutes to zero", () => {
        expect(parseTime("8")).toEqual({ hour: 8, minute: 0 })
    })
})

describe("addMinutes", () => {
    it("adds within the hour and across hours", () => {
        expect(addMinutes(19, 0, 70)).toEqual({ hour: 20, minute: 10 })
        expect(addMinutes(9, 45, 30)).toEqual({ hour: 10, minute: 15 })
    })

    it("wraps past midnight", () => {
        expect(addMinutes(23, 30, 60)).toEqual({ hour: 0, minute: 30 })
    })
})

describe("buildICalendar", () => {
    it("produces a calendar wrapper with the New York timezone", () => {
        const ics = buildICalendar([])
        expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true)
        expect(ics.endsWith("END:VCALENDAR")).toBe(true)
        expect(ics).toContain("BEGIN:VTIMEZONE")
        expect(ics).toContain("TZID:America/New_York")
    })

    it("uses CRLF line endings per RFC 5545", () => {
        const ics = buildICalendar([event()])
        expect(ics).toContain("\r\n")
        // No bare \n outside of CRLF pairs
        expect(ics.replace(/\r\n/g, "").includes("\n")).toBe(false)
    })

    it("emits one VEVENT per event with zoned start and end", () => {
        const ics = buildICalendar([
            event(),
            event({ uid: "match-2@bsd", startTime: "20:10", endTime: "21:20" })
        ])
        expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
        expect(ics).toContain("DTSTART;TZID=America/New_York:20260912T190000")
        expect(ics).toContain("DTEND;TZID=America/New_York:20260912T201000")
    })

    it("escapes commas and semicolons in text fields", () => {
        const ics = buildICalendar([
            event({ summary: "Aces vs Diggers; Court 1, early" })
        ])
        expect(ics).toContain("SUMMARY:Aces vs Diggers\\; Court 1\\, early")
    })

    it("folds lines longer than 75 octets with a leading space", () => {
        const longSummary = "A".repeat(120)
        const ics = buildICalendar([event({ summary: longSummary })])
        const folded = ics.split("\r\n").filter((line) => line.startsWith(" "))
        expect(folded.length).toBeGreaterThan(0)
        for (const line of ics.split("\r\n")) {
            expect(line.length).toBeLessThanOrEqual(75)
        }
    })
})
