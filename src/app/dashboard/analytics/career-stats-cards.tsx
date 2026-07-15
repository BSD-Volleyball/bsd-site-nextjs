import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PersonalAnalytics } from "@/lib/player-elo-data"

function StatTile({
    label,
    value,
    detail
}: {
    label: string
    value: string
    detail?: string
}) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="font-medium text-muted-foreground text-sm">
                    {label}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <p className="font-semibold text-2xl">{value}</p>
                {detail && (
                    <p className="text-muted-foreground text-sm">{detail}</p>
                )}
            </CardContent>
        </Card>
    )
}

function PeopleCard({
    title,
    people,
    countLabel
}: {
    title: string
    people: { userId: string; name: string; count: number }[]
    countLabel: string
}) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="font-medium text-muted-foreground text-sm">
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {people.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                        No seasons played yet.
                    </p>
                ) : (
                    <ul className="space-y-1 text-sm">
                        {people.map((person) => (
                            <li
                                key={person.userId}
                                className="flex justify-between gap-2"
                            >
                                <span>{person.name}</span>
                                <span className="text-muted-foreground">
                                    {person.count} {countLabel}
                                    {person.count === 1 ? "" : "s"}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}

export function CareerStatsCards({
    personal
}: {
    personal: PersonalAnalytics
}) {
    const { careerStats: stats, championships } = personal
    const matchesPlayed = stats.matchWins + stats.matchLosses
    const winPct =
        matchesPlayed > 0
            ? `${Math.round((stats.matchWins / matchesPlayed) * 100)}%`
            : "—"

    return (
        <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                    label="Match Record"
                    value={
                        matchesPlayed > 0
                            ? `${stats.matchWins}–${stats.matchLosses}`
                            : "—"
                    }
                    detail={
                        matchesPlayed > 0
                            ? `${winPct} over ${matchesPlayed} matches with recorded scores`
                            : "No matches with recorded scores yet"
                    }
                />
                <StatTile
                    label="Set Record"
                    value={
                        stats.setWins + stats.setLosses > 0
                            ? `${stats.setWins}–${stats.setLosses}`
                            : "—"
                    }
                    detail={
                        stats.pointDiff !== 0
                            ? `${stats.pointDiff > 0 ? "+" : ""}${stats.pointDiff} total point differential`
                            : undefined
                    }
                />
                <StatTile
                    label="Playoff Record"
                    value={
                        stats.playoffWins + stats.playoffLosses > 0
                            ? `${stats.playoffWins}–${stats.playoffLosses}`
                            : "—"
                    }
                />
                <StatTile
                    label="Championships"
                    value={String(championships.length)}
                    detail={
                        championships.length > 0
                            ? championships
                                  .map(
                                      (c) =>
                                          `${c.divisionName} · ${c.seasonLabel}`
                                  )
                                  .join(", ")
                            : "Champion team rosters tracked since 2010"
                    }
                />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                <PeopleCard
                    title="Most Frequent Teammates"
                    people={personal.topTeammates}
                    countLabel="season"
                />
                <PeopleCard
                    title="Captains Played For"
                    people={personal.topCaptains}
                    countLabel="season"
                />
            </div>
        </div>
    )
}
