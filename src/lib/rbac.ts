import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { commissioners, sessions, teams, users } from "@/database/schema"
import { getSeasonConfig } from "@/lib/site-config"

export async function getSessionUserId(): Promise<string | null> {
    const session = await auth.api.getSession({ headers: await headers() })
    return session?.user?.id ?? null
}

export async function isAdminOrDirector(userId: string): Promise<boolean> {
    const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    return user?.role === "admin" || user?.role === "director"
}

export async function isAdminOrDirectorBySession(): Promise<boolean> {
    const userId = await getSessionUserId()
    if (!userId) {
        return false
    }

    return isAdminOrDirector(userId)
}

export async function isCommissionerForSeason(
    userId: string,
    seasonId: number
): Promise<boolean> {
    const [commissionerRecord] = await db
        .select({ id: commissioners.id })
        .from(commissioners)
        .where(
            and(
                eq(commissioners.season, seasonId),
                eq(commissioners.commissioner, userId)
            )
        )
        .limit(1)

    return !!commissionerRecord
}

export async function isCommissionerForCurrentSeason(
    userId: string
): Promise<boolean> {
    const config = await getSeasonConfig()
    if (!config.seasonId) {
        return false
    }

    return isCommissionerForSeason(userId, config.seasonId)
}

export async function isCaptainForSeason(
    userId: string,
    seasonId: number
): Promise<boolean> {
    const [captainRecord] = await db
        .select({ id: teams.id })
        .from(teams)
        .where(and(eq(teams.season, seasonId), eq(teams.captain, userId)))
        .limit(1)

    return !!captainRecord
}

export async function isCommissionerBySession(): Promise<boolean> {
    const userId = await getSessionUserId()
    if (!userId) {
        return false
    }

    const isAdmin = await isAdminOrDirector(userId)
    if (isAdmin) {
        return true
    }

    return isCommissionerForCurrentSeason(userId)
}

export async function hasAdministrativeAccessBySession(): Promise<boolean> {
    const userId = await getSessionUserId()
    if (!userId) {
        return false
    }

    const isAdmin = await isAdminOrDirector(userId)
    if (isAdmin) {
        return true
    }

    const config = await getSeasonConfig()
    if (!config.seasonId) {
        return false
    }

    const [isCommissioner, isCaptain] = await Promise.all([
        isCommissionerForSeason(userId, config.seasonId),
        isCaptainForSeason(userId, config.seasonId)
    ])

    return isCommissioner || isCaptain
}

export async function hasViewSignupsAccessBySession(): Promise<boolean> {
    return hasAdministrativeAccessBySession()
}

export async function invalidateAllSessionsForUser(
    userId: string
): Promise<void> {
    await db.delete(sessions).where(eq(sessions.userId, userId))
}
