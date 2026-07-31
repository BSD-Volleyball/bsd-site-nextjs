import { CareerStatTiles } from "@/components/analytics/career-stat-tiles"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PersonalAnalytics } from "@/lib/player-elo-data"

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
    return (
        <div className="space-y-4">
            <CareerStatTiles
                stats={personal.careerStats}
                championships={personal.championships}
            />
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
