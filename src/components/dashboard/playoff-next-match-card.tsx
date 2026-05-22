import { RiCalendarLine } from "@remixicon/react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { PlayoffNextMatchData } from "@/app/dashboard/actions"

function formatShortDate(date: string | null): string {
    if (!date) return "TBD"
    const parts = date.split("-")
    if (parts.length !== 3) return date
    const [y, m, d] = parts
    return `${m}/${d}/${y.slice(2)}`
}

export function PlayoffNextMatchCard({ data }: { data: PlayoffNextMatchData }) {
    // The team's last playoff night has passed but results aren't in yet, so
    // there is no determinable upcoming match to show.
    if (data.status === "pending_results") {
        return (
            <Card className="min-w-[280px] flex-1 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                        <RiCalendarLine className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <CardTitle className="text-blue-700 text-lg dark:text-blue-300">
                            Your Next Match
                        </CardTitle>
                    </div>
                    <p className="mt-1 text-blue-700 text-xs dark:text-blue-300">
                        Playoffs
                        {data.divisionName ? ` · ${data.divisionName}` : ""}
                    </p>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="rounded-md bg-blue-100 p-3 text-sm dark:bg-blue-900">
                        <p className="text-blue-700 dark:text-blue-300">
                            Results Pending,{" "}
                            <Link
                                href="/dashboard/season-playoffs"
                                className="underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-200"
                            >
                                check the bracket
                            </Link>{" "}
                            for more information.
                        </p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (data.items.length === 0) return null

    return (
        <Card className="min-w-[280px] flex-1 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <RiCalendarLine className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <CardTitle className="text-blue-700 text-lg dark:text-blue-300">
                        Your Next Match
                    </CardTitle>
                </div>
                <p className="mt-1 text-blue-700 text-xs dark:text-blue-300">
                    Playoffs Week {data.week}
                    {data.date ? ` · ${formatShortDate(data.date)}` : ""} ·{" "}
                    {data.divisionName}
                </p>
            </CardHeader>
            <CardContent className="space-y-3">
                <ul className="space-y-2">
                    {data.items.map((item, idx) => (
                        <li
                            key={`${item.role}-${item.matchNum}-${idx}`}
                            className="rounded-md bg-blue-100 p-3 text-sm dark:bg-blue-900"
                        >
                            {item.condition && (
                                <p className="mb-1 text-blue-700 text-xs italic dark:text-blue-300">
                                    {item.condition}
                                </p>
                            )}
                            <div className="flex items-center gap-2">
                                <Badge
                                    variant={
                                        item.role === "play"
                                            ? "default"
                                            : "secondary"
                                    }
                                    className={cn(
                                        "px-2 py-0 text-[10px] uppercase",
                                        item.role === "play"
                                            ? "bg-blue-600 text-white hover:bg-blue-600"
                                            : ""
                                    )}
                                >
                                    {item.role === "play" ? "Play" : "Work"}
                                </Badge>
                                <span className="font-semibold text-blue-800 dark:text-blue-200">
                                    Match #{item.matchNum}
                                </span>
                                <span className="ml-auto text-blue-700 text-xs dark:text-blue-300">
                                    {item.time ?? "TBD"}
                                    {item.court !== null
                                        ? ` · Ct ${item.court}`
                                        : ""}
                                </span>
                            </div>
                            {item.role === "play" && item.opponentLabel && (
                                <div className="mt-1 flex justify-between">
                                    <span className="text-blue-700 dark:text-blue-300">
                                        Opponent:
                                    </span>
                                    <span className="font-semibold text-blue-800 dark:text-blue-200">
                                        {item.opponentLabel}
                                    </span>
                                </div>
                            )}
                            {item.role === "play" && (
                                <div className="mt-1 flex justify-between">
                                    <span className="text-blue-700 dark:text-blue-300">
                                        Availability:
                                    </span>
                                    <span
                                        className={cn(
                                            "font-semibold",
                                            item.isUnavailable
                                                ? "text-red-600 dark:text-red-400"
                                                : "text-green-700 dark:text-green-400"
                                        )}
                                    >
                                        {item.isUnavailable
                                            ? "Not Available"
                                            : "Available"}
                                    </span>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
                <p className="text-blue-600 text-xs dark:text-blue-400">
                    Can't make a playoff night?{" "}
                    <Link
                        href="/dashboard/my-availability"
                        className="underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-200"
                    >
                        update your availability
                    </Link>{" "}
                    so your captain knows.
                </p>
                <Link
                    href="/dashboard/season-playoffs"
                    className="block text-center text-blue-700 text-sm underline underline-offset-4 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-200"
                >
                    View Playoff Bracket →
                </Link>
            </CardContent>
        </Card>
    )
}
