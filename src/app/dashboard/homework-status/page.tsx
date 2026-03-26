import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { HomeworkStatusView } from "./homework-status-view"
import { getHomeworkStatusData } from "./actions"
import { getIsCommissioner } from "@/app/dashboard/actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Homework Status"
}

export const revalidate = 300

export default async function HomeworkStatusPage({
    searchParams
}: {
    searchParams: Promise<{ divisionId?: string }>
}) {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await getIsCommissioner()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const params = await searchParams
    const parsed = params.divisionId
        ? parseInt(params.divisionId, 10)
        : undefined
    const divisionIdParam =
        parsed !== undefined && !Number.isNaN(parsed) && parsed > 0
            ? parsed
            : undefined

    const result = await getHomeworkStatusData(divisionIdParam)

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Homework Status"
                    description="Track captain homework completion across divisions."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load homework status data."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${result.seasonLabel} Homework Status`}
                description="Track whether each captain has completed their pre-draft homework tasks."
            />
            <HomeworkStatusView
                availableDivisions={result.availableDivisions}
                selectedDivisionId={result.selectedDivisionId}
                canSelectDivision={result.canSelectDivision}
                divisions={result.divisions}
                seasonId={result.seasonId}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
            />
        </div>
    )
}
