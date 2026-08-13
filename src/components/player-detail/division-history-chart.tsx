"use client"

import { RiTrophyLine } from "@remixicon/react"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell
} from "recharts"

interface SeasonInfo {
    id: number
    year: number
    name: string
}

/**
 * Structural on purpose: draft-history rows come from several actions, and
 * the record fields are optional so callers that don't load them still work.
 */
export interface DivisionHistoryEntry {
    seasonId: number
    seasonYear: number
    seasonName: string
    divisionName: string
    teamName: string
    regularWins?: number
    regularLosses?: number
    playoffWins?: number
    playoffLosses?: number
    champion?: boolean
}

interface DivisionHistoryChartProps {
    draftHistory: DivisionHistoryEntry[]
    allSeasons: SeasonInfo[]
    /** Rendered instead of nothing when the player has no drafted seasons. */
    emptyMessage?: string
    /** Set when the caller already titles the chart (e.g. a Card header). */
    hideHeading?: boolean
}

const divisionValues: Record<string, number> = {
    AA: 6,
    A: 5,
    ABA: 4,
    AB: 4,
    ABB: 3,
    BBB: 2,
    BB: 1
}

const divisionColors: Record<string, string> = {
    AA: "#ef4444",
    A: "#f97316",
    ABA: "#eab308",
    AB: "#eab308",
    ABB: "#22c55e",
    BBB: "#3b82f6",
    BB: "#8b5cf6"
}

const divisionLabels: Record<number, string> = {
    6: "AA",
    5: "A",
    4: "ABA",
    3: "ABB",
    2: "BBB",
    1: "BB"
}

function recordLine(wins?: number, losses?: number): string | null {
    if (wins === undefined || losses === undefined) return null
    if (wins === 0 && losses === 0) return null
    return `${wins}–${losses}`
}

export function DivisionHistoryChart({
    draftHistory,
    allSeasons,
    emptyMessage,
    hideHeading = false
}: DivisionHistoryChartProps) {
    if (draftHistory.length === 0) {
        return emptyMessage ? (
            <p className="text-muted-foreground text-sm">{emptyMessage}</p>
        ) : null
    }

    const draftBySeasonId = new Map<number, DivisionHistoryEntry>()
    for (const d of draftHistory) {
        draftBySeasonId.set(d.seasonId, d)
    }

    const draftedSeasonIds = draftHistory.map((d) => d.seasonId)
    const firstSeasonId = Math.min(...draftedSeasonIds)
    const lastSeasonId = Math.max(...draftedSeasonIds)
    // allSeasons arrives newest-first; sort ascending so the chart reads
    // oldest season on the left, most recent on the right.
    const seasonsInRange = [...allSeasons]
        .sort((a, b) => a.id - b.id)
        .filter((s) => s.id >= firstSeasonId && s.id <= lastSeasonId)

    const chartData = seasonsInRange.map((s) => {
        const draft = draftBySeasonId.get(s.id)
        const label = `${s.name.charAt(0).toUpperCase() + s.name.slice(1)} ${s.year}`
        if (draft) {
            return {
                ...draft,
                label,
                divisionValue: divisionValues[draft.divisionName] || 0
            }
        }
        return {
            seasonId: s.id,
            seasonYear: s.year,
            seasonName: s.name,
            divisionName: "",
            teamName: "",
            label,
            divisionValue: 0
        }
    })

    return (
        <div>
            {!hideHeading && (
                <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                    Division History
                </h3>
            )}
            <ResponsiveContainer width="100%" height={250}>
                <BarChart
                    data={chartData}
                    margin={{ top: 5, right: 20, bottom: 5, left: 50 }}
                >
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis
                        domain={[0, 7]}
                        ticks={[1, 2, 3, 4, 5, 6]}
                        tickFormatter={(value: number) =>
                            divisionLabels[value] || ""
                        }
                        tick={{ fontSize: 11 }}
                        width={45}
                    />
                    <Tooltip
                        content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const d = payload[0].payload
                            if (!d.divisionName) {
                                return (
                                    <div className="rounded-md border bg-background p-3 text-sm shadow-md">
                                        <p className="font-medium">{d.label}</p>
                                        <p className="text-muted-foreground italic">
                                            Did not play
                                        </p>
                                    </div>
                                )
                            }
                            const regular = recordLine(
                                d.regularWins,
                                d.regularLosses
                            )
                            const playoff = recordLine(
                                d.playoffWins,
                                d.playoffLosses
                            )
                            return (
                                <div className="rounded-md border bg-background p-3 text-sm shadow-md">
                                    <p className="font-medium">{d.label}</p>
                                    <p className="text-muted-foreground">
                                        Division: {d.divisionName}
                                    </p>
                                    <p className="text-muted-foreground">
                                        Team: {d.teamName}
                                    </p>
                                    {regular && (
                                        <p className="text-muted-foreground">
                                            Regular season: {regular}
                                        </p>
                                    )}
                                    {playoff && (
                                        <p className="text-muted-foreground">
                                            Playoffs: {playoff}
                                        </p>
                                    )}
                                    {d.champion && (
                                        <p className="mt-1 flex items-center gap-1 font-medium text-amber-600 dark:text-amber-500">
                                            <RiTrophyLine className="h-4 w-4 text-amber-500" />
                                            Champions
                                        </p>
                                    )}
                                </div>
                            )
                        }}
                    />
                    <Bar dataKey="divisionValue" radius={[4, 4, 0, 0]}>
                        {seasonsInRange.map((s, index) => {
                            const draft = draftBySeasonId.get(s.id)
                            return (
                                <Cell
                                    key={index}
                                    fill={
                                        draft
                                            ? divisionColors[
                                                  draft.divisionName
                                              ] || "#94a3b8"
                                            : "transparent"
                                    }
                                />
                            )
                        })}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
