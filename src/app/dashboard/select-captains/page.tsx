import { requireSessionOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { SelectCaptainsForm } from "./select-captains-form"
import { getCreateTeamsData } from "./actions"
import { getIsCommissioner } from "@/app/dashboard/actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Select Captains"
}

export const revalidate = 300

export default async function SelectCaptainsPage() {
    const session = await requireSessionOrRedirect()

    const hasAccess = await getIsCommissioner()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getCreateTeamsData()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Select Captains"
                    description="Select captains for the current season."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load data."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Select Captains"
                description="Create teams for the current season by selecting captains."
            />
            <SelectCaptainsForm
                seasonLabel={result.seasonLabel || ""}
                divisions={result.divisions}
                users={result.users}
                allUsers={result.allUsers}
                emailTemplate={result.emailTemplate || ""}
                emailTemplateContent={result.emailTemplateContent}
                emailSubject={result.emailSubject || ""}
                seasonConfig={result.seasonConfig}
                commissionerName={session.user.name || ""}
                currentUserId={session.user.id}
                divisionCommissioners={result.divisionCommissioners}
                existingTeamsByDivision={result.existingTeamsByDivision}
            />
        </div>
    )
}
