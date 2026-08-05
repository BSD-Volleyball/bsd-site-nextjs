import type { Metadata } from "next"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DivisionLabel } from "@/app/dashboard/tournament-schedule-view/schedule-view"
import { getTournamentRosters } from "./actions"

export const metadata: Metadata = {
    title: "Tournament Rosters"
}

export const dynamic = "force-dynamic"

export default async function TournamentRostersPage({
    params
}: {
    params: Promise<{ tournamentId: string }>
}) {
    await requireSessionOrRedirect()

    const { tournamentId } = await params
    const result = await getTournamentRosters(parseInt(tournamentId, 10))

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Tournament Rosters"
                    description="Teams and players by division."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load tournament rosters."}
                </StatusBanner>
            </div>
        )
    }

    const { tournamentLabel, divisions } = result.data

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${tournamentLabel} — Rosters`}
                description="Teams and players by division."
            />

            {divisions.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No rosters recorded for this tournament.
                </div>
            ) : (
                divisions.map((division) => (
                    <div key={division.id} className="space-y-3">
                        <DivisionLabel name={division.name} />
                        <div className="grid items-start gap-4 lg:grid-cols-2">
                            {division.teams.map((team) => (
                                <Card key={team.id}>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base">
                                            {team.name}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {team.players.length === 0 ? (
                                            <p className="text-muted-foreground text-sm">
                                                No players recorded.
                                            </p>
                                        ) : (
                                            <ul className="space-y-1.5">
                                                {team.players.map((player) => (
                                                    <li
                                                        key={player.userId}
                                                        className="flex items-center gap-2 text-sm"
                                                    >
                                                        <span>
                                                            {player.name}
                                                        </span>
                                                        {player.isCaptain && (
                                                            <Badge
                                                                variant="secondary"
                                                                className="text-xs"
                                                            >
                                                                Captain
                                                            </Badge>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
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
