import { RiStarLine } from "@remixicon/react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { site } from "@/config/site"
import { cn } from "@/lib/utils"

// Cards for league staff: new-player evaluations, assigned concerns,
// tryout materials and player ratings.

export function EvaluateNewPlayersCard({
    evalStats
}: {
    evalStats: { totalNew: number; ratedByUser: number }
}) {
    const done =
        evalStats.totalNew > 0 && evalStats.ratedByUser >= evalStats.totalNew
    const tone = (completed: string, pending: string) =>
        done ? completed : pending

    return (
        <Card
            className={cn(
                "min-w-[280px] flex-1",
                tone(
                    "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950",
                    "border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950"
                )
            )}
        >
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <RiStarLine
                        className={cn(
                            "h-5 w-5",
                            tone(
                                "text-green-600 dark:text-green-400",
                                "text-purple-600 dark:text-purple-400"
                            )
                        )}
                    />
                    <CardTitle
                        className={cn(
                            "text-lg",
                            tone(
                                "text-green-700 dark:text-green-300",
                                "text-purple-700 dark:text-purple-300"
                            )
                        )}
                    >
                        Evaluate New Players
                    </CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <p
                    className={cn(
                        "text-sm",
                        tone(
                            "text-green-700 dark:text-green-300",
                            "text-purple-700 dark:text-purple-300"
                        )
                    )}
                >
                    {done
                        ? `Great work. You have evaluated all ${evalStats.totalNew} current new players.`
                        : `There are ${evalStats.totalNew} new players this season. You've evaluated ${evalStats.ratedByUser} of ${evalStats.totalNew}.`}
                </p>
                <Link
                    href="/dashboard/evaluate-players"
                    className={cn(
                        "inline-flex items-center justify-center rounded-md px-4 py-2 font-medium text-sm text-white",
                        tone(
                            "bg-green-600 hover:bg-green-700",
                            "bg-purple-600 hover:bg-purple-700"
                        )
                    )}
                >
                    Evaluate New Players
                </Link>
            </CardContent>
        </Card>
    )
}

export function AssignedConcernsCard({ count }: { count: number }) {
    return (
        <Card className="min-w-[280px] flex-1 border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30">
            <CardHeader className="pb-2">
                <CardTitle className="text-amber-900 text-lg dark:text-amber-100">
                    Active Concerns Assigned
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-amber-800 text-sm dark:text-amber-200">
                    You have {count} active{" "}
                    {count === 1 ? "concern" : "concerns"} assigned to you.
                </p>
                <Link
                    href="/dashboard/manage-concerns"
                    className="inline-flex items-center justify-center rounded-md bg-amber-700 px-4 py-2 font-medium text-sm text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
                >
                    Open Manage Concerns
                </Link>
            </CardContent>
        </Card>
    )
}

export function TryoutMaterialsCard({
    week,
    hasTryoutSheetAccess,
    isAdmin
}: {
    week: 1 | 2 | 3
    hasTryoutSheetAccess: boolean
    isAdmin: boolean
}) {
    const tone = (weekOne: string, later: string) =>
        week === 1 ? weekOne : later
    const textClass = cn(
        "text-sm",
        tone(
            "text-blue-700 dark:text-blue-300",
            "text-indigo-700 dark:text-indigo-300"
        )
    )
    const buttonClass = cn(
        "inline-flex items-center justify-center rounded-md px-4 py-2 font-medium text-sm text-white",
        tone(
            "bg-blue-600 hover:bg-blue-700",
            "bg-indigo-600 hover:bg-indigo-700"
        )
    )

    return (
        <Card
            className={cn(
                "min-w-[280px] flex-1",
                tone(
                    "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950",
                    "border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950"
                )
            )}
        >
            <CardHeader className="pb-2">
                <CardTitle
                    className={cn(
                        "text-lg",
                        tone(
                            "text-blue-700 dark:text-blue-300",
                            "text-indigo-700 dark:text-indigo-300"
                        )
                    )}
                >
                    Week {week} Tryout Materials
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {hasTryoutSheetAccess && (
                    <div className="space-y-2">
                        <p className={textClass}>
                            {week === 1
                                ? "Download the latest week 1 tryout sheets PDF for on-court evaluations."
                                : `Download the latest week ${week} tryout sheets PDF by division/session for on-court evaluations.`}
                        </p>
                        <a
                            href={`/dashboard/edit-week-${week}/tryout-sheets`}
                            className={buttonClass}
                        >
                            Download Week {week} Tryout Sheets PDF
                        </a>
                    </div>
                )}
                {isAdmin && (
                    <div className="space-y-2">
                        <p className={textClass}>
                            Download Week {week}{" "}
                            {week === 1 ? "sessions 1 and 2" : "sessions 1-3"}{" "}
                            Nametags. Should be printed on{" "}
                            <a
                                href={site.links.avery5164Labels}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:opacity-80"
                            >
                                Avery 5164 labels
                            </a>
                            .
                        </p>
                        <a
                            href={`/dashboard/edit-week-${week}/nametags`}
                            className={buttonClass}
                        >
                            Download Week {week} Nametag PDF
                        </a>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

export function RatePlayersCard() {
    return (
        <Card className="min-w-[280px] flex-1 border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <RiStarLine className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                    <CardTitle className="text-lg text-violet-700 dark:text-violet-300">
                        Rate Players
                    </CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-sm text-violet-700 dark:text-violet-300">
                    Please take time to rate players on the Rate Player page.
                    Your ratings help place playeres in the appropriate groups
                    for the remaining tryouts.
                </p>
                <Link
                    href="/dashboard/rate-player"
                    className="inline-flex items-center justify-center rounded-md bg-violet-600 px-4 py-2 font-medium text-sm text-white hover:bg-violet-700"
                >
                    Rate Players
                </Link>
            </CardContent>
        </Card>
    )
}
