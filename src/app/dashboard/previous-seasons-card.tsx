"use client"

import { useState } from "react"
import type { PreviousSeason } from "./page"
import type { TeamRosterPlayer } from "./actions"
import { getTeamRoster } from "./actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog"
import { RiHistoryLine, RiStarFill } from "@remixicon/react"

export function PreviousSeasonsCard({
    previousSeasons
}: {
    previousSeasons: PreviousSeason[]
}) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [teamName, setTeamName] = useState("")
    const [players, setPlayers] = useState<TeamRosterPlayer[]>([])
    const [seasonLabel, setSeasonLabel] = useState("")

    async function handleRowClick(ps: PreviousSeason) {
        setSeasonLabel(
            `${ps.season.charAt(0).toUpperCase() + ps.season.slice(1)} ${ps.year}`
        )
        setTeamName(ps.teamName)
        setPlayers([])
        setOpen(true)
        setLoading(true)

        const result = await getTeamRoster(ps.teamId)
        if (result.status) {
            setTeamName(result.teamName)
            setPlayers(result.players)
        }
        setLoading(false)
    }

    return (
        <>
            <Card className="max-w-2xl">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <RiHistoryLine className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-lg">
                            Previous Seasons Played
                        </CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b">
                                    <th className="py-2 pr-4 text-left font-medium text-muted-foreground">
                                        Season
                                    </th>
                                    <th className="py-2 pr-4 text-left font-medium text-muted-foreground">
                                        Division
                                    </th>
                                    <th className="py-2 pr-4 text-left font-medium text-muted-foreground">
                                        Team
                                    </th>
                                    <th className="py-2 text-left font-medium text-muted-foreground">
                                        Captain
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {previousSeasons.map((ps, idx) => (
                                    <tr
                                        key={idx}
                                        className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                                        onClick={() => handleRowClick(ps)}
                                    >
                                        <td className="py-2 pr-4">
                                            {ps.season
                                                .charAt(0)
                                                .toUpperCase() +
                                                ps.season.slice(1)}{" "}
                                            {ps.year}
                                        </td>
                                        <td className="py-2 pr-4">
                                            {ps.divisionName}
                                        </td>
                                        <td className="py-2 pr-4">
                                            {ps.teamName}
                                        </td>
                                        <td className="py-2">
                                            {ps.captainName}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>{teamName}</DialogTitle>
                        <DialogDescription>
                            {seasonLabel} Roster
                        </DialogDescription>
                    </DialogHeader>
                    {loading ? (
                        <p className="text-muted-foreground text-sm">
                            Loading roster...
                        </p>
                    ) : (
                        <ul className="space-y-1">
                            {players.map((player) => (
                                <li
                                    key={player.id}
                                    className="flex items-center gap-2 text-sm"
                                >
                                    <span>
                                        {player.displayName} {player.lastName}
                                    </span>
                                    {player.isCaptain && (
                                        <RiStarFill className="h-4 w-4 text-yellow-500" />
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
