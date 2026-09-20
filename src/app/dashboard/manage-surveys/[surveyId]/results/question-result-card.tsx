"use client"

import { useState } from "react"
import {
    Bar,
    BarChart,
    CartesianGrid,
    LabelList,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from "recharts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import type { QuestionAggregate } from "@/lib/surveys/reporting"
import type { SurveyQuestionDef } from "@/lib/surveys/types"

const CHART_COLORS = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)"
]

const TEXT_PAGE_SIZE = 50

function StatTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md border px-3 py-2">
            <div className="font-semibold text-lg">{value}</div>
            <div className="text-muted-foreground text-xs">{label}</div>
        </div>
    )
}

export function QuestionResultCard({
    question,
    aggregate
}: {
    question: SurveyQuestionDef
    aggregate: QuestionAggregate
}) {
    const [textShown, setTextShown] = useState(TEXT_PAGE_SIZE)

    if (aggregate.type === "section") {
        return (
            <div className="border-t pt-4">
                <h3 className="font-semibold text-lg">{question.prompt}</h3>
                {question.helpText && (
                    <p className="text-muted-foreground text-sm">
                        {question.helpText}
                    </p>
                )}
            </div>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{question.prompt}</CardTitle>
                {question.helpText && (
                    <p className="font-normal text-muted-foreground text-sm">
                        {question.helpText}
                    </p>
                )}
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-muted-foreground text-sm">
                    {aggregate.answered} answered
                </p>

                {aggregate.type === "yes_no" && (
                    <ResponsiveContainer width="100%" height={160}>
                        <BarChart
                            data={[
                                {
                                    label: "Yes",
                                    count: aggregate.yes,
                                    pct: aggregate.yesPct
                                },
                                {
                                    label: "No",
                                    count: aggregate.no,
                                    pct:
                                        aggregate.answered > 0
                                            ? Math.round(
                                                  (aggregate.no /
                                                      aggregate.answered) *
                                                      1000
                                              ) / 10
                                            : null
                                }
                            ]}
                            layout="vertical"
                            margin={{ left: 20 }}
                        >
                            <XAxis type="number" allowDecimals={false} />
                            <YAxis type="category" dataKey="label" width={60} />
                            <Tooltip
                                formatter={(value, _name, entry) => {
                                    const pct = (
                                        entry.payload as { pct: number | null }
                                    ).pct
                                    return [
                                        pct !== null
                                            ? `${value} (${pct}%)`
                                            : value,
                                        "Count"
                                    ]
                                }}
                            />
                            <Bar
                                dataKey="count"
                                fill="var(--chart-1)"
                                radius={[0, 4, 4, 0]}
                            >
                                <LabelList
                                    dataKey="pct"
                                    position="right"
                                    formatter={(value) =>
                                        value !== null && value !== undefined
                                            ? `${value}%`
                                            : ""
                                    }
                                />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}

                {aggregate.type === "rating" && (
                    <>
                        <div className="flex flex-wrap gap-3">
                            <StatTile
                                label="Mean"
                                value={aggregate.mean?.toString() ?? "—"}
                            />
                            <StatTile
                                label="Median"
                                value={aggregate.median?.toString() ?? "—"}
                            />
                            {aggregate.nps && (
                                <StatTile
                                    label="NPS"
                                    value={aggregate.nps.score.toString()}
                                />
                            )}
                        </div>
                        {aggregate.distribution.length > 0 && (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={aggregate.distribution}>
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        vertical={false}
                                    />
                                    <XAxis
                                        dataKey="value"
                                        tick={{ fontSize: 12 }}
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        tick={{ fontSize: 12 }}
                                    />
                                    <Tooltip />
                                    <Bar
                                        dataKey="count"
                                        fill="var(--chart-1)"
                                        radius={[4, 4, 0, 0]}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </>
                )}

                {aggregate.type === "likert" && (
                    <>
                        <div className="flex flex-wrap gap-3">
                            <StatTile
                                label="Mean (1-5)"
                                value={aggregate.mean?.toString() ?? "—"}
                            />
                            <StatTile
                                label="Agree %"
                                value={
                                    aggregate.topBoxPct !== null
                                        ? `${aggregate.topBoxPct}%`
                                        : "—"
                                }
                            />
                        </div>
                        {aggregate.options.length > 0 && (
                            <ResponsiveContainer width="100%" height={90}>
                                <BarChart
                                    data={[
                                        Object.fromEntries(
                                            aggregate.options.map((opt) => [
                                                opt.key,
                                                opt.count
                                            ])
                                        )
                                    ]}
                                    layout="vertical"
                                    margin={{ left: 0 }}
                                >
                                    <XAxis type="number" hide />
                                    <YAxis type="category" hide />
                                    <Tooltip />
                                    {aggregate.options.map((opt, idx) => (
                                        <Bar
                                            key={opt.key}
                                            dataKey={opt.key}
                                            name={opt.label}
                                            stackId="likert"
                                            fill={
                                                CHART_COLORS[
                                                    idx % CHART_COLORS.length
                                                ]
                                            }
                                        />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {aggregate.options.map((opt, idx) => (
                                <Badge
                                    key={opt.key}
                                    variant="outline"
                                    style={{
                                        borderColor:
                                            CHART_COLORS[
                                                idx % CHART_COLORS.length
                                            ]
                                    }}
                                >
                                    {opt.label}: {opt.count} ({opt.pct}%)
                                </Badge>
                            ))}
                        </div>
                    </>
                )}

                {(aggregate.type === "single_choice" ||
                    aggregate.type === "multi_choice") && (
                    <ResponsiveContainer
                        width="100%"
                        height={Math.max(
                            80,
                            aggregate.options.length * 40 + 20
                        )}
                    >
                        <BarChart
                            data={[...aggregate.options].sort(
                                (a, b) => b.count - a.count
                            )}
                            layout="vertical"
                            margin={{ left: 100 }}
                        >
                            <XAxis type="number" allowDecimals={false} />
                            <YAxis
                                type="category"
                                dataKey="label"
                                width={100}
                                tick={{ fontSize: 12 }}
                            />
                            <Tooltip
                                formatter={(value, _name, entry) => [
                                    `${value} (${
                                        (entry.payload as { pct: number }).pct
                                    }%)`,
                                    "Count"
                                ]}
                            />
                            <Bar
                                dataKey="count"
                                fill="var(--chart-1)"
                                radius={[0, 4, 4, 0]}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                )}

                {aggregate.type === "ranking" && (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Option</TableHead>
                                <TableHead>Average position</TableHead>
                                <TableHead>First-place count</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {[...aggregate.options]
                                .sort((a, b) => {
                                    if (a.averagePosition === null) return 1
                                    if (b.averagePosition === null) return -1
                                    return a.averagePosition - b.averagePosition
                                })
                                .map((opt) => (
                                    <TableRow key={opt.key}>
                                        <TableCell>{opt.label}</TableCell>
                                        <TableCell>
                                            {opt.averagePosition ?? "—"}
                                        </TableCell>
                                        <TableCell>{opt.firstPlace}</TableCell>
                                    </TableRow>
                                ))}
                        </TableBody>
                    </Table>
                )}

                {aggregate.type === "text" && (
                    <div className="space-y-2">
                        {aggregate.answers.length === 0 ? (
                            <p className="text-muted-foreground text-sm">
                                No responses.
                            </p>
                        ) : (
                            <>
                                <ul className="space-y-2">
                                    {aggregate.answers
                                        .slice(0, textShown)
                                        .map((answer, idx) => (
                                            <li
                                                key={idx}
                                                className="rounded-md border p-2 text-sm"
                                            >
                                                {answer}
                                            </li>
                                        ))}
                                </ul>
                                {textShown < aggregate.answers.length && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            setTextShown(
                                                (n) => n + TEXT_PAGE_SIZE
                                            )
                                        }
                                    >
                                        Show more
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
