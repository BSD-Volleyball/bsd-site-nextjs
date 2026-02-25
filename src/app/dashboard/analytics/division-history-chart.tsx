"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell
} from "recharts"

interface DivisionHistoryItem {
    seasonId: number
    seasonYear: number
    seasonName: string
    divisionName: string
    teamName: string
    round: number
    overall: number
}

interface DivisionHistoryChartProps {
    divisionHistory: DivisionHistoryItem[]
    allSeasons: { id: number; year: number; name: string }[]
}

export function DivisionHistoryChart({
    divisionHistory,
    allSeasons
}: DivisionHistoryChartProps) {
    if (divisionHistory.length === 0) {
        return (
            <p className="text-muted-foreground text-sm">
                No division history found yet.
            </p>
        )
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

    const firstSeasonId = divisionHistory[0].seasonId
    const lastSeasonId = divisionHistory[divisionHistory.length - 1].seasonId
    const seasonsInRange = [...allSeasons]
        .reverse()
        .filter((s) => s.id >= firstSeasonId && s.id <= lastSeasonId)

    const draftBySeasonId = new Map<number, DivisionHistoryItem>()
    for (const item of divisionHistory) {
        draftBySeasonId.set(item.seasonId, item)
    }

    const chartData = seasonsInRange.map((season) => {
        const draft = draftBySeasonId.get(season.id)
        const label = `${season.name.charAt(0).toUpperCase() + season.name.slice(1)} ${season.year}`

        if (draft) {
            return {
                ...draft,
                label,
                divisionValue: divisionValues[draft.divisionName] || 0
            }
        }

        return {
            seasonId: season.id,
            seasonYear: season.year,
            seasonName: season.name,
            divisionName: "",
            teamName: "",
            round: 0,
            overall: 0,
            label,
            divisionValue: 0
        }
    })

    return (
        <Card className="max-w-2xl">
            <CardHeader>
                <CardTitle className="text-base">Division History</CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                    <BarChart
                        data={chartData}
                        margin={{
                            top: 5,
                            right: 20,
                            bottom: 5,
                            left: 50
                        }}
                    >
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis
                            domain={[0, 7]}
                            ticks={[1, 2, 3, 4, 5, 6]}
                            tickFormatter={(value: number) => {
                                const labels: Record<number, string> = {
                                    6: "AA",
                                    5: "A",
                                    4: "ABA",
                                    3: "ABB",
                                    2: "BBB",
                                    1: "BB"
                                }
                                return labels[value] || ""
                            }}
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
                                            <p className="font-medium">
                                                {d.label}
                                            </p>
                                            <p className="text-muted-foreground italic">
                                                Did not play
                                            </p>
                                        </div>
                                    )
                                }
                                return (
                                    <div className="rounded-md border bg-background p-3 text-sm shadow-md">
                                        <p className="font-medium">
                                            {d.label}
                                        </p>
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
                            {chartData.map((item, index) => {
                                const colors: Record<string, string> = {
                                    AA: "#ef4444",
                                    A: "#f97316",
                                    ABA: "#eab308",
                                    AB: "#eab308",
                                    ABB: "#22c55e",
                                    BBB: "#3b82f6",
                                    BB: "#8b5cf6"
                                }

                                return (
                                    <Cell
                                        key={index}
                                        fill={
                                            item.divisionName
                                                ? colors[item.divisionName] ||
                                                  "hsl(var(--primary))"
                                                : "transparent"
                                        }
                                    />
                                )
                            })}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    )
}
