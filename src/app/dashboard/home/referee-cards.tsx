import { RiAlertLine, RiCalendarLine, RiCheckLine } from "@remixicon/react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { RefScheduleStatus, RefUpcomingMatch } from "./load-staff"

export function RefAssignmentsCard({
    matches
}: {
    matches: RefUpcomingMatch[]
}) {
    return (
        <Card className="min-w-[280px] flex-1 border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <RiCalendarLine className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    <CardTitle className="text-lg text-teal-700 dark:text-teal-300">
                        Your Upcoming Ref Assignments
                    </CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-sm text-teal-700 dark:text-teal-300">
                    You have {matches.length} match
                    {matches.length !== 1 ? "es" : ""} to ref on{" "}
                    {new Date(`${matches[0].date}T00:00:00`).toLocaleDateString(
                        "en-US",
                        {
                            weekday: "short",
                            month: "short",
                            day: "numeric"
                        }
                    )}
                    .
                </p>
                <div className="space-y-2">
                    {matches.map((m, i) => (
                        <div
                            key={`ref-match-${m.court}-${m.time}-${i}`}
                            className="rounded-md bg-teal-100 p-2 text-sm text-teal-800 dark:bg-teal-900 dark:text-teal-200"
                        >
                            <span className="font-medium">
                                {m.divisionName}
                            </span>{" "}
                            — Court {m.court},{" "}
                            {m.time
                                ? new Date(
                                      `2000-01-01T${m.time}`
                                  ).toLocaleTimeString("en-US", {
                                      hour: "numeric",
                                      minute: "2-digit"
                                  })
                                : "TBD"}
                            <br />
                            {m.homeTeamName} vs {m.awayTeamName}
                        </div>
                    ))}
                </div>
                <Link
                    href="/dashboard/reffing-schedule"
                    className="inline-flex items-center justify-center rounded-md bg-teal-600 px-4 py-2 font-medium text-sm text-white hover:bg-teal-700"
                >
                    View Full Schedule
                </Link>
            </CardContent>
        </Card>
    )
}

export function RefSchedulingCard({ status }: { status: RefScheduleStatus }) {
    return (
        <Card
            className={cn(
                "min-w-[280px] flex-1",
                status.fullyScheduled
                    ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
                    : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
            )}
        >
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    {status.fullyScheduled ? (
                        <RiCheckLine className="h-5 w-5 text-green-600 dark:text-green-400" />
                    ) : (
                        <RiAlertLine className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    )}
                    <CardTitle
                        className={cn(
                            "text-lg",
                            status.fullyScheduled
                                ? "text-green-700 dark:text-green-300"
                                : "text-amber-700 dark:text-amber-300"
                        )}
                    >
                        Ref Scheduling — {status.nextDateLabel}
                    </CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <p
                    className={cn(
                        "text-sm",
                        status.fullyScheduled
                            ? "text-green-700 dark:text-green-300"
                            : "text-amber-700 dark:text-amber-300"
                    )}
                >
                    {status.fullyScheduled
                        ? `All ${status.totalMatches} matches are fully staffed with referees.`
                        : `${status.assignedMatches} of ${status.totalMatches} matches have refs assigned. ${status.totalMatches - status.assignedMatches} still need attention.`}
                </p>
                <Link
                    href="/dashboard/schedule-refs"
                    className={cn(
                        "inline-flex items-center justify-center rounded-md px-4 py-2 font-medium text-sm text-white",
                        status.fullyScheduled
                            ? "bg-green-600 hover:bg-green-700"
                            : "bg-amber-600 hover:bg-amber-700"
                    )}
                >
                    {status.fullyScheduled
                        ? "View Schedule"
                        : "Finish Scheduling"}
                </Link>
            </CardContent>
        </Card>
    )
}
