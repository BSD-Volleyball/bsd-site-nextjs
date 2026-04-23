import { Liveblocks } from "@liveblocks/node"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { db } from "@/database/db"
import { users, teams } from "@/database/schema"
import { and, eq, or } from "drizzle-orm"
import {
    isAdminOrDirector,
    isCommissionerForCurrentSeason,
    isCaptainForSeason,
    getCommissionerDivisionScope
} from "@/lib/rbac"
import { getSeasonConfig } from "@/lib/site-config"

export async function POST() {
    const liveblocks = new Liveblocks({
        secret: process.env.LIVEBLOCKS_SECRET_KEY!
    })

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

    // Always look up captain team IDs — even for admins/commissioners — so the
    // client can enforce captain-level restrictions in divisions where the user
    // is a captain (captain role takes priority over commissioner in those divisions).
    const captainTeams = await db
        .select({ id: teams.id, division: teams.division })
        .from(teams)
        .where(
            and(
                eq(teams.season, seasonId),
                or(eq(teams.captain, userId), eq(teams.captain2, userId))
            )
        )
    const captainTeamIds = captainTeams.map((t) => t.id)
    const captainDivisionIds = [...new Set(captainTeams.map((t) => t.division))]

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

    // Scope write access to divisions this user actually has authority over.
    // Admins + league-wide commissioners: all divisions in the season.
    // Division-specific commissioners: only their assigned divisions.
    // Captains: only divisions of teams they captain.
    // Everyone authorized still gets read-only visibility on other division rooms
    // so the draft UI can reflect cross-division context.
    const commScope = isCommissioner
        ? await getCommissionerDivisionScope(userId, seasonId)
        : ({ type: "denied" } as const)
    const hasLeagueWideWrite = isAdmin || commScope.type === "league_wide"

    if (hasLeagueWideWrite) {
        liveblocksSession.allow(`draft-s${seasonId}-d*`, ["room:write"])
    } else {
        const writableDivisionIds = new Set<number>()
        if (commScope.type === "division_specific") {
            for (const d of commScope.divisionIds) writableDivisionIds.add(d)
        }
        for (const d of captainDivisionIds) writableDivisionIds.add(d)

        for (const divisionId of writableDivisionIds) {
            liveblocksSession.allow(`draft-s${seasonId}-d${divisionId}`, [
                "room:write"
            ])
        }
        // Read-only on all other draft rooms in the season.
        liveblocksSession.allow(`draft-s${seasonId}-d*`, ["room:read"])
    }

    const { body, status } = await liveblocksSession.authorize()
    return new NextResponse(body, { status })
}
