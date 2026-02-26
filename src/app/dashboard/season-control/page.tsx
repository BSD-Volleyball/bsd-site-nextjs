import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import type { Metadata } from "next"
import { getCurrentSeasonPhaseData } from "./actions"
import { SeasonPhaseControl } from "./season-phase-control"

export const metadata: Metadata = {
    title: "Season Control"
}

export const dynamic = "force-dynamic"

export default async function SeasonControlPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await getIsAdminOrDirector()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getCurrentSeasonPhaseData()

    if (!result.status || !result.data) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Season Control"
                    description="Manage the current season lifecycle."
                />
                <p className="text-muted-foreground">
                    {result.message || "No season data available."}
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Season Control"
                description="Manage the current season lifecycle."
            />
            <SeasonPhaseControl
                seasonId={result.data.seasonId}
                seasonLabel={result.data.seasonLabel}
                initialPhase={result.data.phase}
            />
        </div>
    )
}
