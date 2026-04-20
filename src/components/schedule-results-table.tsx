import { formatMatchTime, formatShortDate } from "@/lib/season-utils"
import { cn } from "@/lib/utils"

export interface ScheduleResultsMatch {
    id: number
    time: string | null
    court: number | null
    matchLabel: string
    homeTeamLabel?: string
    awayTeamLabel?: string
    highlightedMatchTeam?: "home" | "away" | null
    highlightScheduleDetails?: boolean
    winnerName: string | null
    winnerGames: number | null
    winnerHighlighted?: boolean
    loserName: string | null
    loserGames: number | null
    loserHighlighted?: boolean
    scoresDisplay: string
    refName?: string | null
}

export interface ScheduleResultsWeek<
    TMatch extends ScheduleResultsMatch = ScheduleResultsMatch
> {
    week: number
    date: string | null
    matches: TMatch[]
}

interface Props<TMatch extends ScheduleResultsMatch> {
    weeks: ScheduleResultsWeek<TMatch>[]
    showRef?: boolean
}

export function ScheduleResultsTable<TMatch extends ScheduleResultsMatch>({
    weeks,
    showRef = false
}: Props<TMatch>) {
    const rows = weeks.flatMap((week, weekIndex) =>
        week.matches.map((match, matchIndex) => ({
            ...match,
            date: week.date,
            isWeekStart: weekIndex > 0 && matchIndex === 0
        }))
    )

    return (
        <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b bg-muted/40">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Date
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Match
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Time
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Court
                        </th>
                        {showRef && (
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                Ref
                            </th>
                        )}
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Winner
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Games
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Loser
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Games
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Scores
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr
                            key={row.id}
                            className={cn(
                                "border-b align-top even:bg-muted/20",
                                index === rows.length - 1 && "border-b-0",
                                row.isWeekStart &&
                                    "border-t-4 border-t-foreground/25"
                            )}
                        >
                            <td
                                className={cn(
                                    "whitespace-nowrap px-3 py-2",
                                    row.highlightScheduleDetails &&
                                        "font-semibold text-primary"
                                )}
                            >
                                {row.date ? formatShortDate(row.date) : "—"}
                            </td>
                            <td className="px-3 py-2">
                                {row.homeTeamLabel && row.awayTeamLabel ? (
                                    <>
                                        <span
                                            className={cn(
                                                row.highlightedMatchTeam ===
                                                    "home" &&
                                                    "font-semibold text-primary"
                                            )}
                                        >
                                            {row.homeTeamLabel}
                                        </span>{" "}
                                        <span>vs</span>{" "}
                                        <span
                                            className={cn(
                                                row.highlightedMatchTeam ===
                                                    "away" &&
                                                    "font-semibold text-primary"
                                            )}
                                        >
                                            {row.awayTeamLabel}
                                        </span>
                                    </>
                                ) : (
                                    row.matchLabel
                                )}
                            </td>
                            <td
                                className={cn(
                                    "whitespace-nowrap px-3 py-2",
                                    row.highlightScheduleDetails &&
                                        "font-semibold text-primary"
                                )}
                            >
                                {formatMatchTime(row.time) || "—"}
                            </td>
                            <td
                                className={cn(
                                    "px-3 py-2",
                                    row.highlightScheduleDetails &&
                                        "font-semibold text-primary"
                                )}
                            >
                                {row.court ?? "—"}
                            </td>
                            {showRef && (
                                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                                    {row.refName ?? "—"}
                                </td>
                            )}
                            <td
                                className={cn(
                                    "px-3 py-2",
                                    row.winnerHighlighted &&
                                        "font-semibold text-primary"
                                )}
                            >
                                {row.winnerName ?? "—"}
                            </td>
                            <td className="px-3 py-2">
                                {row.winnerGames ?? "—"}
                            </td>
                            <td
                                className={cn(
                                    "px-3 py-2",
                                    row.loserHighlighted &&
                                        "font-semibold text-primary"
                                )}
                            >
                                {row.loserName ?? "—"}
                            </td>
                            <td className="px-3 py-2">
                                {row.loserGames ?? "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                                {row.scoresDisplay || "—"}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
