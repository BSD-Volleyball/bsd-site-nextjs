import { PageHeader } from "@/components/layout/page-header"
import { requireAdminOrRedirect } from "@/lib/page-guards"
import type { Metadata } from "next"
import { getAvailableDivisions, getTournamentConfigData } from "./actions"
import { TournamentConfigForm } from "./tournament-config-form"

export const metadata: Metadata = {
    title: "Tournament Configuration"
}

export default async function TournamentConfigPage() {
    await requireAdminOrRedirect()

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
