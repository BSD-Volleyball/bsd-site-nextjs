"use client"

import {
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { StatusBanner } from "@/components/ui/status-banner"
import type { QuestionTrend } from "@/lib/surveys/reporting"

const CHART_COLORS = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)"
]

function nonNullCount(points: { value: number | null }[]): number {
    return points.filter((p) => p.value !== null).length
}

function TrendTable({ trend }: { trend: QuestionTrend }) {
    const instanceLabels = trend.series[0]?.points.map((p) => p.label) ?? []
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Series</TableHead>
                    {instanceLabels.map((label, idx) => (
                        <TableHead key={`${label}-${idx}`}>{label}</TableHead>
                    ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {trend.series.map((series) => (
                    <TableRow key={series.key}>
                        <TableCell className="font-medium">
                            {series.label}
                        </TableCell>
                        {series.points.map((point, idx) => (
                            <TableCell key={`${point.surveyId}-${idx}`}>
                                {point.value !== null
                                    ? `${point.value} (n=${point.n})`
                                    : "—"}
                            </TableCell>
                        ))}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}

function TrendChart({ trend }: { trend: QuestionTrend }) {
    const instanceCount = trend.series[0]?.points.length ?? 0
    const chartData = Array.from({ length: instanceCount }).map((_, idx) => {
        const row: Record<string, string | number | null> = {
            label: trend.series[0]?.points[idx]?.label ?? ""
        }
        for (const series of trend.series) {
            row[series.key] = series.points[idx]?.value ?? null
            row[`${series.key}__n`] = series.points[idx]?.n ?? 0
        }
        return row
    })

    return (
        <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                    formatter={(value, name, entry) => {
                        const series = trend.series.find((s) => s.key === name)
                        const n = (
                            entry.payload as Record<string, number | null>
                        )[`${name}__n`]
                        return [
                            value !== null && value !== undefined
                                ? `${value} (n = ${n ?? 0})`
                                : "—",
                            series?.label ?? String(name)
                        ]
                    }}
                />
                {trend.series.map((series, idx) => (
                    <Line
                        key={series.key}
                        type="monotone"
                        dataKey={series.key}
                        name={series.key}
                        stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                        strokeWidth={2}
                        connectNulls={false}
                        dot={{ r: 3 }}
                    />
                ))}
            </LineChart>
        </ResponsiveContainer>
    )
}

export function TrendsClient({ trends }: { trends: QuestionTrend[] }) {
    const visible = trends.filter((trend) => trend.series.length > 0)

    if (visible.length === 0) {
        return (
            <StatusBanner variant="info">
                No trend data yet. Trends appear once this template has been
                used for more than one survey.
            </StatusBanner>
        )
    }

    return (
        <div className="space-y-6">
            {visible.map((trend) => {
                const maxNonNull = Math.max(
                    0,
                    ...trend.series.map((s) => nonNullCount(s.points))
                )
                const tableOnly = maxNonNull <= 1

                return (
                    <Card key={trend.question.id}>
                        <CardHeader>
                            <CardTitle className="text-base">
                                {trend.question.prompt}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {!tableOnly && <TrendChart trend={trend} />}
                            <TrendTable trend={trend} />
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    )
}
