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

/**
 * Publishing resolves the audience, writes a recipient row per person and
 * then mails every one of them; a league-wide survey is ~2k recipients, which
 * runs past the default function duration. The publish action lives in this
 * segment, so its budget is this page's. Recipients commit before any mail
 * goes out, so a timeout would only produce a spurious failure toast over a
 * survey that did publish — but that is exactly the confusion to avoid.
 */
export const maxDuration = 300

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
