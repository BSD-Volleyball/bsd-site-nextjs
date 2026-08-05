import type { Metadata } from "next"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    DivisionLabel,
    MatchBlock
} from "@/app/dashboard/tournament-schedule-view/schedule-view"
import { PoolStandingsTable } from "@/components/tournament/pool-standings-table"
import type { PoolStandingRow } from "@/lib/tournament-standings"
import { getTournamentPoolPlay } from "./actions"

export const metadata: Metadata = {
    title: "Tournament Pool Play"
}

export const dynamic = "force-dynamic"

export default async function TournamentPoolPlayPage({
    params
}: {
    params: Promise<{ tournamentId: string }>
}) {
    await requireSessionOrRedirect()

    const { tournamentId } = await params
    const result = await getTournamentPoolPlay(parseInt(tournamentId, 10))

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Tournament Pool Play"
                    description="Pool standings and match results."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load pool play results."}
                </StatusBanner>
            </div>
        )
    }

    const { tournamentLabel, view, poolStandings } = result.data

    // poolId -> USAV-ordered standings rows, for interleaving with pool matches.
    const standingsByPool = new Map<number, PoolStandingRow[]>()
    for (const division of poolStandings) {
        for (const pool of division.pools) {
            standingsByPool.set(pool.poolId, pool.rows)
        }
    }

    const poolDivisions = view.divisions.filter((d) => d.pools.length > 0)

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${tournamentLabel} — Pool Play`}
                description="Pool standings and match results by division."
            />

            {poolDivisions.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No pool play matches recorded for this tournament.
                </div>
            ) : (
                poolDivisions.map((division) => (
                    <div key={division.id} className="space-y-3">
                        <DivisionLabel name={division.name} />
                        <div className="grid items-start gap-4 lg:grid-cols-2">
                            {division.pools.map((pool) => (
                                <Card key={pool.id}>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base">
                                            {pool.name}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <PoolStandingsTable
                                            rows={
                                                standingsByPool.get(pool.id) ??
                                                []
                                            }
                                        />
                                        <div className="space-y-2">
                                            {pool.matches.map((match) => (
                                                <MatchBlock
                                                    key={match.id}
                                                    match={match}
                                                    myTeamId={null}
                                                />
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                ))
            )}
        </div>
    )
}
