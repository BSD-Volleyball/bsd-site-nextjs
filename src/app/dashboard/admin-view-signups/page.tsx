import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { SignupsList } from "./signups-list"
import { getSeasonSignups, getDeletedSignups } from "./actions"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Admin View Signups"
}

export const revalidate = 300

export default async function ViewSignupsPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await isAdminOrDirectorBySession()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const [result, deletedResult] = await Promise.all([
        getSeasonSignups(),
        getDeletedSignups()
    ])

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Admin View Signups"
                    description="View all players signed up for the current season."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load signups."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`Admin View Signups — ${result.seasonLabel}`}
                description="View all players signed up for the current season. New players are highlighted in blue."
            />
            <SignupsList
                signups={result.signups}
                deletedSignups={deletedResult.entries}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
                seasonLabel={result.seasonLabel}
                lateAmount={result.lateAmount}
            />
        </div>
    )
}
