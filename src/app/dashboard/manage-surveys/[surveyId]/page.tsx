import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBanner } from "@/components/ui/status-banner"
import { requirePermissionOrRedirect } from "@/next/page-guards"
import { getSurveyEditor, getSurveyEditorOptions } from "../actions"
import { SurveyEditor } from "../survey-editor"

export const metadata: Metadata = {
    title: "Edit Survey"
}

export default async function SurveyEditorPage({
    params
}: {
    params: Promise<{ surveyId: string }>
}) {
    await requirePermissionOrRedirect("surveys:manage")

    const { surveyId } = await params
    const id = Number(surveyId)
    if (!Number.isInteger(id) || id <= 0) notFound()

    const [editorResult, optionsResult] = await Promise.all([
        getSurveyEditor(id),
        getSurveyEditorOptions()
    ])

    if (!editorResult.status || !optionsResult.status) {
        return (
            <div className="space-y-6">
                <PageHeader title="Survey" />
                <StatusBanner variant="error">
                    {(!editorResult.status && editorResult.message) ||
                        (!optionsResult.status && optionsResult.message) ||
                        "Failed to load this survey."}
                </StatusBanner>
            </div>
        )
    }
    if (!editorResult.data) notFound()

    return (
        <div className="space-y-6">
            <PageHeader title={editorResult.data.survey.title} />
            <SurveyEditor
                surveyId={id}
                data={editorResult.data}
                options={optionsResult.data}
            />
        </div>
    )
}
