import { PageHeader } from "@/components/layout/page-header"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import type { Metadata } from "next"
import {
    getAllSeasons,
    getEloLeaderboard,
    getPersonalAnalytics
} from "@/lib/player-elo-data"
import { getSeasonHistoryForUser } from "@/lib/player-season-history"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EloTrendChart } from "@/components/analytics/elo-trend-chart"
import { CareerStatsCards } from "./career-stats-cards"
import { DivisionHistoryChart } from "@/components/player-detail/division-history-chart"
import { EloLeaderboard } from "./elo-leaderboard"

const LEADERBOARD_MIN_MATCHES = 10

// League-wide leaderboard is built but not launched yet; flip to re-enable.
const SHOW_LEAGUE_SECTION = false

export const metadata: Metadata = {
    title: "Analytics"
}

export default async function AnalyticsPage() {
    const session = await requireSessionOrRedirect()

    const [divisionHistory, allSeasons, personal, leaderboard] =
        await Promise.all([
            getSeasonHistoryForUser(session.user.id),
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
                <Card className="max-w-2xl">
                    <CardHeader>
                        <CardTitle className="text-base">
                            Division History
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <DivisionHistoryChart
                            draftHistory={divisionHistory}
                            allSeasons={allSeasons}
                            emptyMessage="No division history found yet."
                            hideHeading
                        />
                    </CardContent>
                </Card>
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
