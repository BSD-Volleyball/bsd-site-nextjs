"use client"

import type {
    GenderAttritionData,
    CaptainAttritionData,
    CaptainAttritionAvgData,
    GenderRatio
} from "./actions"
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

const GENDER_COLORS: Record<string, string> = {
    Male: "#3b82f6",
    "Not Male": "#ec4899",
    Unknown: "#a1a1aa"
}

function CaptainTooltip({
    active,
    payload
}: {
    active?: boolean
    payload?: { payload: CaptainAttritionData }[]
    label?: string
}) {
    if (!active || !payload?.length) return null
    const data = payload[0].payload
    return (
        <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md">
            <p className="font-medium text-sm">{data.captain}</p>
            <p className="text-sm">Players: {data.count}</p>
            <p className="text-xs" style={{ color: "#3b82f6" }}>
                Male: {data.male}
            </p>
            <p className="text-xs" style={{ color: "#ec4899" }}>
                Non-Male: {data.nonMale}
            </p>
        </div>
    )
}

function CaptainAvgTooltip({
    active,
    payload
}: {
    active?: boolean
    payload?: { payload: CaptainAttritionAvgData }[]
    label?: string
}) {
    if (!active || !payload?.length) return null
    const data = payload[0].payload
    return (
        <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md">
            <p className="font-medium text-sm">{data.captain}</p>
            <p className="text-sm">Avg per season: {data.avg}</p>
            <p className="text-muted-foreground text-xs">
                {data.total} total over {data.seasons} season
                {data.seasons !== 1 ? "s" : ""}
            </p>
            <p className="text-xs" style={{ color: "#3b82f6" }}>
                Male: {data.male}
            </p>
            <p className="text-xs" style={{ color: "#ec4899" }}>
                Non-Male: {data.nonMale}
            </p>
        </div>
    )
}

const CAPTAIN_COLORS = [
    "#3b82f6",
    "#ef4444",
    "#f59e0b",
    "#10b981",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#f97316",
    "#6366f1",
    "#14b8a6",
    "#e11d48",
    "#84cc16",
    "#0ea5e9",
    "#d946ef",
    "#facc15",
    "#22d3ee",
    "#fb7185",
    "#a3e635",
    "#818cf8",
    "#2dd4bf"
]

export function AttritionCharts({
    genderData,
    attritionGenderRatio,
    overallGenderRatio,
    captainData,
    captainAvgData,
    lastSeasonCaptainData,
    lastSeasonCaptainAvgData
}: {
    genderData: GenderAttritionData[]
    attritionGenderRatio: GenderRatio | null
    overallGenderRatio: GenderRatio | null
    captainData: CaptainAttritionData[]
    captainAvgData: CaptainAttritionAvgData[]
    lastSeasonCaptainData: CaptainAttritionData[]
    lastSeasonCaptainAvgData: CaptainAttritionAvgData[]
}) {
    return (
        <div className="space-y-8">
            <Card>
                <CardHeader>
                    <CardTitle>One-Season Players by Gender</CardTitle>
                </CardHeader>
                <CardContent>
                    {genderData.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            No data available.
                        </p>
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={genderData}>
                                <XAxis dataKey="label" />
                                <YAxis allowDecimals={false} />
                                <Tooltip />
                                <Bar
                                    dataKey="count"
                                    name="Players"
                                    radius={[4, 4, 0, 0]}
                                >
                                    {genderData.map((entry) => (
                                        <Cell
                                            key={entry.label}
                                            fill={
                                                GENDER_COLORS[entry.label] ||
                                                "#a1a1aa"
                                            }
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            {(attritionGenderRatio || overallGenderRatio) && (
                <div className="grid gap-4 md:grid-cols-2">
                    {attritionGenderRatio && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">
                                    One-Season Player Gender Ratio
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-baseline gap-2">
                                    <span className="font-bold text-3xl">
                                        {attritionGenderRatio.ratio}
                                    </span>
                                    <span className="text-muted-foreground text-sm">
                                        male to non-male
                                    </span>
                                </div>
                                <p className="mt-1 text-muted-foreground text-xs">
                                    <span
                                        className="font-medium"
                                        style={{ color: "#3b82f6" }}
                                    >
                                        {attritionGenderRatio.male} male
                                    </span>
                                    {" / "}
                                    <span
                                        className="font-medium"
                                        style={{ color: "#ec4899" }}
                                    >
                                        {attritionGenderRatio.nonMale} non-male
                                    </span>
                                </p>
                            </CardContent>
                        </Card>
                    )}
                    {overallGenderRatio && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">
                                    Overall Drafted Player Gender Ratio
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-baseline gap-2">
                                    <span className="font-bold text-3xl">
                                        {overallGenderRatio.ratio}
                                    </span>
                                    <span className="text-muted-foreground text-sm">
                                        male to non-male
                                    </span>
                                </div>
                                <p className="mt-1 text-muted-foreground text-xs">
                                    <span
                                        className="font-medium"
                                        style={{ color: "#3b82f6" }}
                                    >
                                        {overallGenderRatio.male} male
                                    </span>
                                    {" / "}
                                    <span
                                        className="font-medium"
                                        style={{ color: "#ec4899" }}
                                    >
                                        {overallGenderRatio.nonMale} non-male
                                    </span>
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>
                        One-Season Players by Captain (Top 20)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {captainData.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            No data available.
                        </p>
                    ) : (
                        <ResponsiveContainer width="100%" height={500}>
                            <BarChart
                                data={captainData}
                                layout="vertical"
                                margin={{ left: 120 }}
                            >
                                <XAxis type="number" allowDecimals={false} />
                                <YAxis
                                    type="category"
                                    dataKey="captain"
                                    width={110}
                                    tick={{ fontSize: 12 }}
                                />
                                <Tooltip content={<CaptainTooltip />} />
                                <Bar
                                    dataKey="count"
                                    name="Players"
                                    radius={[0, 4, 4, 0]}
                                >
                                    {captainData.map((_, idx) => (
                                        <Cell
                                            key={idx}
                                            fill={
                                                CAPTAIN_COLORS[
                                                    idx % CAPTAIN_COLORS.length
                                                ]
                                            }
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>
                        Lapsed Players by Last Captain (Top 20)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {lastSeasonCaptainData.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            No data available.
                        </p>
                    ) : (
                        <ResponsiveContainer width="100%" height={500}>
                            <BarChart
                                data={lastSeasonCaptainData}
                                layout="vertical"
                                margin={{ left: 120 }}
                            >
                                <XAxis type="number" allowDecimals={false} />
                                <YAxis
                                    type="category"
                                    dataKey="captain"
                                    width={110}
                                    tick={{ fontSize: 12 }}
                                />
                                <Tooltip content={<CaptainTooltip />} />
                                <Bar
                                    dataKey="count"
                                    name="Players"
                                    radius={[0, 4, 4, 0]}
                                >
                                    {lastSeasonCaptainData.map((_, idx) => (
                                        <Cell
                                            key={idx}
                                            fill={
                                                CAPTAIN_COLORS[
                                                    idx % CAPTAIN_COLORS.length
                                                ]
                                            }
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>
                        One-Season Players per Season by Captain (Top 20)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {captainAvgData.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            No data available.
                        </p>
                    ) : (
                        <ResponsiveContainer width="100%" height={500}>
                            <BarChart
                                data={captainAvgData}
                                layout="vertical"
                                margin={{ left: 120 }}
                            >
                                <XAxis type="number" />
                                <YAxis
                                    type="category"
                                    dataKey="captain"
                                    width={110}
                                    tick={{ fontSize: 12 }}
                                />
                                <Tooltip content={<CaptainAvgTooltip />} />
                                <Bar
                                    dataKey="avg"
                                    name="Avg per Season"
                                    radius={[0, 4, 4, 0]}
                                >
                                    {captainAvgData.map((_, idx) => (
                                        <Cell
                                            key={idx}
                                            fill={
                                                CAPTAIN_COLORS[
                                                    idx % CAPTAIN_COLORS.length
                                                ]
                                            }
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>
                        Lapsed Players per Season by Last Captain (Top 20)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {lastSeasonCaptainAvgData.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            No data available.
                        </p>
                    ) : (
                        <ResponsiveContainer width="100%" height={500}>
                            <BarChart
                                data={lastSeasonCaptainAvgData}
                                layout="vertical"
                                margin={{ left: 120 }}
                            >
                                <XAxis type="number" />
                                <YAxis
                                    type="category"
                                    dataKey="captain"
                                    width={110}
                                    tick={{ fontSize: 12 }}
                                />
                                <Tooltip content={<CaptainAvgTooltip />} />
                                <Bar
                                    dataKey="avg"
                                    name="Avg per Season"
                                    radius={[0, 4, 4, 0]}
                                >
                                    {lastSeasonCaptainAvgData.map((_, idx) => (
                                        <Cell
                                            key={idx}
                                            fill={
                                                CAPTAIN_COLORS[
                                                    idx % CAPTAIN_COLORS.length
                                                ]
                                            }
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
