"use client"

import { RiArrowDownSLine } from "@remixicon/react"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { formatMatchTime, formatShortDate } from "@/lib/season-utils"
import type { CurrentSeasonScheduleDivision } from "./actions"

interface Props {
    division: CurrentSeasonScheduleDivision
    userTeamId: number | null
    defaultOpen?: boolean
}

export function SeasonDivisionSection({
    division,
    userTeamId,
    defaultOpen = false
}: Props) {
    return (
        <Collapsible defaultOpen={defaultOpen}>
            <div className="rounded-lg border bg-card shadow-sm">
                <CollapsibleTrigger className="flex w-full items-center justify-between p-4 transition-colors hover:bg-muted/50">
                    <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-xl">
                            {division.name}
                        </h2>
                        {!division.isDrafted && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                                Undrafted
                            </span>
                        )}
                    </div>
                    <RiArrowDownSLine
                        className="transition-transform duration-200 [[data-state=open]>&]:rotate-180"
                        size={20}
                    />
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="space-y-6 border-t p-4">
                        <div className="overflow-x-auto rounded-md border">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/40">
                                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                            Team
                                        </th>
                                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                            Name
                                        </th>
                                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                            Wins
                                        </th>
                                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                            Losses
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {division.standings.map((team) => (
                                        <tr
                                            key={team.id}
                                            className={cn(
                                                "border-b last:border-0",
                                                userTeamId === team.id &&
                                                    "bg-primary/10 font-semibold"
                                            )}
                                        >
                                            <td className="px-3 py-2">
                                                {team.number ?? "—"}
                                            </td>
                                            <td className="px-3 py-2 font-medium">
                                                {team.name}
                                            </td>
                                            <td className="px-3 py-2">
                                                {team.wins}
                                            </td>
                                            <td className="px-3 py-2">
                                                {team.losses}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {division.weeks.length === 0 ? (
                            <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                                No regular season matches found for this
                                division.
                            </div>
                        ) : (
                            <div className="grid gap-4 xl:grid-cols-2">
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
                                                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                                    Ref
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {division.weeks.map((week) => (
                                                <tr
                                                    key={`schedule-${week.week}`}
                                                    className="border-b align-top last:border-0"
                                                >
                                                    <td className="whitespace-nowrap px-3 py-2">
                                                        {week.date
                                                            ? formatShortDate(
                                                                  week.date
                                                              )
                                                            : "—"}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="space-y-1">
                                                            {week.matches.map(
                                                                (m) => (
                                                                    <div
                                                                        key={`match-${m.id}`}
                                                                        className={cn(
                                                                            userTeamId !==
                                                                                null &&
                                                                                (m.homeTeamId ===
                                                                                    userTeamId ||
                                                                                    m.awayTeamId ===
                                                                                        userTeamId) &&
                                                                                "font-semibold text-primary"
                                                                        )}
                                                                    >
                                                                        {
                                                                            m.matchLabel
                                                                        }
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="space-y-1">
                                                            {week.matches.map(
                                                                (m) => (
                                                                    <div
                                                                        key={`time-${m.id}`}
                                                                        className={cn(
                                                                            "whitespace-nowrap",
                                                                            userTeamId !==
                                                                                null &&
                                                                                (m.homeTeamId ===
                                                                                    userTeamId ||
                                                                                    m.awayTeamId ===
                                                                                        userTeamId) &&
                                                                                "font-semibold text-primary"
                                                                        )}
                                                                    >
                                                                        {formatMatchTime(
                                                                            m.time
                                                                        ) ||
                                                                            "—"}
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="space-y-1">
                                                            {week.matches.map(
                                                                (m) => (
                                                                    <div
                                                                        key={`court-${m.id}`}
                                                                        className={cn(
                                                                            userTeamId !==
                                                                                null &&
                                                                                (m.homeTeamId ===
                                                                                    userTeamId ||
                                                                                    m.awayTeamId ===
                                                                                        userTeamId) &&
                                                                                "font-semibold text-primary"
                                                                        )}
                                                                    >
                                                                        {m.court ??
                                                                            "—"}
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="space-y-1">
                                                            {week.matches.map(
                                                                (m) => (
                                                                    <div
                                                                        key={`ref-${m.id}`}
                                                                        className="whitespace-nowrap text-muted-foreground"
                                                                    >
                                                                        {m.refName ??
                                                                            "—"}
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="overflow-x-auto rounded-md border">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b bg-muted/40">
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
                                            {division.weeks.map((week) => (
                                                <tr
                                                    key={`results-${week.week}`}
                                                    className="border-b align-top last:border-0"
                                                >
                                                    <td className="px-3 py-2">
                                                        <div className="space-y-1">
                                                            {week.matches.map(
                                                                (m) => (
                                                                    <div
                                                                        key={`winner-${m.id}`}
                                                                        className={cn(
                                                                            userTeamId !==
                                                                                null &&
                                                                                (m.homeTeamId ===
                                                                                    userTeamId ||
                                                                                    m.awayTeamId ===
                                                                                        userTeamId) &&
                                                                                "font-semibold text-primary"
                                                                        )}
                                                                    >
                                                                        {
                                                                            m.winnerName
                                                                        }
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="space-y-1">
                                                            {week.matches.map(
                                                                (m) => (
                                                                    <div
                                                                        key={`wg-${m.id}`}
                                                                    >
                                                                        {
                                                                            m.winnerGames
                                                                        }
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="space-y-1">
                                                            {week.matches.map(
                                                                (m) => (
                                                                    <div
                                                                        key={`loser-${m.id}`}
                                                                        className={cn(
                                                                            userTeamId !==
                                                                                null &&
                                                                                (m.homeTeamId ===
                                                                                    userTeamId ||
                                                                                    m.awayTeamId ===
                                                                                        userTeamId) &&
                                                                                "font-semibold text-primary"
                                                                        )}
                                                                    >
                                                                        {
                                                                            m.loserName
                                                                        }
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="space-y-1">
                                                            {week.matches.map(
                                                                (m) => (
                                                                    <div
                                                                        key={`lg-${m.id}`}
                                                                    >
                                                                        {
                                                                            m.loserGames
                                                                        }
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="whitespace-nowrap px-3 py-2">
                                                        <div className="space-y-1">
                                                            {week.matches.map(
                                                                (m) => (
                                                                    <div
                                                                        key={`scores-${m.id}`}
                                                                    >
                                                                        {m.scoresDisplay ||
                                                                            "—"}
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    )
}
