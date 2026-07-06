import { redirect } from "next/navigation"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { getIsAdminOrDirector } from "@/app/dashboard/access-actions"
import type { Metadata } from "next"
import { getSeasonConfigData } from "./actions"
import { SeasonConfigForm } from "./season-config-form"

export const metadata: Metadata = {
    title: "Season Configuration"
}

export default async function SeasonConfigPage() {
    await requireSessionOrRedirect()

    const hasAccess = await getIsAdminOrDirector()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getSeasonConfigData()

    if (!result.status || !result.data) {
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
