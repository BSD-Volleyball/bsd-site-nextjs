import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBanner } from "@/components/ui/status-banner"
import { requirePermissionOrRedirect } from "@/next/page-guards"
import { getSurveyFilterOptions, getSurveyResults } from "../../actions"
import { ResultsClient } from "./results-client"

export const metadata: Metadata = {
    title: "Survey Results"
}

export default async function SurveyResultsPage({
    params
}: {
    params: Promise<{ surveyId: string }>
}) {
    await requirePermissionOrRedirect("surveys:view_results")

    const { surveyId } = await params
    const id = Number(surveyId)
    if (!Number.isInteger(id) || id <= 0) notFound()

    const [resultsResult, optionsResult] = await Promise.all([
        getSurveyResults(id, {}),
        getSurveyFilterOptions()
    ])

    if (!resultsResult.status) {
        return (
            <div className="space-y-6">
                <PageHeader title="Survey Results" />
                <StatusBanner variant="error">
                    {resultsResult.message || "Failed to load results."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${resultsResult.data.survey.title} — Results`}
            />
            <ResultsClient
                surveyId={id}
                initial={resultsResult.data}
                divisions={
                    optionsResult.status ? optionsResult.data.divisions : []
                }
            />
        </div>
    )
}
