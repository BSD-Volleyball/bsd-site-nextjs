"use client"

import { RiArrowDownSLine } from "@remixicon/react"
import type { ReactNode } from "react"
import {
    ScheduleResultsTable,
    type ScheduleResultsWeek
} from "@/components/schedule-results-table"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

export interface DivisionStanding {
    id: number
    number: number | null
    name: string
    wins: number
    losses: number
}

interface DivisionSectionProps {
    title: string
    /**
     * Content rendered next to the title (e.g. an "Undrafted" pill). When the
     * prop is provided — even as `null` — the title is wrapped in a flex row so
     * the DOM matches pages that conditionally show a badge.
     */
    titleBadge?: ReactNode
    defaultOpen?: boolean
    /** Renders the standings table when provided. */
    standings?: DivisionStanding[]
    /** Highlights the matching row in the standings table. */
    highlightTeamId?: number | null
    /** Renders the schedule/results table (or its empty state) when provided. */
    weeks?: ScheduleResultsWeek[]
    contentClassName?: string
    children?: ReactNode
}

export function DivisionSection({
    title,
    titleBadge,
    defaultOpen = false,
    standings,
    highlightTeamId = null,
    weeks,
    contentClassName = "space-y-6 border-t p-4",
    children
}: DivisionSectionProps) {
    const heading = <h2 className="font-semibold text-xl">{title}</h2>

    return (
        <Collapsible defaultOpen={defaultOpen}>
            <div className="rounded-lg border bg-card shadow-sm">
                <CollapsibleTrigger className="flex w-full items-center justify-between p-4 transition-colors hover:bg-muted/50">
                    {titleBadge !== undefined ? (
                        <div className="flex items-center gap-2">
                            {heading}
                            {titleBadge}
                        </div>
                    ) : (
                        heading
                    )}
                    <RiArrowDownSLine
                        className="transition-transform duration-200 [[data-state=open]>&]:rotate-180"
                        size={20}
                    />
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className={contentClassName}>
                        {standings && (
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
                                        {standings.map((team) => (
                                            <tr
                                                key={team.id}
                                                className={cn(
                                                    "border-b last:border-0",
                                                    highlightTeamId ===
                                                        team.id &&
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
                        )}

                        {weeks &&
                            (weeks.length === 0 ? (
                                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                                    No regular season matches found for this
                                    division.
                                </div>
                            ) : (
                                <ScheduleResultsTable weeks={weeks} showRef />
                            ))}

                        {children}
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    )
}
