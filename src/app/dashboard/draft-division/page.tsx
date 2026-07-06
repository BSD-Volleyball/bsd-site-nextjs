import { requireSessionOrRedirect } from "@/lib/page-guards"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { DraftDivisionForm } from "./draft-division-form"
import { getDraftDivisionData, hasDraftPageAccess } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Draft Division"
}

export const dynamic = "force-dynamic"

export default async function DraftDivisionPage() {
    await requireSessionOrRedirect()

    const access = await hasDraftPageAccess()

    if (!access.hasAccess) {
        redirect("/dashboard")
    }

    const result = await getDraftDivisionData(
        access.isLeagueWideCommissioner
            ? undefined
            : access.accessibleDivisionIds
    )

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Draft Division"
                    description="Conduct the draft for a division."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load data."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Draft Division"
                description="Conduct the draft for an authorized division or make picks for your team in the live draft."
            />
            <DraftDivisionForm
                currentSeasonId={result.currentSeasonId}
                divisionSplits={result.divisionSplits}
                divisions={result.divisions}
                users={result.users}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
                divisionRoleById={access.divisionRoleById}
                captainTeamIdsByDivision={access.captainTeamIdsByDivision}
                hasLeagueWideCommissionerAccess={
                    access.isLeagueWideCommissioner
                }
                defaultDivisionId={access.defaultDivisionId ?? undefined}
            />
        </div>
    )
}
