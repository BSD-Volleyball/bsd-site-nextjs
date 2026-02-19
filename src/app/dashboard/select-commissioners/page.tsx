import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { CommissionersForm } from "./commissioners-form"
import { getSeasons, getCurrentSeason, getUsers, getDivisions } from "./actions"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Select Commissioners"
}

export const dynamic = "force-dynamic"

export default async function SelectCommissionersPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await getIsAdminOrDirector()

    if (!hasAccess) {
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
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {seasonsResult.message || "Failed to load seasons."}
                </div>
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
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {usersResult.message || "Failed to load users."}
                </div>
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
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {divisionsResult.message || "Failed to load divisions."}
                </div>
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
