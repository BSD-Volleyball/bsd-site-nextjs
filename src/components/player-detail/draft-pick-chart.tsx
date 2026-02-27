"use client"

import type { PlayerDraftHistory } from "@/app/dashboard/player-lookup/actions"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
    ReferenceArea
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface DraftPickChartProps {
    draftHistory: PlayerDraftHistory[]
}

const divisionBands = [
    { y1: 0, y2: 49, label: "AA", color: "#ef4444" },
    { y1: 50, y2: 99, label: "A", color: "#f97316" },
    { y1: 100, y2: 149, label: "ABA", color: "#eab308" },
    { y1: 150, y2: 199, label: "ABB", color: "#22c55e" },
    { y1: 200, y2: 249, label: "BBB", color: "#3b82f6" },
    { y1: 250, y2: 299, label: "BB", color: "#8b5cf6" }
]

export function DraftPickChart({ draftHistory }: DraftPickChartProps) {
    if (draftHistory.length === 0) return null

    const maxOverall = Math.max(...draftHistory.map((d) => d.overall))
    const yMax = Math.min(Math.ceil((maxOverall + 10) / 50) * 50, 300)
    const visibleBands = divisionBands.filter((b) => b.y1 < yMax)

    const chartData = draftHistory.map((d) => ({
        ...d,
        label: `${d.seasonName.charAt(0).toUpperCase() + d.seasonName.slice(1)} ${d.seasonYear}`
    }))

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Draft Pick History</CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                    <BarChart
                        data={chartData}
                        margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                    >
                        {visibleBands.map((band) => (
                            <ReferenceArea
                                key={band.label}
                                y1={band.y1}
                                y2={Math.min(band.y2, yMax)}
                                fill={band.color}
                                fillOpacity={0.15}
                                ifOverflow="hidden"
                            />
                        ))}
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis
                            reversed
                            domain={[0, yMax]}
                            ticks={visibleBands.map((b) => b.y1 + 25)}
                            tickFormatter={(value: number) => {
                                const band = visibleBands.find(
                                    (b) => value >= b.y1 && value <= b.y2
                                )
                                return band?.label ?? ""
                            }}
                            tick={{ fontSize: 11 }}
                            width={40}
                        />
                        <Tooltip
                            content={({ active, payload }) => {
                                if (!active || !payload?.length) return null
                                const d = payload[0].payload
                                return (
                                    <div className="rounded-md border bg-background p-3 text-sm shadow-md">
                                        <p className="font-medium">{d.label}</p>
                                        <p className="text-muted-foreground">
                                            Division: {d.divisionName}
                                        </p>
                                        <p className="text-muted-foreground">
                                            Team: {d.teamName}
                                        </p>
                                        <p className="text-muted-foreground">
                                            Round: {d.round}
                                        </p>
                                        <p className="text-muted-foreground">
                                            Overall Pick: {d.overall}
                                        </p>
                                    </div>
                                )
                            }}
                        />
                        <Bar dataKey="overall" radius={[4, 4, 0, 0]}>
                            {draftHistory.map((_, index) => (
                                <Cell key={index} className="fill-primary" />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    )
}
