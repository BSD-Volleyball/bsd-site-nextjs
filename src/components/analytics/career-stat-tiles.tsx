import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export interface CareerStatTotals {
    matchWins: number
    matchLosses: number
    setWins: number
    setLosses: number
    playoffWins: number
    playoffLosses: number
    pointDiff: number
}

export interface CareerChampionship {
    seasonLabel: string
    divisionName: string
}

export function StatTile({
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

/**
 * Match / set / playoff record plus championships. Shared by the analytics page
 * and the admin player detail popup, which passes a narrower grid.
 */
export function CareerStatTiles({
    stats,
    championships,
    gridClassName = "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
}: {
    stats: CareerStatTotals
    championships: CareerChampionship[]
    gridClassName?: string
}) {
    const matchesPlayed = stats.matchWins + stats.matchLosses
    const winPct =
        matchesPlayed > 0
            ? `${Math.round((stats.matchWins / matchesPlayed) * 100)}%`
            : "—"

    return (
        <div className={gridClassName}>
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
                                  (c) => `${c.divisionName} · ${c.seasonLabel}`
                              )
                              .join(", ")
                        : "Champion team rosters tracked since 2010"
                }
            />
        </div>
    )
}
