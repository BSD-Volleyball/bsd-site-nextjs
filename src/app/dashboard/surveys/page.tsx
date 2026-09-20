import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { listSurveysForUser } from "@/lib/surveys/respondent"
import { requireSessionOrRedirect } from "@/next/page-guards"
import { SurveysList } from "./surveys-list"

export const metadata: Metadata = {
    title: "My Surveys"
}

/**
 * Everything this person was invited to. The lib is called directly rather
 * than through the server action: the session is already in hand here, and a
 * page has no use for the ActionResult wrapper.
 */
export default async function MySurveysPage() {
    const session = await requireSessionOrRedirect()
    const { open, past } = await listSurveysForUser(session.user.id)

    return (
        <div className="space-y-6">
            <PageHeader
                title="My Surveys"
                description="The surveys the league has asked you to fill out."
            />
            <SurveysList open={open} past={past} />
        </div>
    )
}
