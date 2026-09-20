import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBanner } from "@/components/ui/status-banner"
import { requirePermissionOrRedirect } from "@/next/page-guards"
import { getSurveyTemplates } from "../actions"
import { TemplatesList } from "../templates-list"

export const metadata: Metadata = {
    title: "Survey Templates"
}

/** The Templates tab on its own page, so a link to it lands somewhere sane. */
export default async function SurveyTemplatesPage() {
    await requirePermissionOrRedirect("surveys:manage")

    const result = await getSurveyTemplates()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Survey Templates"
                description="The question sets surveys are run from."
            />
            {result.status ? (
                <TemplatesList templates={result.data} />
            ) : (
                <StatusBanner variant="error">
                    {result.message || "Failed to load templates."}
                </StatusBanner>
            )}
        </div>
    )
}
