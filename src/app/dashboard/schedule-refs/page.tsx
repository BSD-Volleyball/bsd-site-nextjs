import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { isAdminOrDirectorBySession, hasPermissionBySession } from "@/lib/rbac"
import { getScheduleRefsData, getMatchesAndRefsForDate } from "./actions"
import { ScheduleRefsClient } from "./schedule-refs-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Schedule Refs"
}

export const dynamic = "force-dynamic"

export default async function ScheduleRefsPage() {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
        redirect("/auth/sign-in")
    }

    const [hasPermission, isAdmin] = await Promise.all([
        hasPermissionBySession("schedule:manage"),
        isAdminOrDirectorBySession()
    ])

    if (!hasPermission && !isAdmin) {
        redirect("/dashboard")
    }

    const result = await getScheduleRefsData()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Schedule Refs"
                    description="Assign referees to matches"
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message}
                </div>
            </div>
        )
    }

    const { seasonLabel, matchDates } = result.data

    // Find the best default date: today or the next upcoming date
    let defaultDate: string | null = null
    if (matchDates.length > 0) {
        const today = new Date().toISOString().slice(0, 10)
        const upcoming = matchDates.find((d) => d.date >= today)
        defaultDate = upcoming?.date ?? matchDates[matchDates.length - 1].date
    }

    // Pre-fetch data for default date
    let initialData = null
    if (defaultDate) {
        const dateResult = await getMatchesAndRefsForDate(defaultDate)
        if (dateResult.status) {
            initialData = dateResult.data
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Schedule Refs"
                description={`Assign referees to matches for ${seasonLabel}`}
            />
            <ScheduleRefsClient
                matchDates={matchDates}
                initialDate={defaultDate}
                initialData={initialData}
            />
        </div>
    )
}
