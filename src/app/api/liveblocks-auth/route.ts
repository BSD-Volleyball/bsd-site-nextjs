import { Liveblocks } from "@liveblocks/node"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { db } from "@/database/db"
import { users, teams } from "@/database/schema"
import { and, eq } from "drizzle-orm"
import {
    isAdminOrDirector,
    isCommissionerForCurrentSeason,
    isCaptainForSeason
} from "@/lib/rbac"
import { getSeasonConfig } from "@/lib/site-config"

const liveblocks = new Liveblocks({
    secret: process.env.LIVEBLOCKS_SECRET_KEY!
})

export async function POST() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return NextResponse.json({ error: "No active season" }, { status: 403 })
    }

    const seasonId = config.seasonId

    const [isAdmin, isCommissioner, isCaptain] = await Promise.all([
        isAdminOrDirector(userId),
        isCommissionerForCurrentSeason(userId),
        isCaptainForSeason(userId, seasonId)
    ])

    if (!isAdmin && !isCommissioner && !isCaptain) {
        return NextResponse.json(
            { error: "No access to draft" },
            { status: 403 }
        )
    }

    const role =
        isAdmin || isCommissioner ? "commissioner" : ("captain" as const)

    // Look up captain's team IDs for the current season (empty for commissioners)
    let captainTeamIds: number[] = []
    if (role === "captain") {
        const captainTeams = await db
            .select({ id: teams.id })
            .from(teams)
            .where(and(eq(teams.season, seasonId), eq(teams.captain, userId)))
        captainTeamIds = captainTeams.map((t) => t.id)
    }

    // Get user display name
    const [user] = await db
        .select({ first_name: users.first_name, last_name: users.last_name })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    const displayName = user
        ? `${user.first_name} ${user.last_name}`
        : "Unknown"

    const liveblocksSession = liveblocks.prepareSession(userId, {
        userInfo: {
            name: displayName,
            role,
            captainTeamIds
        }
    })

    // Both commissioners and captains get write access; column restrictions are enforced in the UI
    liveblocksSession.allow(`draft-s${seasonId}-d*`, ["room:write"])

    const { body, status } = await liveblocksSession.authorize()
    return new NextResponse(body, { status })
}
