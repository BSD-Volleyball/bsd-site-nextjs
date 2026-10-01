import { unstable_cache } from "next/cache"
import { buildCalendar, emptyCalendar } from "@/lib/calendar-feed"
import type { CalendarKind } from "@/lib/calendar-links"
import { findUserIdByCalendarToken } from "@/lib/calendar-token"
import { getSeasonConfig } from "@/lib/site-config"

// ---------------------------------------------------------------------------
// Calendar apps poll every subscribed feed about hourly, day and night, and
// every poll used to run three database reads. With the Neon compute on a
// 5-minute scale-to-zero timer that polling alone kept it awake. The finished
// .ics is cached per (token, kind) for an hour; rotating a token revalidates
// the tag so an old URL stops resolving at once. Lives in src/next because
// src/lib must not import next/cache.
// ---------------------------------------------------------------------------

export const CALENDAR_FEED_TAG = "calendar-feeds"
export const CALENDAR_FEED_MAX_AGE_SECONDS = 3600

export interface CachedCalendarFeed {
    ics: string
    filename: string
}

async function loadCalendarFeed(
    token: string,
    kind: CalendarKind
): Promise<CachedCalendarFeed | null> {
    const userId = await findUserIdByCalendarToken(token)
    if (!userId) return null

    const config = await getSeasonConfig()
    if (!config.seasonId) {
        // Between seasons: a valid empty calendar keeps subscribed clients
        // from flagging the feed as broken.
        return { ics: emptyCalendar(kind), filename: `bsd-${kind}.ics` }
    }

    const calendar = await buildCalendar(kind, userId, config.seasonId)
    return calendar ? { ics: calendar.ics, filename: calendar.filename } : null
}

export const getCachedCalendarFeed = unstable_cache(
    loadCalendarFeed,
    ["calendar-feed"],
    { revalidate: CALENDAR_FEED_MAX_AGE_SECONDS, tags: [CALENDAR_FEED_TAG] }
)
