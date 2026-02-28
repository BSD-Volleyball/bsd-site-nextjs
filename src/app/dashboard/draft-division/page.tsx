import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { DraftDivisionForm } from "./draft-division-form"
import { getDraftDivisionData } from "./actions"
import { isCommissionerBySession } from "@/lib/rbac"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Draft Division"
}

export const dynamic = "force-dynamic"

export default async function DraftDivisionPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await isCommissionerBySession()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getDraftDivisionData()

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
                description="Conduct the draft for a division by selecting players for each team."
            />
            <DraftDivisionForm
                currentSeasonId={result.currentSeasonId}
                divisionSplits={result.divisionSplits}
                divisions={result.divisions}
                users={result.users}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
            />
        </div>
    )
}
