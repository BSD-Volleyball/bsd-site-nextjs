import { describe, expect, it } from "vitest"
import { buildCoverageDigestHtml } from "@/lib/email-html"
import type { CoverageDate } from "./types"

const DAY: CoverageDate = {
    date: "2026-10-06",
    eventId: 1,
    eventType: "regular_season",
    ordinal: 4,
    label: null,
    matchCount: 6,
    status: "yellow",
    reason: "8:00 PM slot uncovered",
    orphanedPresence: [],
    slots: [
        {
            startTime: "19:00:00",
            label: "7:00 PM",
            matchCount: 3,
            people: [
                {
                    userId: "a",
                    name: "Ada <Admin>",
                    counts: true,
                    isLeadership: false,
                    unavailable: false,
                    sources: ["play", "present"],
                    presenceId: 1,
                    note: "setup"
                },
                {
                    userId: "l",
                    name: "Lee Lead",
                    counts: false,
                    isLeadership: true,
                    unavailable: false,
                    sources: ["play"],
                    presenceId: null,
                    note: null
                }
            ]
        },
        { startTime: "20:00:00", label: "8:00 PM", matchCount: 3, people: [] }
    ]
}

describe("buildCoverageDigestHtml", () => {
    const html = buildCoverageDigestHtml({
        firstName: "Josh",
        day: DAY,
        coverageUrl: "https://example.test/dashboard/coverage"
    })

    it("escapes names", () => {
        expect(html).toContain("Ada &lt;Admin&gt;")
        expect(html).not.toContain("Ada <Admin>")
    })

    it("shows the status reason and title", () => {
        expect(html).toContain("8:00 PM slot uncovered")
        expect(html).toContain("Week 4")
        expect(html).toContain("Tue, Oct 6")
    })

    it("lists tags and notes", () => {
        expect(html).toContain("playing, present: setup")
        expect(html).toContain("leadership")
        expect(html).toContain("nobody")
    })

    it("links to the coverage page", () => {
        expect(html).toContain("https://example.test/dashboard/coverage")
    })

    it("shades a counting admin green and leadership sky", () => {
        expect(html).toContain("#dcfce7")
        expect(html).toContain("#e0f2fe")
    })
})
