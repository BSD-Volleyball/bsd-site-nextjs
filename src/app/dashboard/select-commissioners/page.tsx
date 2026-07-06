import { redirect } from "next/navigation"
import { StatusBanner } from "@/components/ui/status-banner"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { CommissionersForm } from "./commissioners-form"
import { getSeasons, getCurrentSeason, getUsers, getDivisions } from "./actions"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { getSeasonPhase } from "@/app/dashboard/actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Select Commissioners"
}

export const revalidate = 300

export default async function SelectCommissionersPage() {
    await requireSessionOrRedirect()

    const hasAccess = await getIsAdminOrDirector()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const currentPhase = await getSeasonPhase()
    if (currentPhase !== "select_commissioners") {
        redirect("/dashboard")
    }

    const [seasonsResult, currentSeasonResult, usersResult, divisionsResult] =
        await Promise.all([
            getSeasons(),
            getCurrentSeason(),
            getUsers(),
            getDivisions()
        ])

    if (!seasonsResult.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Select Commissioners"
                    description="Assign commissioners to divisions for each season."
                />
                <StatusBanner variant="error">
                    {seasonsResult.message || "Failed to load seasons."}
                </StatusBanner>
            </div>
        )
    }

    if (!usersResult.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Select Commissioners"
                    description="Assign commissioners to divisions for each season."
                />
                <StatusBanner variant="error">
                    {usersResult.message || "Failed to load users."}
                </StatusBanner>
            </div>
        )
    }

    if (!divisionsResult.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Select Commissioners"
                    description="Assign commissioners to divisions for each season."
                />
                <StatusBanner variant="error">
                    {divisionsResult.message || "Failed to load divisions."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Select Commissioners"
                description="Assign commissioners to divisions for each season."
            />
            <CommissionersForm
                seasons={seasonsResult.seasons}
                users={usersResult.users}
                divisions={divisionsResult.divisions}
                initialSeasonId={currentSeasonResult.seasonId}
            />
        </div>
    )
}
