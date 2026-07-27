"use client"

import { formatHeight } from "@/components/player-detail"
import { Button } from "@/components/ui/button"
import type { RatePlayerEntry } from "./actions"
import { getDisplayName, getGenderLabel } from "./rate-player-helpers"

export interface PlayerTableProps {
    players: RatePlayerEntry[]
    onRate: (player: RatePlayerEntry) => void
    playerPicUrl: string
}

export function PlayerTable({
    players,
    onRate,
    playerPicUrl
}: PlayerTableProps) {
    return (
        <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b bg-muted/50">
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground" />
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground" />
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                            Old ID
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                            Name
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                            Gender
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                            Height
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                            Last Division Played
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {players.length === 0 ? (
                        <tr>
                            <td
                                colSpan={7}
                                className="px-4 py-8 text-center text-muted-foreground"
                            >
                                No players match the current filter.
                            </td>
                        </tr>
                    ) : (
                        players.map((player) => (
                            <tr
                                key={player.id}
                                className="border-b transition-colors last:border-0 hover:bg-accent/50"
                            >
                                <td className="px-4 py-2 text-left">
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => onRate(player)}
                                    >
                                        Rate
                                    </Button>
                                </td>
                                <td className="px-4 py-2">
                                    {playerPicUrl && player.picture ? (
                                        <img
                                            src={`${playerPicUrl}${player.picture}`}
                                            alt={getDisplayName(player)}
                                            className="h-12 w-9 rounded object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-12 w-9 items-center justify-center rounded border bg-muted text-[0.65rem] text-muted-foreground">
                                            —
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-2 font-medium">
                                    {player.oldId ?? "—"}
                                </td>
                                <td className="px-4 py-2 font-medium">
                                    {getDisplayName(player)}
                                </td>
                                <td className="px-4 py-2">
                                    {getGenderLabel(player.male)}
                                </td>
                                <td className="px-4 py-2">
                                    {formatHeight(player.height)}
                                </td>
                                <td className="px-4 py-2">
                                    {player.lastDivisionName || "—"}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    )
}
