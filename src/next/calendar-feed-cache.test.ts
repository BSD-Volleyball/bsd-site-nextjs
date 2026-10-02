import { beforeEach, describe, expect, it, vi } from "vitest"

// The unit project aliases @/database/db to a guard that throws, so the lib
// loaders are mocked here. What these tests pin down is the glue: a token the
// snapshot knows is served without any live lookup, and a token minted after
// the snapshot was built falls back to one live read and refreshes the tag.

const {
    revalidateTag,
    findUserIdByCalendarToken,
    buildCalendar,
    getSeasonConfig,
    loadCalendarSnapshot,
    warn
} = vi.hoisted(() => ({
    revalidateTag: vi.fn(),
    findUserIdByCalendarToken: vi.fn(),
    buildCalendar: vi.fn(),
    getSeasonConfig: vi.fn(),
    loadCalendarSnapshot: vi.fn(),
    warn: vi.fn()
}))

vi.mock("next/cache", () => ({
    unstable_cache: (fn: unknown) => fn,
    revalidateTag
}))
vi.mock("@/lib/calendar-token", () => ({ findUserIdByCalendarToken }))
vi.mock("@/lib/calendar-feed", () => ({
    buildCalendar,
    emptyCalendar: (kind: string) => `BEGIN:VCALENDAR ${kind} END:VCALENDAR`
}))
vi.mock("@/lib/site-config", () => ({ getSeasonConfig }))
vi.mock("@/lib/logger", () => ({ logger: { warn } }))
vi.mock("@/lib/calendar-snapshot", async () => {
    const actual = await vi.importActual<
        typeof import("@/lib/calendar-snapshot")
    >("@/lib/calendar-snapshot")
    return { ...actual, loadCalendarSnapshot }
})

const KNOWN = "A".repeat(43)
const MINTED_LATER = "B".repeat(43)
const GARBAGE = "C".repeat(43)

beforeEach(() => {
    vi.clearAllMocks()
    // A between-seasons snapshot keeps the rendering trivial: the known
    // token resolves to the empty calendar without any schedule data.
    loadCalendarSnapshot.mockResolvedValue({
        seasonId: null,
        owners: { [KNOWN]: "u-known" },
        friends: {},
        bundle: null
    })
})

describe("getCachedCalendarFeed", () => {
    it("serves a token the snapshot knows without a live lookup", async () => {
        const { getCachedCalendarFeed } = await import("./calendar-feed-cache")
        const feed = await getCachedCalendarFeed(KNOWN, "personal")
        expect(feed?.ics).toContain("BEGIN:VCALENDAR")
        expect(findUserIdByCalendarToken).not.toHaveBeenCalled()
        expect(revalidateTag).not.toHaveBeenCalled()
    })

    it("falls back to a live build for a token minted after the snapshot and refreshes it", async () => {
        findUserIdByCalendarToken.mockResolvedValue("u-new")
        getSeasonConfig.mockResolvedValue({ seasonId: 7 })
        buildCalendar.mockResolvedValue({
            ics: "LIVE",
            filename: "bsd-schedule-fall-2026.ics"
        })
        const { CALENDAR_FEED_TAG, getCachedCalendarFeed } = await import(
            "./calendar-feed-cache"
        )
        const feed = await getCachedCalendarFeed(MINTED_LATER, "personal")
        expect(feed).toEqual({
            ics: "LIVE",
            filename: "bsd-schedule-fall-2026.ics"
        })
        expect(buildCalendar).toHaveBeenCalledWith("personal", "u-new", 7)
        expect(revalidateTag).toHaveBeenCalledWith(CALENDAR_FEED_TAG, "max")
    })

    it("returns null for an unknown token without touching the tag", async () => {
        findUserIdByCalendarToken.mockResolvedValue(null)
        const { getCachedCalendarFeed } = await import("./calendar-feed-cache")
        expect(await getCachedCalendarFeed(GARBAGE, "personal")).toBeNull()
        expect(revalidateTag).not.toHaveBeenCalled()
    })

    it("warns when the snapshot nears the data cache's 2 MB entry limit", async () => {
        // Above the limit the cache silently stops storing the entry and every
        // poll is back to a database read, so the approach must announce it.
        loadCalendarSnapshot.mockResolvedValue({
            seasonId: 7,
            owners: { [KNOWN]: "u-known" },
            friends: { "u-known": [] },
            bundle: {
                items: [],
                placeholders: [],
                people: [
                    {
                        userId: "u-known",
                        firstName: "x".repeat(1_100_000),
                        lastName: "",
                        preferredName: null
                    }
                ],
                seasonLabel: "Fall 2026",
                seasonYear: 2026
            }
        })
        const { getCachedCalendarSnapshot } = await import(
            "./calendar-feed-cache"
        )
        await getCachedCalendarSnapshot()
        expect(warn).toHaveBeenCalledWith(
            "Calendar snapshot is approaching the 2 MB cache entry limit",
            expect.objectContaining({ bytes: expect.any(Number) })
        )
    })
})
