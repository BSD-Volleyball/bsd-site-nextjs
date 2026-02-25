import { PageHeader } from "@/components/layout/page-header"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/database/db"
import { drafts, teams, seasons, divisions } from "@/database/schema"
import { eq, desc } from "drizzle-orm"
import type { Metadata } from "next"
import { DivisionHistoryChart } from "./division-history-chart"

export const metadata: Metadata = {
    title: "Analytics"
}

interface DivisionHistoryItem {
    seasonId: number
    seasonYear: number
    seasonName: string
    divisionName: string
    teamName: string
    round: number
    overall: number
}

interface SeasonInfo {
    id: number
    year: number
    name: string
}

async function getDivisionHistory(
    userId: string
): Promise<DivisionHistoryItem[]> {
    return db
        .select({
            seasonId: seasons.id,
            seasonYear: seasons.year,
            seasonName: seasons.season,
            divisionName: divisions.name,
            teamName: teams.name,
            round: drafts.round,
            overall: drafts.overall
        })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .innerJoin(seasons, eq(teams.season, seasons.id))
        .innerJoin(divisions, eq(teams.division, divisions.id))
        .where(eq(drafts.user, userId))
        .orderBy(seasons.year, seasons.id)
}

async function getAllSeasons(): Promise<SeasonInfo[]> {
    return db
        .select({
            id: seasons.id,
            year: seasons.year,
            name: seasons.season
        })
        .from(seasons)
        .orderBy(desc(seasons.id))
}

export default async function AnalyticsPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        redirect("/auth/sign-in")
    }

    const [divisionHistory, allSeasons] = await Promise.all([
        getDivisionHistory(session.user.id),
        getAllSeasons()
    ])

    return (
        <div className="space-y-6">
            <PageHeader
                title="Analytics"
                description="Your historical division placement by season."
            />
            <DivisionHistoryChart
                divisionHistory={divisionHistory}
                allSeasons={allSeasons}
            />
        </div>
    )
}
