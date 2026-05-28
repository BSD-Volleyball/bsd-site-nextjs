import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import type { Metadata } from "next"
import { getAvailableDivisions, getTournamentConfigData } from "./actions"
import { TournamentConfigForm } from "./tournament-config-form"

export const metadata: Metadata = {
    title: "Tournament Configuration"
}

export default async function TournamentConfigPage() {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) redirect("/auth/sign-in")

    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) redirect("/dashboard")

    const [result, divisionsResult] = await Promise.all([
        getTournamentConfigData(),
        getAvailableDivisions()
    ])
    const initialData = result.status ? result.data : null
    const availableDivisions = divisionsResult.status
        ? divisionsResult.data
        : []

    return (
        <div className="space-y-6">
            <PageHeader
                title="Tournament Configuration"
                description="Configure tournament details, dates, costs, and divisions."
            />
            <TournamentConfigForm
                initialData={initialData}
                availableDivisions={availableDivisions}
            />
        </div>
    )
}
