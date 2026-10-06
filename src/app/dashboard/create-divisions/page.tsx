import { StatusBanner } from "@/components/ui/status-banner"
import { requireAdminOrRedirect } from "@/next/page-guards"
import { PageHeader } from "@/components/layout/page-header"

import { getDivisionsPageData } from "./data"
import { CreateDivisionsClient } from "./create-divisions-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Create Divisions"
}

export default async function CreateDivisionsPage() {
    await requireAdminOrRedirect()

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
                seasonId={result.data.seasonId}
                activeDivisions={result.data.activeDivisions}
                totalMales={result.data.totalMales}
                totalNonMales={result.data.totalNonMales}
                existingConfig={result.data.existingConfig}
                returningByDivision={result.data.returningByDivision}
                evaluatedByDivision={result.data.evaluatedByDivision}
            />
        </div>
    )
}
