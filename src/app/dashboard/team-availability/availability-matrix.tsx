"use client"

import { useState, useTransition } from "react"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { getTeamAvailabilityData } from "./actions"
import type { RosterPlayer, TeamAvailabilityData } from "./actions"

function formatDate(dateStr: string): string {
    const date = new Date(`${dateStr}T00:00:00`)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function displayName(player: RosterPlayer): string {
    if (player.preferredName) {
        return `${player.preferredName} ${player.lastName}`
    }
    return `${player.firstName} ${player.lastName}`
}

type AvailabilityMatrixProps = {
    initialData: TeamAvailabilityData
}

export function AvailabilityMatrix({ initialData }: AvailabilityMatrixProps) {
    const [data, setData] = useState<TeamAvailabilityData>(initialData)
    const [isPending, startTransition] = useTransition()

    const { team, allTeams, events, roster } = data

    function handleTeamChange(teamIdStr: string) {
        const teamId = parseInt(teamIdStr, 10)
        startTransition(async () => {
            const result = await getTeamAvailabilityData(teamId)
            if (result.status) {
                setData(result)
            }
        })
    }

    // Build unavailability sets per player for quick lookup
    const unavailSets = new Map<string, Set<number>>()
    for (const player of roster) {
        unavailSets.set(player.userId, new Set(player.unavailableEventIds))
    }

    // Compute available count per event
    const availableCountByEvent = new Map<number, number>()
    for (const event of events) {
        let count = 0
        for (const player of roster) {
            if (!unavailSets.get(player.userId)?.has(event.id)) {
                count++
            }
        }
        availableCountByEvent.set(event.id, count)
    }

    const showTeamSelector = allTeams.length > 1

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle>Team Availability</CardTitle>
                        <CardDescription>
                            {team.name}
                            {team.number != null ? ` (#${team.number})` : ""}{" "}
                            &mdash; {team.divisionName}
                        </CardDescription>
                    </div>
                    {showTeamSelector && (
                        <div className="w-full sm:w-64">
                            <Select
                                value={team.id.toString()}
                                onValueChange={handleTeamChange}
                                disabled={isPending}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select team..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {allTeams.map((t) => (
                                        <SelectItem
                                            key={t.id}
                                            value={t.id.toString()}
                                        >
                                            {t.name}
                                            {t.number != null
                                                ? ` (#${t.number})`
                                                : ""}{" "}
                                            — {t.divisionName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {isPending && (
                    <div className="mb-4 text-muted-foreground text-sm">
                        Loading...
                    </div>
                )}
                {roster.length === 0 ? (
                    <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                        No players have been drafted to this team yet.
                    </div>
                ) : events.length === 0 ? (
                    <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                        No game dates scheduled for this season.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr>
                                    <th className="sticky left-0 z-10 border-b bg-background px-3 py-2 text-left font-medium">
                                        Player
                                    </th>
                                    {events.map((event) => {
                                        const count =
                                            availableCountByEvent.get(
                                                event.id
                                            ) ?? 0
                                        const isLow = count < 6
                                        return (
                                            <th
                                                key={event.id}
                                                className={`whitespace-nowrap border-b px-3 py-2 text-center font-medium ${
                                                    isLow
                                                        ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                                                        : event.eventType ===
                                                            "playoff"
                                                          ? "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                                                          : ""
                                                }`}
                                            >
                                                <div>
                                                    {formatDate(
                                                        event.eventDate
                                                    )}
                                                </div>
                                                {event.eventType ===
                                                    "playoff" && (
                                                    <div className="font-normal text-xs">
                                                        Playoff
                                                    </div>
                                                )}
                                            </th>
                                        )
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {roster.map((player) => {
                                    const playerUnavail = unavailSets.get(
                                        player.userId
                                    )!
                                    return (
                                        <tr
                                            key={player.userId}
                                            className="border-b last:border-b-0 hover:bg-muted/50"
                                        >
                                            <td className="sticky left-0 z-10 whitespace-nowrap bg-background px-3 py-2 font-medium">
                                                {displayName(player)}
                                            </td>
                                            {events.map((event) => {
                                                const isUnavailable =
                                                    playerUnavail.has(event.id)
                                                return (
                                                    <td
                                                        key={event.id}
                                                        className={`px-3 py-2 text-center ${
                                                            event.eventType ===
                                                            "playoff"
                                                                ? "bg-amber-50/50 dark:bg-amber-950/30"
                                                                : ""
                                                        }`}
                                                    >
                                                        {isUnavailable ? (
                                                            <span className="font-bold text-destructive">
                                                                ✗
                                                            </span>
                                                        ) : (
                                                            <span className="font-bold text-emerald-600">
                                                                ✓
                                                            </span>
                                                        )}
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    )
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2">
                                    <td className="sticky left-0 z-10 bg-background px-3 py-2 font-semibold">
                                        Available
                                    </td>
                                    {events.map((event) => {
                                        const count =
                                            availableCountByEvent.get(
                                                event.id
                                            ) ?? 0
                                        const total = roster.length
                                        const isLow = count < 6
                                        return (
                                            <td
                                                key={event.id}
                                                className={`px-3 py-2 text-center font-semibold ${
                                                    isLow
                                                        ? "text-destructive"
                                                        : "text-emerald-600"
                                                } ${
                                                    event.eventType ===
                                                    "playoff"
                                                        ? "bg-amber-50/50 dark:bg-amber-950/30"
                                                        : ""
                                                }`}
                                            >
                                                {count}/{total}
                                            </td>
                                        )
                                    })}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
