import { requireAdminOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { PageHeader } from "@/components/layout/page-header"
import { AttritionCharts } from "./attrition-charts"
import { getAttritionData } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Attrition"
}

export const revalidate = 300

export default async function AttritionPage() {
    await requireAdminOrRedirect()

    const result = await getAttritionData()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Attrition"
                    description="Players who only played for one season."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load attrition data."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Attrition"
                description="Players who only played for one season."
            />
            <AttritionCharts
                genderData={result.genderData}
                attritionGenderRatio={result.attritionGenderRatio}
                overallGenderRatio={result.overallGenderRatio}
                captainData={result.captainData}
                captainAvgData={result.captainAvgData}
                lastSeasonCaptainData={result.lastSeasonCaptainData}
                lastSeasonCaptainAvgData={result.lastSeasonCaptainAvgData}
            />
        </div>
    )
}
