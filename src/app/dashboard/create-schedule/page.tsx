import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import { PageHeader } from "@/components/layout/page-header"
import { getCreateScheduleData } from "./actions"
import { CreateScheduleClient } from "./create-schedule-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Create Schedule"
}

export const dynamic = "force-dynamic"

export default async function CreateSchedulePage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await isAdminOrDirectorBySession()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const data = await getCreateScheduleData()

    if (!data.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Create Schedule"
                    description="Generate regular season and playoff schedules."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {data.message || "Failed to load data."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Create Schedule"
                description={`Generate regular season and playoff schedules for ${data.seasonLabel}.`}
            />
            <CreateScheduleClient
                seasonId={data.seasonId}
                seasonLabel={data.seasonLabel}
                divisions={data.divisions}
                seasonDates={data.seasonDates}
                playoffDates={data.playoffDates}
            />
        </div>
    )
}
