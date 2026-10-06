import { RiCalendarLine } from "@remixicon/react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatShortDate } from "@/lib/site-config"
import type { NextMatch } from "../next-match-data"

export function NextMatchCard({ nextMatch }: { nextMatch: NextMatch }) {
    return (
        <Card className="min-w-[280px] flex-1 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <RiCalendarLine className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <CardTitle className="text-blue-700 text-lg dark:text-blue-300">
                        Your Next Match
                    </CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="space-y-1.5 rounded-md bg-blue-100 p-3 text-sm dark:bg-blue-900">
                    <div className="flex justify-between">
                        <span className="text-blue-700 dark:text-blue-300">
                            Date:
                        </span>
                        <span className="font-semibold text-blue-800 dark:text-blue-200">
                            {formatShortDate(nextMatch.date)}
                        </span>
                    </div>
                    {nextMatch.time && (
                        <div className="flex justify-between">
                            <span className="text-blue-700 dark:text-blue-300">
                                Time:
                            </span>
                            <span className="font-semibold text-blue-800 dark:text-blue-200">
                                {nextMatch.time}
                            </span>
                        </div>
                    )}
                    {nextMatch.court !== null && (
                        <div className="flex justify-between">
                            <span className="text-blue-700 dark:text-blue-300">
                                Court:
                            </span>
                            <span className="font-semibold text-blue-800 dark:text-blue-200">
                                Court {nextMatch.court}
                            </span>
                        </div>
                    )}
                    <div className="flex justify-between">
                        <span className="text-blue-700 dark:text-blue-300">
                            Opponent:
                        </span>
                        <span className="font-semibold text-blue-800 dark:text-blue-200">
                            {nextMatch.opponentName}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-blue-700 dark:text-blue-300">
                            Division:
                        </span>
                        <span className="font-semibold text-blue-800 dark:text-blue-200">
                            {nextMatch.divisionName}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-blue-700 dark:text-blue-300">
                            Availability:
                        </span>
                        <span
                            className={
                                nextMatch.isUnavailable
                                    ? "font-semibold text-red-600 dark:text-red-400"
                                    : "font-semibold text-green-700 dark:text-green-400"
                            }
                        >
                            {nextMatch.isUnavailable
                                ? "Not Available"
                                : "Available"}
                        </span>
                    </div>
                </div>
                <p className="text-blue-600 text-sm dark:text-blue-400">
                    {nextMatch.isUnavailable
                        ? "You've marked this date as unavailable. If you can now make it, "
                        : "Can't make this match? "}
                    <Link
                        href="/dashboard/my-availability"
                        className="underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-200"
                    >
                        update your availability
                    </Link>
                    {nextMatch.isUnavailable ? "." : " so your captain knows."}
                </p>
                <Link
                    href="/dashboard/season-schedule"
                    className="block text-center text-blue-700 text-sm underline underline-offset-4 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-200"
                >
                    View Full Schedule →
                </Link>
            </CardContent>
        </Card>
    )
}
