import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { PairsList } from "./pairs-list"
import { getSeasonPairs } from "./actions"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Review Pairs"
}

export const dynamic = "force-dynamic"

export default async function ReviewPairsPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await isAdminOrDirectorBySession()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getSeasonPairs()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Review Pairs"
                    description="Review pair requests for the current season."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load pairs."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`Review Pairs — ${result.seasonLabel}`}
                description="Review pair requests for the current season."
            />
            <PairsList
                matched={result.matched}
                unmatched={result.unmatched}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
            />
        </div>
    )
}
