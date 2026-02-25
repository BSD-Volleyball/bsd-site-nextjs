import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { SignupsList } from "./signups-list"
import { getSignupsData, checkCaptainPagesAccess } from "./actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "View Signups"
}

export const dynamic = "force-dynamic"

export default async function ViewSignupsPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await checkCaptainPagesAccess()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getSignupsData()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="View Signups"
                    description="View all players signed up for the current season."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load signups data."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${result.seasonLabel} Signups`}
                description="Players signed up for the current season, grouped by their last drafted division."
            />
            {result.groups.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No signups found for this season.
                </div>
            ) : (
                <SignupsList
                    groups={result.groups}
                    allSeasons={result.allSeasons}
                    playerPicUrl={process.env.PLAYER_PIC_URL || ""}
                />
            )}
        </div>
    )
}
