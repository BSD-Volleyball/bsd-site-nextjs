import { requireAdminOrRedirect } from "@/next/page-guards"
import { PageHeader } from "@/components/layout/page-header"

import type { Metadata } from "next"
import { getSeasonConfigData } from "./actions"
import { SeasonConfigForm } from "./season-config-form"

export const metadata: Metadata = {
    title: "Season Configuration"
}

export default async function SeasonConfigPage() {
    await requireAdminOrRedirect()

    const result = await getSeasonConfigData()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Season Configuration"
                    description="Manage season events, dates, and time slots."
                />
                <p className="text-muted-foreground">
                    {result.message || "No season data available."}
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Season Configuration"
                description="Manage season events, dates, and time slots."
            />
            <SeasonConfigForm initialData={result.data} />
        </div>
    )
}
