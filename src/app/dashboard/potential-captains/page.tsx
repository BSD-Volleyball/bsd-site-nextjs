import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { PotentialCaptainsList } from "./potential-captains-list"
import { getPotentialCaptainsData } from "./actions"
import { getCurrentSession, checkCommissionerAccess } from "@/lib/auth-checks"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Potential Captains"
}

export const dynamic = "force-dynamic"

export default async function PotentialCaptainsPage() {
    const session = await getCurrentSession()

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await checkCommissionerAccess()

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
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message ||
                        "Failed to load potential captains data."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${result.seasonLabel} Potential Captains`}
                description="Players interested in being captains, organized by their most recent division."
            />
            {result.divisions.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No potential captains found for this season.
                </div>
            ) : (
                <PotentialCaptainsList divisions={result.divisions} />
            )}
        </div>
    )
}
