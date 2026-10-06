import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { CaptainSelectionDivisionStatus } from "../queries"

// "Time to Select Captains" progress, shown during the select_captains phase:
// commissioners see their own divisions, admins see the whole league.

function cardClass(done: boolean) {
    return cn(
        "min-w-[280px] flex-1",
        done
            ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
            : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
    )
}

function textClass(base: string, done: boolean) {
    return cn(
        base,
        done
            ? "text-green-700 dark:text-green-300"
            : "text-amber-700 dark:text-amber-300"
    )
}

function SelectCaptainsLink({ done }: { done: boolean }) {
    return (
        <Link
            href="/dashboard/select-captains"
            className={cn(
                "inline-flex items-center justify-center rounded-md px-4 py-2 font-medium text-sm text-white",
                done
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-amber-600 hover:bg-amber-700"
            )}
        >
            Select Captains
        </Link>
    )
}

export function CommissionerCaptainSelectionCard({
    statuses
}: {
    statuses: CaptainSelectionDivisionStatus[]
}) {
    const completed = statuses.filter((status) => status.isComplete).length
    const allCompleted = statuses.length > 0 && completed === statuses.length

    return (
        <Card className={cardClass(allCompleted)}>
            <CardHeader className="pb-2">
                <CardTitle className={textClass("text-lg", allCompleted)}>
                    Time to Select Captains
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className={textClass("text-sm", allCompleted)}>
                    {allCompleted
                        ? "Great work. You've completed captain selection for all of your assigned divisions."
                        : `Captain selection is complete in ${completed} of ${statuses.length} assigned divisions.`}
                </p>
                {statuses.length > 0 && (
                    <p className={textClass("text-sm", allCompleted)}>
                        {statuses
                            .map(
                                (status) =>
                                    `${status.divisionName} (${status.teamsWithCaptain}/${status.requiredTeams})`
                            )
                            .join(", ")}
                    </p>
                )}
                <SelectCaptainsLink done={allCompleted} />
            </CardContent>
        </Card>
    )
}

export function AdminCaptainSelectionCard({
    statuses
}: {
    statuses: CaptainSelectionDivisionStatus[]
}) {
    const completed = statuses.filter((status) => status.isComplete).length
    const allCompleted = statuses.length > 0 && completed === statuses.length
    const completedNames = statuses
        .filter((status) => status.isComplete)
        .map((status) => status.divisionName)
        .join(", ")
    const pendingNames = statuses
        .filter((status) => !status.isComplete)
        .map((status) => status.divisionName)
        .join(", ")

    return (
        <Card className={cardClass(allCompleted)}>
            <CardHeader className="pb-2">
                <CardTitle className={textClass("text-lg", allCompleted)}>
                    Time to Select Captains
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className={textClass("text-sm", allCompleted)}>
                    {allCompleted
                        ? "All divisions have selected captains. Great work, and it's time to move the season to the next phase."
                        : `Captain selection is complete in ${completed} of ${statuses.length} divisions.`}
                </p>
                <p className={textClass("text-sm", allCompleted)}>
                    Completed divisions: {completedNames || "None yet"}
                </p>
                <p className={textClass("text-sm", allCompleted)}>
                    Pending divisions: {pendingNames || "None"}
                </p>
                <SelectCaptainsLink done={allCompleted} />
            </CardContent>
        </Card>
    )
}
