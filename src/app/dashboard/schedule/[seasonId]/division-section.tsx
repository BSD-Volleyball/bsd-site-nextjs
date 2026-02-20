"use client"

import { RiArrowDownSLine } from "@remixicon/react"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from "@/components/ui/collapsible"
import type { ScheduleDivision } from "./actions"

export function DivisionSection({ division }: { division: ScheduleDivision }) {
    return (
        <Collapsible>
            <div className="rounded-lg border bg-card shadow-sm">
                <CollapsibleTrigger className="flex w-full items-center justify-between p-4 transition-colors hover:bg-muted/50">
                    <h2 className="font-semibold text-xl">{division.name}</h2>
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
                                            className="border-b last:border-0"
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
                                                    Time
                                                </th>
                                                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                                    Court
                                                </th>
                                                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                                    Match
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
                                                        {week.date || "—"}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="space-y-1">
                                                            {week.matches.map(
                                                                (m) => (
                                                                    <div
                                                                        key={`time-${m.id}`}
                                                                        className="whitespace-nowrap"
                                                                    >
                                                                        {m.time ||
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
                                                                        key={`match-${m.id}`}
                                                                    >
                                                                        {
                                                                            m.matchLabel
                                                                        }
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
