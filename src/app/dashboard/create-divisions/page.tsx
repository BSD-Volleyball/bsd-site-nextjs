import { redirect } from "next/navigation"
import { StatusBanner } from "@/components/ui/status-banner"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import {
    getIsAdminOrDirector,
    getSeasonPhase
} from "@/app/dashboard/access-actions"
import { getDivisionsPageData } from "./actions"
import { CreateDivisionsClient } from "./create-divisions-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Create Divisions"
}

export const revalidate = 300

export default async function CreateDivisionsPage() {
    await requireSessionOrRedirect()

    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        redirect("/dashboard")
    }

    const currentPhase = await getSeasonPhase()
    if (
        currentPhase !== "select_commissioners" &&
        currentPhase !== "select_captains"
    ) {
        redirect("/dashboard")
    }

    const result = await getDivisionsPageData()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Create Divisions"
                    description="Configure divisions for the current season."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load division data."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Create Divisions"
                description="Configure which divisions are active, how many teams each will have, the gender split, and whether coaches are used."
            />
            <CreateDivisionsClient
                seasonId={result.seasonId}
                activeDivisions={result.activeDivisions}
                totalMales={result.totalMales}
                totalNonMales={result.totalNonMales}
                existingConfig={result.existingConfig}
                returningByDivision={result.returningByDivision}
                evaluatedByDivision={result.evaluatedByDivision}
            />
        </div>
    )
}
