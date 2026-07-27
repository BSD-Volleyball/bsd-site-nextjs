import { redirect } from "next/navigation"
import { playerPicBaseUrl } from "@/config/env"
import { StatusBanner } from "@/components/ui/status-banner"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { PotentialCaptainsList } from "./potential-captains-list"
import { getPotentialCaptainsData } from "./actions"
import { getIsCommissioner } from "@/app/dashboard/access-actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Potential Captains"
}

export const revalidate = 300

export default async function PotentialCaptainsPage() {
    const session = await requireSessionOrRedirect()

    const hasAccess = await getIsCommissioner()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getPotentialCaptainsData()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Potential Captains"
                    description="View players interested in being captains by division."
                />
                <StatusBanner variant="error">
                    {result.message ||
                        "Failed to load potential captains data."}
                </StatusBanner>
            </div>
        )
    }

    const data = result.data

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${data.seasonLabel} Potential Captains`}
                description="Players interested in being captains, organized by their most recent division."
            />
            {data.divisions.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No potential captains found for this season.
                </div>
            ) : (
                <PotentialCaptainsList
                    divisions={data.divisions}
                    allSeasons={data.allSeasons}
                    playerPicUrl={playerPicBaseUrl()}
                    emailTemplate={data.emailTemplate || ""}
                    emailTemplateContent={data.emailTemplateContent}
                    emailSubject={data.emailSubject || ""}
                    seasonConfig={data.seasonConfig}
                    commissionerName={session.user.name || ""}
                    currentUserId={session.user.id}
                    divisionCommissioners={data.divisionCommissioners}
                />
            )}
        </div>
    )
}
