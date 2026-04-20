"use client"

import { RiArrowDownSLine } from "@remixicon/react"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from "@/components/ui/collapsible"
import { ScheduleResultsTable } from "@/components/schedule-results-table"
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
                            <ScheduleResultsTable
                                weeks={division.weeks}
                                showRef
                            />
                        )}
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    )
}
