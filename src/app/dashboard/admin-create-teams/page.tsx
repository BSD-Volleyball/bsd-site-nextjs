import { requireAdminOrRedirect } from "@/next/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { PageHeader } from "@/components/layout/page-header"
import { CreateTeamsForm } from "./create-teams-form"
import { getCreateTeamsData } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Admin Create Teams"
}

export default async function AdminCreateTeamsPage() {
    await requireAdminOrRedirect()

    const result = await getCreateTeamsData()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Admin Create Teams"
                    description="Create teams for a season."
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
                title="Admin Create Teams"
                description="Create teams for a season by selecting captains."
            />
            <CreateTeamsForm
                seasons={result.data.seasons}
                divisions={result.data.divisions}
                users={result.data.users}
            />
        </div>
    )
}
