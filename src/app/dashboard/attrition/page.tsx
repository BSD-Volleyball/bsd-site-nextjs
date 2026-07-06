import { requireAdminOrRedirect } from "@/lib/page-guards"
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
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load attrition data."}
                </div>
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
