import { type NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { buildCalendar } from "@/lib/calendar-feed"
import { getSeasonConfig } from "@/lib/site-config"

export const runtime = "nodejs"

/**
 * One-off .ics download for the signed-in user (`?kind=personal|friends`).
 * The always-current subscription variant of the same calendars lives at
 * /api/calendar/[token]/[kind] and is token-authenticated instead.
 */
export async function GET(request: NextRequest) {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return NextResponse.json(
            { error: "Not authenticated" },
            { status: 401 }
        )
    }

    const config = await getSeasonConfig()
    if (!config.seasonId) {
        return NextResponse.json({ error: "No active season" }, { status: 404 })
    }

    const kind =
        request.nextUrl.searchParams.get("kind") === "friends"
            ? "friends"
            : "personal"

    const calendar = await buildCalendar(kind, session.user.id, config.seasonId)
    if (!calendar) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return new NextResponse(calendar.ics, {
        status: 200,
        headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": `attachment; filename="${calendar.filename}"`
        }
    })
}
