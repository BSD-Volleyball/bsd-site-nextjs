import { type NextRequest, NextResponse } from "next/server"
import { buildCalendar, emptyCalendar } from "@/lib/calendar-feed"
import { type CalendarKind, isCalendarKind } from "@/lib/calendar-links"
import { findUserIdByCalendarToken } from "@/lib/calendar-token"
import { getSeasonConfig } from "@/lib/site-config"

export const runtime = "nodejs"

// 32 random bytes base64url-encoded is 43 chars; allow some slack but reject
// anything that obviously isn't one of ours before touching the database.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,64}$/

function notFound(): NextResponse {
    return new NextResponse("Not found", { status: 404 })
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

    const userId = await findUserIdByCalendarToken(token)
    if (!userId) return notFound()

    const config = await getSeasonConfig()
    let ics: string
    let filename = `bsd-${kind}.ics`
    if (config.seasonId) {
        const calendar = await buildCalendar(kind, userId, config.seasonId)
        if (!calendar) return notFound()
        ics = calendar.ics
        filename = calendar.filename
    } else {
        // Between seasons: a valid empty calendar keeps subscribed clients
        // from flagging the feed as broken.
        ics = emptyCalendar(kind)
    }

    return new NextResponse(ics, {
        status: 200,
        headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": `inline; filename="${filename}"`,
            "Cache-Control": "private, max-age=300"
        }
    })
}
