import { describe, expect, it } from "vitest"
import {
    buildCalendarLinks,
    calendarFeedPath,
    isCalendarKind,
    toWebcalUrl
} from "./calendar-links"

describe("calendar-links", () => {
    it("builds feed paths per kind", () => {
        expect(calendarFeedPath("abc", "personal")).toBe(
            "/api/calendar/abc/personal.ics"
        )
        expect(calendarFeedPath("abc", "friends")).toBe(
            "/api/calendar/abc/friends.ics"
        )
    })

    it("converts http(s) to webcal", () => {
        expect(toWebcalUrl("https://x.com/a.ics")).toBe("webcal://x.com/a.ics")
        expect(toWebcalUrl("http://localhost:3000/a.ics")).toBe(
            "webcal://localhost:3000/a.ics"
        )
    })

    it("builds both links from an origin, trimming trailing slashes", () => {
        const links = buildCalendarLinks("tok", "https://bsd.test/")
        expect(links.personal.url).toBe(
            "https://bsd.test/api/calendar/tok/personal.ics"
        )
        expect(links.friends.webcalUrl).toBe(
            "webcal://bsd.test/api/calendar/tok/friends.ics"
        )
    })

    it("validates kinds", () => {
        expect(isCalendarKind("personal")).toBe(true)
        expect(isCalendarKind("friends")).toBe(true)
        expect(isCalendarKind("other")).toBe(false)
    })
})
