import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBanner } from "@/components/ui/status-banner"
import { requirePermissionOrRedirect } from "@/next/page-guards"
import { getSurveyTemplateEditor } from "../../actions"
import { TemplateEditor } from "../../template-editor"

export const metadata: Metadata = {
    title: "Edit Survey Template"
}

export default async function SurveyTemplateEditorPage({
    params
}: {
    params: Promise<{ templateId: string }>
}) {
    await requirePermissionOrRedirect("surveys:manage")

    const { templateId } = await params
    const id = Number(templateId)
    if (!Number.isInteger(id) || id <= 0) notFound()

    const result = await getSurveyTemplateEditor(id)
    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader title="Survey Template" />
                <StatusBanner variant="error">
                    {result.message || "Failed to load this template."}
                </StatusBanner>
            </div>
        )
    }
    if (!result.data) notFound()

    return (
        <div className="space-y-6">
            <PageHeader
                title={result.data.template.name}
                description="Add, reorder and branch the questions this template asks."
            />
            <TemplateEditor data={result.data} />
        </div>
    )
}
