"use client"

import { formatHeight } from "@/components/player-detail"
import { Button } from "@/components/ui/button"
import type { RatePlayerEntry, RatedPlayerEntry } from "./actions"
import { getDisplayName, getGenderLabel } from "./rate-player-helpers"

export interface RatedPlayerTableProps {
    rows: RatedPlayerEntry[]
    emptyMessage: string
    onRate: (player: RatePlayerEntry) => void
    playerPicUrl: string
}

function formatRatedAt(ratedAt: string | null): string {
    if (!ratedAt) return "—"
    return new Date(ratedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    })
}

const headerClass = "px-4 py-2.5 text-left font-medium text-muted-foreground"

export function RatedPlayerTable({
    rows,
    emptyMessage,
    onRate,
    playerPicUrl
}: RatedPlayerTableProps) {
    return (
        <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b bg-muted/50">
                        <th className={headerClass} />
                        <th className={headerClass} />
                        <th className={headerClass}>Old ID</th>
                        <th className={headerClass}>Name</th>
                        <th className={headerClass}>Season</th>
                        <th className={headerClass}>Overall</th>
                        <th className={headerClass}>Rated</th>
                        <th className={headerClass}>Gender</th>
                        <th className={headerClass}>Height</th>
                        <th className={headerClass}>Last Division Played</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td
                                colSpan={10}
                                className="px-4 py-8 text-center text-muted-foreground"
                            >
                                {emptyMessage}
                            </td>
                        </tr>
                    ) : (
                        rows.map(({ player, ...row }) => (
                            <tr
                                key={`${row.seasonId}-${player.id}`}
                                className="border-b transition-colors last:border-0 hover:bg-accent/50"
                            >
                                <td className="px-4 py-2 text-left">
                                    {row.canRate ? (
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => onRate(player)}
                                        >
                                            Rate
                                        </Button>
                                    ) : (
                                        <span className="text-muted-foreground">
                                            —
                                        </span>
                                    )}
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
                                <td className="px-4 py-2">{row.seasonLabel}</td>
                                <td className="px-4 py-2">
                                    {row.overall ?? "—"}
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap">
                                    {formatRatedAt(row.ratedAt)}
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
