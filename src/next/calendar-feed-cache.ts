import { revalidateTag, unstable_cache } from "next/cache"
import { buildCalendar, emptyCalendar } from "@/lib/calendar-feed"
import type { CalendarKind } from "@/lib/calendar-links"
import {
    loadCalendarSnapshot,
    renderCalendarFromSnapshot
} from "@/lib/calendar-snapshot"
import { findUserIdByCalendarToken } from "@/lib/calendar-token"
import { logger } from "@/lib/logger"
import { getSeasonConfig } from "@/lib/site-config"

// ---------------------------------------------------------------------------
// Calendar apps poll every subscribed feed about hourly, day and night. A
// cache keyed per feed proved useless here (2026-10-02): with twenty-odd
// feeds each missing once an hour the Neon compute was still woken every
// few minutes. The whole feed set is now served from ONE cached snapshot
// (src/lib/calendar-snapshot.ts), rebuilt hourly, so all feeds together cost
// one database read an hour. Rotating a token revalidates the tag so an old
// URL stops resolving at once. Lives in src/next because src/lib must not
// import next/cache.
// ---------------------------------------------------------------------------

export const CALENDAR_FEED_TAG = "calendar-feeds"
export const CALENDAR_FEED_MAX_AGE_SECONDS = 3600

export interface CachedCalendarFeed {
    ics: string
    filename: string
}

// Vercel's data cache refuses entries over 2 MB and the failure is silent:
// the value is simply recomputed on every call, which here means every poll
// is a database read again. Warn well before that so it is seen in the logs.
const SNAPSHOT_WARN_BYTES = 1_000_000

export const getCachedCalendarSnapshot = unstable_cache(
    async () => {
        const snapshot = await loadCalendarSnapshot()
        const bytes = JSON.stringify(snapshot).length
        if (bytes > SNAPSHOT_WARN_BYTES) {
            logger.warn(
                "Calendar snapshot is approaching the 2 MB cache entry limit",
                { bytes, tokens: Object.keys(snapshot.owners).length }
            )
        }
        return snapshot
    },
    ["calendar-snapshot"],
    { revalidate: CALENDAR_FEED_MAX_AGE_SECONDS, tags: [CALENDAR_FEED_TAG] }
)

/** The pre-snapshot path: one live build for exactly this feed. */
async function buildLiveFeed(
    userId: string,
    kind: CalendarKind
): Promise<CachedCalendarFeed | null> {
    const config = await getSeasonConfig()
    if (!config.seasonId) {
        return { ics: emptyCalendar(kind), filename: `bsd-${kind}.ics` }
    }
    const calendar = await buildCalendar(kind, userId, config.seasonId)
    return calendar ? { ics: calendar.ics, filename: calendar.filename } : null
}

export async function getCachedCalendarFeed(
    token: string,
    kind: CalendarKind
): Promise<CachedCalendarFeed | null> {
    const snapshot = await getCachedCalendarSnapshot()
    if (Object.hasOwn(snapshot.owners, token)) {
        return renderCalendarFromSnapshot(snapshot, token, kind)
    }

    // Unknown to the snapshot: a token minted since it was built, or not one
    // of ours. One live lookup settles it; a real token also refreshes the
    // snapshot so the next poll is served from it.
    const userId = await findUserIdByCalendarToken(token)
    if (!userId) return null
    revalidateTag(CALENDAR_FEED_TAG, "max")
    return buildLiveFeed(userId, kind)
}
