"use client"

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog"
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
    /** Chart height in px. The popup renders a shorter chart than the page. */
    height?: number
}

export function EloTrendChart({
    eloHistory,
    allSeasons,
    height = 250
}: EloTrendChartProps) {
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
                <CardDescription>
                    Skill ratings are a work in progress — values may shift as
                    we tune the model. For how it&apos;s done currently{" "}
                    <Dialog>
                        <DialogTrigger className="underline underline-offset-2 hover:text-foreground">
                            click here
                        </DialogTrigger>
                        <DialogContent className="max-h-[85vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>
                                    How skill ratings work
                                </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 text-sm">
                                <p>
                                    Every player carries a personal rating that
                                    follows them across seasons and divisions.
                                    It moves after every match with a recorded
                                    result, based on how your team did compared
                                    to what the ratings predicted.
                                </p>
                                <div>
                                    <h4 className="mb-1 font-medium">
                                        Your starting rating
                                    </h4>
                                    <p className="text-muted-foreground">
                                        Your first rated match seeds you from
                                        the division you&apos;re playing in: BB
                                        starts at 1000 and each division up adds
                                        150, so AA starts at 1750. Within a
                                        season your rating simply carries
                                        forward, even if you change divisions.
                                    </p>
                                </div>
                                <div>
                                    <h4 className="mb-1 font-medium">
                                        Between seasons
                                    </h4>
                                    <p className="text-muted-foreground">
                                        At your first match of each new season,
                                        your rating is nudged toward the
                                        starting value of the division
                                        you&apos;re drafted into: 90% your old
                                        rating, 10% the division&apos;s starting
                                        value. Time away pulls harder — each
                                        season you sit out shifts another 10%
                                        toward the starting value, so after nine
                                        or more missed seasons you come back
                                        seeded fresh, just like a newcomer.
                                        Subbing for a match doesn&apos;t
                                        re-anchor you — you play with your
                                        rating as-is, though wins and losses
                                        still count — but it does count as
                                        staying active. Season-long replacements
                                        are treated like drafted players.
                                    </p>
                                </div>
                                <div>
                                    <h4 className="mb-1 font-medium">
                                        After each match
                                    </h4>
                                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                                        <li>
                                            Each team&apos;s strength is the
                                            average rating of the players who
                                            actually played, subs included.
                                        </li>
                                        <li>
                                            The rating gap between the two teams
                                            sets an expected result — evenly
                                            matched teams are expected to split,
                                            heavy favorites are expected to win
                                            big.
                                        </li>
                                        <li>
                                            The actual result is the share of
                                            sets your team won: 2–0 counts as a
                                            full win, 2–1 as about two thirds.
                                        </li>
                                        <li>
                                            Your rating changes by 32 × (actual
                                            − expected). Everyone on the winning
                                            roster gains the same amount, and
                                            everyone on the losing roster loses
                                            that amount.
                                        </li>
                                    </ul>
                                </div>
                                <div>
                                    <h4 className="mb-1 font-medium">
                                        What that means in practice
                                    </h4>
                                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                                        <li>
                                            Sweeping an evenly matched team is
                                            worth about +16; a 2–1 win over them
                                            only about +5.
                                        </li>
                                        <li>
                                            Upsetting a much stronger team can
                                            pay close to +30, while a heavy
                                            favorite earns very little for an
                                            expected win.
                                        </li>
                                        <li>
                                            A heavy favorite that only wins 2–1
                                            can even lose a few points, because
                                            it underperformed the prediction.
                                        </li>
                                        <li>
                                            Ratings are team-based: the system
                                            only sees match results, so everyone
                                            on the roster moves together
                                            regardless of individual
                                            performance.
                                        </li>
                                    </ul>
                                </div>
                                <p className="text-muted-foreground">
                                    Matches without a usable recorded result are
                                    skipped and don&apos;t move anyone&apos;s
                                    rating.
                                </p>
                            </div>
                        </DialogContent>
                    </Dialog>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={height}>
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
