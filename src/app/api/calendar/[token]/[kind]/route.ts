import { type NextRequest, NextResponse } from "next/server"
import { type CalendarKind, isCalendarKind } from "@/lib/calendar-links"
import {
    CALENDAR_FEED_MAX_AGE_SECONDS,
    getCachedCalendarFeed
} from "@/next/calendar-feed-cache"

// 32 random bytes base64url-encoded is 43 chars; allow some slack but reject
// anything that obviously isn't one of ours before touching the database.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,64}$/

function notFound(): NextResponse {
    return new NextResponse("Not found", {
        status: 404,
        headers: { "Cache-Control": "no-store" }
    })
}

function parseKind(segment: string): CalendarKind | null {
    if (!segment.endsWith(".ics")) return null
    const kind = segment.slice(0, -".ics".length)
    return isCalendarKind(kind) ? kind : null
}

/**
 * Public iCalendar subscription feed. The token in the path is the whole
 * credential — calendar apps fetch with no session — so every failure is a
 * bare 404 and nothing distinguishes "bad token" from "bad path".
 *
 * The feed body comes from getCachedCalendarFeed (one database build per
 * token per hour) and the public s-maxage lets Vercel's CDN answer repeat
 * polls without invoking this function at all. Both exist to keep calendar
 * pollers from waking the Neon compute every few minutes overnight.
 *
 * Infra note: the fetchers (Google-Calendar-Importer, Apple dataaccessd,
 * Outlook) are not browsers and cannot pass a JS challenge, so the Vercel
 * WAF has a custom "Calendar feeds bypass" rule (GET /api/calendar/*) placed
 * above the geo rule and the Bot Protection managed ruleset. Without it the
 * feed is 429-challenged and subscribed calendars silently stay empty.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ token: string; kind: string }> }
) {
    const { token, kind: kindSegment } = await params
    const kind = parseKind(kindSegment)
    if (!kind || !TOKEN_SHAPE.test(token)) return notFound()

    const feed = await getCachedCalendarFeed(token, kind)
    if (!feed) return notFound()

    return new NextResponse(feed.ics, {
        status: 200,
        headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": `inline; filename="${feed.filename}"`,
            "Cache-Control": `public, s-maxage=${CALENDAR_FEED_MAX_AGE_SECONDS}, stale-while-revalidate=${CALENDAR_FEED_MAX_AGE_SECONDS}`
        }
    })
}
