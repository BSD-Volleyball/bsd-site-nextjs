"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from "recharts"

interface EloHistoryItem {
    matchId: number
    seasonId: number
    week: number
    date: string | null
    playoff: boolean
    ratingBefore: number
    ratingAfter: number
    delta: number
}

interface EloTrendChartProps {
    eloHistory: EloHistoryItem[]
    allSeasons: { id: number; year: number; name: string }[]
}

export function EloTrendChart({ eloHistory, allSeasons }: EloTrendChartProps) {
    if (eloHistory.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Skill Rating</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground text-sm">
                        No rated matches yet. Ratings are computed from match
                        results once you play in a season with recorded scores.
                    </p>
                </CardContent>
            </Card>
        )
    }

    const seasonLabels = new Map(
        allSeasons.map((s) => [
            s.id,
            `${s.name.charAt(0).toUpperCase() + s.name.slice(1)} ${s.year}`
        ])
    )

    const chartData = eloHistory.map((item, index) => ({
        ...item,
        matchNumber: index + 1,
        rating: Math.round(item.ratingAfter),
        seasonLabel:
            seasonLabels.get(item.seasonId) ?? `Season ${item.seasonId}`
    }))
    const startRating = Math.round(eloHistory[0].ratingBefore)
    const currentRating = chartData[chartData.length - 1].rating

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">
                    Skill Rating
                    <span className="ml-2 font-normal text-muted-foreground">
                        {currentRating} after {chartData.length} matches
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                    <LineChart
                        data={chartData}
                        margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                    >
                        <XAxis
                            dataKey="matchNumber"
                            tick={{ fontSize: 11 }}
                            label={{
                                value: "Rated match",
                                position: "insideBottom",
                                offset: -2,
                                fontSize: 11
                            }}
                            height={35}
                        />
                        <YAxis
                            domain={["auto", "auto"]}
                            tick={{ fontSize: 11 }}
                            width={45}
                        />
                        <ReferenceLine
                            y={startRating}
                            stroke="var(--muted-foreground)"
                            strokeDasharray="4 4"
                        />
                        <Tooltip
                            content={({ active, payload }) => {
                                if (!active || !payload?.length) return null
                                const d = payload[0].payload
                                const delta = Math.round(d.delta)
                                return (
                                    <div className="rounded-md border bg-background p-3 text-sm shadow-md">
                                        <p className="font-medium">
                                            {d.seasonLabel}, week {d.week}
                                            {d.playoff ? " (playoffs)" : ""}
                                        </p>
                                        {d.date && (
                                            <p className="text-muted-foreground">
                                                {d.date}
                                            </p>
                                        )}
                                        <p className="text-muted-foreground">
                                            Rating: {d.rating} (
                                            {delta >= 0 ? "+" : ""}
                                            {delta})
                                        </p>
                                    </div>
                                )
                            }}
                        />
                        <Line
                            type="monotone"
                            dataKey="rating"
                            stroke="var(--chart-1)"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    )
}
