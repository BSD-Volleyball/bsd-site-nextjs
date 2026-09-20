import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { getSurveyForRespondent } from "@/lib/surveys/respondent"
import { requireSessionOrRedirect } from "@/next/page-guards"
import { SurveyForm } from "./survey-form"

export const metadata: Metadata = {
    title: "Survey"
}

/**
 * One survey, as the person invited to it sees it. Being a recipient is the
 * authorization: the lib returns null for anyone else, and a missing survey
 * and one this user was never invited to look alike on purpose.
 */
export default async function SurveyPage({
    params
}: {
    params: Promise<{ surveyId: string }>
}) {
    const session = await requireSessionOrRedirect()

    const { surveyId } = await params
    const id = Number(surveyId)
    if (!Number.isInteger(id) || id <= 0) notFound()

    const view = await getSurveyForRespondent(id, session.user.id)
    if (!view) notFound()

    return (
        <div className="space-y-6">
            <PageHeader
                title={view.survey.title}
                description={view.survey.intro ?? undefined}
            />
            <SurveyForm view={view} />
        </div>
    )
}
