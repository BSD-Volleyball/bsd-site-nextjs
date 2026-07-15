import { PageHeader } from "@/components/layout/page-header"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { db } from "@/database/db"
import { drafts, teams, seasons, divisions } from "@/database/schema"
import { eq, desc } from "drizzle-orm"
import type { Metadata } from "next"
import { getEloLeaderboard, getPersonalAnalytics } from "@/lib/player-elo-data"
import { CareerStatsCards } from "./career-stats-cards"
import { DivisionHistoryChart } from "./division-history-chart"
import { EloLeaderboard } from "./elo-leaderboard"
import { EloTrendChart } from "./elo-trend-chart"

const LEADERBOARD_MIN_MATCHES = 10

// League-wide leaderboard is built but not launched yet; flip to re-enable.
const SHOW_LEAGUE_SECTION = false

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
    const session = await requireSessionOrRedirect()

    const [divisionHistory, allSeasons, personal, leaderboard] =
        await Promise.all([
            getDivisionHistory(session.user.id),
            getAllSeasons(),
            getPersonalAnalytics(session.user.id),
            SHOW_LEAGUE_SECTION
                ? getEloLeaderboard(25, LEADERBOARD_MIN_MATCHES)
                : Promise.resolve([])
        ])

    return (
        <div className="space-y-6">
            <PageHeader
                title="Analytics"
                description="Your career stats and skill rating."
            />
            <div className="grid gap-6 lg:grid-cols-2">
                <DivisionHistoryChart
                    divisionHistory={divisionHistory}
                    allSeasons={allSeasons}
                />
                <EloTrendChart
                    eloHistory={personal.eloHistory}
                    allSeasons={allSeasons}
                />
            </div>
            <CareerStatsCards personal={personal} />
            {SHOW_LEAGUE_SECTION && (
                <div>
                    <h2 className="mb-3 font-semibold text-lg">League</h2>
                    <EloLeaderboard
                        rows={leaderboard}
                        currentUserId={session.user.id}
                        minMatches={LEADERBOARD_MIN_MATCHES}
                    />
                </div>
            )}
        </div>
    )
}
