"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { users, drafts, teams, seasons } from "@/database/schema"
import { eq, sql, count, max, desc } from "drizzle-orm"

async function checkAdminAccess(userId: string): Promise<boolean> {
    const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    return user?.role === "admin" || user?.role === "director"
}

export interface GenderAttritionData {
    label: string
    count: number
}

export interface GenderRatio {
    male: number
    nonMale: number
    ratio: string
}

export interface CaptainAttritionData {
    captain: string
    count: number
    male: number
    nonMale: number
}

export interface CaptainAttritionAvgData {
    captain: string
    avg: number
    total: number
    seasons: number
    male: number
    nonMale: number
}

export async function getAttritionData(): Promise<{
    status: boolean
    message?: string
    genderData: GenderAttritionData[]
    attritionGenderRatio: GenderRatio | null
    overallGenderRatio: GenderRatio | null
    captainData: CaptainAttritionData[]
    captainAvgData: CaptainAttritionAvgData[]
    lastSeasonCaptainData: CaptainAttritionData[]
    lastSeasonCaptainAvgData: CaptainAttritionAvgData[]
}> {
    const empty = { genderData: [], attritionGenderRatio: null, overallGenderRatio: null, captainData: [], captainAvgData: [], lastSeasonCaptainData: [], lastSeasonCaptainAvgData: [] }

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return { status: false, message: "Not authenticated.", ...empty }
    }

    const hasAccess = await checkAdminAccess(session.user.id)
    if (!hasAccess) {
        return { status: false, message: "Access denied.", ...empty }
    }

    try {
        // Find users who have only played one season via drafts
        // Count distinct seasons per user through drafts -> teams -> seasons
        const seasonCountPerUser = db
            .selectDistinct({
                userId: drafts.user,
                seasonId: teams.season
            })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .as("season_count_per_user")

        const oneSeasonUsers = await db
            .select({
                userId: seasonCountPerUser.userId,
                seasonCount: count().as("season_count")
            })
            .from(seasonCountPerUser)
            .groupBy(seasonCountPerUser.userId)
            .having(sql`count(*) = 1`)

        const oneSeasonUserIds = oneSeasonUsers.map((r) => r.userId)

        if (oneSeasonUserIds.length === 0) {
            return { status: true, ...empty }
        }

        // Gender attrition: group one-season players by male field
        const genderRows = await db
            .select({
                male: users.male,
                count: count()
            })
            .from(users)
            .where(sql`${users.id} IN ${oneSeasonUserIds}`)
            .groupBy(users.male)

        const genderData: GenderAttritionData[] = genderRows.map((r) => ({
            label: r.male === true ? "Male" : r.male === false ? "Not Male" : "Unknown",
            count: r.count
        }))

        // Attrition gender ratio from the chart data
        const attrMale = genderData.find((g) => g.label === "Male")?.count || 0
        const attrNonMale = genderData.find((g) => g.label === "Not Male")?.count || 0
        const attritionGenderRatio: GenderRatio | null = attrNonMale > 0
            ? { male: attrMale, nonMale: attrNonMale, ratio: (attrMale / attrNonMale).toFixed(2) }
            : attrMale > 0
              ? { male: attrMale, nonMale: 0, ratio: "N/A" }
              : null

        // Overall gender ratio across all drafted players
        const overallGenderRows = await db
            .select({
                male: users.male,
                count: count()
            })
            .from(drafts)
            .innerJoin(users, eq(drafts.user, users.id))
            .groupBy(users.male)

        const overallMale = overallGenderRows.find((r) => r.male === true)?.count || 0
        const overallNonMale = overallGenderRows.find((r) => r.male === false)?.count || 0
        const overallGenderRatio: GenderRatio | null = overallNonMale > 0
            ? { male: overallMale, nonMale: overallNonMale, ratio: (overallMale / overallNonMale).toFixed(2) }
            : overallMale > 0
              ? { male: overallMale, nonMale: 0, ratio: "N/A" }
              : null

        // Captain attrition: for each one-season player, find captain and player gender
        const captainPlayerRows = await db
            .select({
                captainId: teams.captain,
                playerMale: sql<boolean | null>`(select male from users pu where pu.id = ${drafts.user})`
            })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .where(sql`${drafts.user} IN ${oneSeasonUserIds}`)

        // Aggregate by captain
        const captainAgg = new Map<string, { count: number; male: number; nonMale: number }>()
        for (const row of captainPlayerRows) {
            const entry = captainAgg.get(row.captainId) || { count: 0, male: 0, nonMale: 0 }
            entry.count++
            if (row.playerMale === true) entry.male++
            else if (row.playerMale === false) entry.nonMale++
            captainAgg.set(row.captainId, entry)
        }

        // Sort by count, take top 20
        const topCaptainIds = [...captainAgg.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 20)
            .map(([id]) => id)

        // Fetch captain names
        const captainNameRows = topCaptainIds.length > 0
            ? await db
                .select({
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preffered_name
                })
                .from(users)
                .where(sql`${users.id} IN ${topCaptainIds}`)
            : []

        const captainNameMap = new Map(
            captainNameRows.map((r) => [r.id, `${r.preferredName || r.firstName} ${r.lastName}`])
        )

        const captainData: CaptainAttritionData[] = topCaptainIds.map((id) => {
            const agg = captainAgg.get(id)!
            return {
                captain: captainNameMap.get(id) || "Unknown",
                count: agg.count,
                male: agg.male,
                nonMale: agg.nonMale
            }
        })

        // Count how many seasons each captain has captained
        const allCaptainIds = [...new Set([...captainAgg.keys()])]
        const captainSeasonRows = allCaptainIds.length > 0
            ? await db
                .selectDistinct({
                    captainId: teams.captain,
                    seasonId: teams.season
                })
                .from(teams)
                .where(sql`${teams.captain} IN ${allCaptainIds}`)
            : []

        const captainSeasonCount = new Map<string, number>()
        for (const row of captainSeasonRows) {
            captainSeasonCount.set(row.captainId, (captainSeasonCount.get(row.captainId) || 0) + 1)
        }

        // Compute per-season average for one-season captain data
        const captainAvgEntries = topCaptainIds.map((id) => {
            const agg = captainAgg.get(id)!
            const seasonCount = captainSeasonCount.get(id) || 1
            return {
                captain: captainNameMap.get(id) || "Unknown",
                avg: Math.round((agg.count / seasonCount) * 100) / 100,
                total: agg.count,
                seasons: seasonCount,
                male: agg.male,
                nonMale: agg.nonMale
            }
        })
        const captainAvgData: CaptainAttritionAvgData[] = captainAvgEntries
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 20)

        // Find the most recent season that has drafts
        const [latestDraftSeason] = await db
            .select({ seasonId: max(teams.season) })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))

        const latestSeasonId = latestDraftSeason?.seasonId

        let lastSeasonCaptainData: CaptainAttritionData[] = []
        let lastSeasonCaptainAvgData: CaptainAttritionAvgData[] = []

        if (latestSeasonId) {
            // Find all users who played in the most recent season
            const currentPlayersSub = db
                .selectDistinct({ userId: drafts.user })
                .from(drafts)
                .innerJoin(teams, eq(drafts.team, teams.id))
                .where(eq(teams.season, latestSeasonId))

            // For players NOT in the most recent season, find their last season's team/captain
            // Step 1: get the max season each non-current player played in
            const lastSeasonPerUser = db
                .select({
                    userId: drafts.user,
                    maxSeason: max(teams.season).as("max_season")
                })
                .from(drafts)
                .innerJoin(teams, eq(drafts.team, teams.id))
                .where(sql`${drafts.user} NOT IN ${currentPlayersSub}`)
                .groupBy(drafts.user)
                .as("last_season_per_user")

            // Step 2: join back to get the captain and player gender
            const lapsedPlayerRows = await db
                .select({
                    captainId: teams.captain,
                    playerMale: sql<boolean | null>`(select male from users pu where pu.id = ${lastSeasonPerUser.userId})`
                })
                .from(lastSeasonPerUser)
                .innerJoin(
                    drafts,
                    sql`${drafts.user} = ${lastSeasonPerUser.userId}`
                )
                .innerJoin(
                    teams,
                    sql`${teams.id} = ${drafts.team} AND ${teams.season} = ${lastSeasonPerUser.maxSeason}`
                )

            const lapsedAgg = new Map<string, { count: number; male: number; nonMale: number }>()
            for (const row of lapsedPlayerRows) {
                const entry = lapsedAgg.get(row.captainId) || { count: 0, male: 0, nonMale: 0 }
                entry.count++
                if (row.playerMale === true) entry.male++
                else if (row.playerMale === false) entry.nonMale++
                lapsedAgg.set(row.captainId, entry)
            }

            const topLapsedCaptainIds = [...lapsedAgg.entries()]
                .sort((a, b) => b[1].count - a[1].count)
                .slice(0, 20)
                .map(([id]) => id)

            const lapsedCaptainNameRows = topLapsedCaptainIds.length > 0
                ? await db
                    .select({
                        id: users.id,
                        firstName: users.first_name,
                        lastName: users.last_name,
                        preferredName: users.preffered_name
                    })
                    .from(users)
                    .where(sql`${users.id} IN ${topLapsedCaptainIds}`)
                : []

            const lapsedNameMap = new Map(
                lapsedCaptainNameRows.map((r) => [r.id, `${r.preferredName || r.firstName} ${r.lastName}`])
            )

            lastSeasonCaptainData = topLapsedCaptainIds.map((id) => {
                const agg = lapsedAgg.get(id)!
                return {
                    captain: lapsedNameMap.get(id) || "Unknown",
                    count: agg.count,
                    male: agg.male,
                    nonMale: agg.nonMale
                }
            })

            // Compute per-season average for lapsed captain data
            const lapsedAllIds = [...new Set([...lapsedAgg.keys()])]
            const missingIds = lapsedAllIds.filter((id) => !captainSeasonCount.has(id))
            if (missingIds.length > 0) {
                const extraRows = await db
                    .selectDistinct({
                        captainId: teams.captain,
                        seasonId: teams.season
                    })
                    .from(teams)
                    .where(sql`${teams.captain} IN ${missingIds}`)

                for (const row of extraRows) {
                    captainSeasonCount.set(row.captainId, (captainSeasonCount.get(row.captainId) || 0) + 1)
                }
            }

            const lapsedAvgEntries = topLapsedCaptainIds.map((id) => {
                const agg = lapsedAgg.get(id)!
                const seasonCount = captainSeasonCount.get(id) || 1
                return {
                    captain: lapsedNameMap.get(id) || "Unknown",
                    avg: Math.round((agg.count / seasonCount) * 100) / 100,
                    total: agg.count,
                    seasons: seasonCount,
                    male: agg.male,
                    nonMale: agg.nonMale
                }
            })
            lastSeasonCaptainAvgData = lapsedAvgEntries
                .sort((a, b) => b.avg - a.avg)
                .slice(0, 20)
        }

        return { status: true, genderData, attritionGenderRatio, overallGenderRatio, captainData, captainAvgData, lastSeasonCaptainData, lastSeasonCaptainAvgData }
    } catch (error) {
        console.error("Error fetching attrition data:", error)
        return { status: false, message: "Something went wrong.", ...empty }
    }
}
