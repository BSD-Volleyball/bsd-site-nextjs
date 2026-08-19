import { describe, expect, it } from "vitest"
import {
    buildCalendarLinks,
    calendarFeedPath,
    googleSubscribeUrl,
    isCalendarKind,
    outlookSubscribeUrl,
    platformSubscribeUrl,
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
        const links = buildCalendarLinks("tok", {
            origin: "https://bsd.test/",
            personalName: "Josh"
        })
        expect(links.personal.url).toBe(
            "https://bsd.test/api/calendar/tok/personal.ics"
        )
        expect(links.personal.name).toBe("BSD Volleyball — Josh")
        expect(links.friends.webcalUrl).toBe(
            "webcal://bsd.test/api/calendar/tok/friends.ics"
        )
        expect(links.friends.name).toBe("BSD Volleyball — Friends")
    })

    it("validates kinds", () => {
        expect(isCalendarKind("personal")).toBe(true)
        expect(isCalendarKind("friends")).toBe(true)
        expect(isCalendarKind("other")).toBe(false)
    })

    describe("platform subscribe links", () => {
        const link = {
            url: "https://bsd.test/api/calendar/tok/friends.ics",
            webcalUrl: "webcal://bsd.test/api/calendar/tok/friends.ics",
            name: "BSD Volleyball — Friends"
        }

        it("Google uses cid with the URL-encoded webcal address", () => {
            expect(googleSubscribeUrl(link)).toBe(
                "https://calendar.google.com/calendar/u/0/r?cid=webcal%3A%2F%2Fbsd.test%2Fapi%2Fcalendar%2Ftok%2Ffriends.ics"
            )
        })

        it("Outlook.com and Microsoft 365 use addfromweb with url + name", () => {
            expect(outlookSubscribeUrl(link, "outlook")).toBe(
                "https://outlook.live.com/calendar/0/addfromweb/?url=webcal%3A%2F%2Fbsd.test%2Fapi%2Fcalendar%2Ftok%2Ffriends.ics&name=BSD+Volleyball+%E2%80%94+Friends"
            )
            expect(outlookSubscribeUrl(link, "ms365")).toMatch(
                /^https:\/\/outlook\.office\.com\/calendar\/0\/addfromweb\/\?url=webcal%3A/
            )
        })

        it("Apple is the bare webcal link", () => {
            expect(platformSubscribeUrl("apple", link)).toBe(link.webcalUrl)
            expect(platformSubscribeUrl("google", link)).toBe(
                googleSubscribeUrl(link)
            )
        })
    })
})
