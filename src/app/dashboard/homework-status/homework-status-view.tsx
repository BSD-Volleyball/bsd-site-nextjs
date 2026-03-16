"use client"

import { RiCheckLine } from "@remixicon/react"
import { Badge } from "@/components/ui/badge"
import type { DivisionStatus } from "./actions"

interface HomeworkStatusViewProps {
    divisions: DivisionStatus[]
}

export function HomeworkStatusView({ divisions }: HomeworkStatusViewProps) {
    if (divisions.length === 0) {
        return (
            <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                No teams found for this season.
            </div>
        )
    }

    return (
        <div className="space-y-8">
            {divisions.map((division) => (
                <div key={division.divisionId}>
                    <div className="mb-3 flex items-center gap-2">
                        <h2 className="font-semibold text-lg">
                            {division.divisionName}
                        </h2>
                        {division.isCoachesMode && (
                            <Badge variant="secondary">Coaches Mode</Badge>
                        )}
                    </div>

                    {division.captains.length === 0 ? (
                        <div className="rounded-md bg-muted p-4 text-muted-foreground text-sm">
                            No captains assigned.
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/50">
                                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                            Captain
                                        </th>
                                        <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                                            Rate Players
                                        </th>
                                        <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                                            Moving Day
                                        </th>
                                        <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                                            Draft Homework
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {division.captains.map((captain) => (
                                        <tr
                                            key={captain.captainId}
                                            className="border-b transition-colors last:border-0 hover:bg-accent/50"
                                        >
                                            <td className="px-4 py-2 font-medium">
                                                {captain.captainName}
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                {captain.ratePlayersComplete && (
                                                    <RiCheckLine
                                                        className="mx-auto text-green-600"
                                                        size={18}
                                                    />
                                                )}
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                {captain.movingDayComplete && (
                                                    <RiCheckLine
                                                        className="mx-auto text-green-600"
                                                        size={18}
                                                    />
                                                )}
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                {captain.draftHomeworkComplete && (
                                                    <RiCheckLine
                                                        className="mx-auto text-green-600"
                                                        size={18}
                                                    />
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}
