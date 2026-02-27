"use client"

import type { PlayerDraftHistory } from "@/app/dashboard/player-lookup/actions"
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

interface DivisionHistoryChartProps {
    draftHistory: PlayerDraftHistory[]
    allSeasons: SeasonInfo[]
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

export function DivisionHistoryChart({
    draftHistory,
    allSeasons
}: DivisionHistoryChartProps) {
    if (draftHistory.length === 0) return null

    const draftBySeasonId = new Map<number, PlayerDraftHistory>()
    for (const d of draftHistory) {
        draftBySeasonId.set(d.seasonId, d)
    }

    const firstSeasonId = draftHistory[0].seasonId
    const lastSeasonId = draftHistory[draftHistory.length - 1].seasonId
    const seasonsInRange = [...allSeasons]
        .reverse()
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
            round: 0,
            overall: 0,
            label,
            divisionValue: 0
        }
    })

    return (
        <div>
            <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                Division History
            </h3>
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
                            return (
                                <div className="rounded-md border bg-background p-3 text-sm shadow-md">
                                    <p className="font-medium">{d.label}</p>
                                    <p className="text-muted-foreground">
                                        Division: {d.divisionName}
                                    </p>
                                    <p className="text-muted-foreground">
                                        Team: {d.teamName}
                                    </p>
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
