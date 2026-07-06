import { requirePermissionOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { getSeasonConfig } from "@/lib/site-config"
import { PageHeader } from "@/components/layout/page-header"
import { ManageConcernsClient } from "./manage-concerns-client"
import { getConcerns, getAssignableUsers } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Manage Concerns"
}

export const revalidate = 300

export default async function ManageConcernsPage() {
    const config = await getSeasonConfig()
    await requirePermissionOrRedirect("concerns:view", {
        seasonId: config.seasonId
    })

    const [concernsResult, assignableUsers] = await Promise.all([
        getConcerns(),
        getAssignableUsers()
    ])

    return (
        <div className="space-y-6">
            <PageHeader
                title="Manage Concerns"
                description="Review, assign, and track player concerns and incidents."
            />
            {!concernsResult.status ? (
                <StatusBanner variant="error">
                    {concernsResult.message || "Failed to load concerns."}
                </StatusBanner>
            ) : (
                <ManageConcernsClient
                    initialConcerns={concernsResult.data}
                    assignableUsers={assignableUsers}
                    playerPicUrl={process.env.PLAYER_PIC_URL ?? ""}
                />
            )}
        </div>
    )
}
