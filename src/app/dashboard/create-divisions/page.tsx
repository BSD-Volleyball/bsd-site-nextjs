import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { PageHeader } from "@/components/layout/page-header"
import { getIsAdminOrDirector, getSeasonPhase } from "@/app/dashboard/actions"
import { getDivisionsPageData } from "./actions"
import { CreateDivisionsClient } from "./create-divisions-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Create Divisions"
}

export const dynamic = "force-dynamic"

export default async function CreateDivisionsPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        redirect("/dashboard")
    }

    const currentPhase = await getSeasonPhase()
    if (
        currentPhase !== "select_commissioners" &&
        currentPhase !== "select_captains"
    ) {
        redirect("/dashboard")
    }

    const result = await getDivisionsPageData()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Create Divisions"
                    description="Configure divisions for the current season."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load division data."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Create Divisions"
                description="Configure which divisions are active, how many teams each will have, the gender split, and whether coaches are used."
            />
            <CreateDivisionsClient
                seasonId={result.seasonId}
                activeDivisions={result.activeDivisions}
                totalMales={result.totalMales}
                totalNonMales={result.totalNonMales}
                existingConfig={result.existingConfig}
                returningByDivision={result.returningByDivision}
                evaluatedByDivision={result.evaluatedByDivision}
            />
        </div>
    )
}
