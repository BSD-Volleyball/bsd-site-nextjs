import type { Metadata } from "next"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    DivisionBracket,
    DivisionLabel,
    MatchBlock
} from "@/app/dashboard/tournament-schedule-view/schedule-view"
import { TournamentPlacementsCard } from "@/components/tournament/tournament-placements-card"
import { PoolStandingsTable } from "@/components/tournament/pool-standings-table"
import type { PoolStandingRow } from "@/lib/tournament-standings"
import { getTournamentResults } from "./actions"

export const metadata: Metadata = {
    title: "Tournament Results"
}

export const dynamic = "force-dynamic"

function SectionHeading({ children }: { children: React.ReactNode }) {
    return <h2 className="font-semibold text-lg tracking-tight">{children}</h2>
}

export default async function TournamentResultsPage({
    params
}: {
    params: Promise<{ tournamentId: string }>
}) {
    await requireSessionOrRedirect()

    const { tournamentId } = await params
    const result = await getTournamentResults(parseInt(tournamentId, 10))

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Tournament Results"
                    description="Final rankings, pool play, and playoff results."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load tournament results."}
                </StatusBanner>
            </div>
        )
    }

    const { tournamentLabel, view, poolStandings, placements } = result.data

    // poolId -> USAV-ordered standings rows, for interleaving with pool matches.
    const standingsByPool = new Map<number, PoolStandingRow[]>()
    for (const division of poolStandings) {
        for (const pool of division.pools) {
            standingsByPool.set(pool.poolId, pool.rows)
        }
    }

    const poolDivisions = view.divisions.filter((d) => d.pools.length > 0)
    const bracketDivisions = view.divisions.filter(
        (d) => d.bracketGroups.length > 0
    )

    return (
        <div className="space-y-10">
            <PageHeader
                title={tournamentLabel}
                description="Final rankings, pool play, and playoff results by division."
            />

            <section className="space-y-4">
                <SectionHeading>Final Rankings</SectionHeading>
                <TournamentPlacementsCard divisions={placements} />
            </section>

            {view.hasPoolMatches && (
                <section className="space-y-5">
                    <SectionHeading>Pool Play</SectionHeading>
                    {poolDivisions.map((division) => (
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
                                                    standingsByPool.get(
                                                        pool.id
                                                    ) ?? []
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
                    ))}
                </section>
            )}

            {view.hasBracketMatches && (
                <section className="space-y-5">
                    <div className="flex items-center gap-2">
                        <SectionHeading>Playoffs</SectionHeading>
                        <span className="text-muted-foreground text-xs">
                            {view.eliminationFormat === "double"
                                ? "Double elimination"
                                : "Single elimination"}
                        </span>
                    </div>
                    {bracketDivisions.map((division) => (
                        <div key={division.id} className="space-y-3">
                            <DivisionLabel name={division.name} />
                            <DivisionBracket
                                groups={division.bracketGroups}
                                myTeamId={null}
                            />
                        </div>
                    ))}
                </section>
            )}
        </div>
    )
}
