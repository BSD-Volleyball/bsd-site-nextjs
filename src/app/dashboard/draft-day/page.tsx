import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { DraftDayForm } from "./draft-day-form"
import { getDraftDayData } from "./actions"
import { getIsCommissioner } from "@/app/dashboard/actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Draft Day"
}

export const dynamic = "force-dynamic"

export default async function DraftDayPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await getIsCommissioner()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getDraftDayData()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Draft Day"
                    description="Set the draft pick order for each division."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load draft day data."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${result.seasonLabel} Draft Day`}
                description="Set and save the captain draft pick order for each division."
            />
            <DraftDayForm
                divisions={result.divisions}
                commissionerDivisionId={result.commissionerDivisionId}
                seasonLabel={result.seasonLabel}
            />
        </div>
    )
}
