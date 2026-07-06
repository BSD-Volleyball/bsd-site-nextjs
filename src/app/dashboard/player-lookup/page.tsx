import { requireSessionOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { PlayerLookupForm } from "./player-lookup-form"
import { getPlayersForLookup } from "./actions"
import type { Metadata } from "next"
import { isAdminOrDirector, isCommissionerForCurrentSeason } from "@/lib/rbac"

export const metadata: Metadata = {
    title: "Admin Player Lookup"
}

export const dynamic = "force-dynamic"

async function checkAdminOrCommissionerAccess(
    userId: string
): Promise<boolean> {
    const isAdmin = await isAdminOrDirector(userId)
    if (isAdmin) {
        return true
    }

    return isCommissionerForCurrentSeason(userId)
}

export default async function PlayerLookupPage() {
    const session = await requireSessionOrRedirect()

    const hasAccess = await checkAdminOrCommissionerAccess(session.user.id)

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getPlayersForLookup()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Admin Player Lookup"
                    description="Search and view player information."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load players."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Admin Player Lookup"
                description="Search and view player information."
            />
            <PlayerLookupForm
                players={result.data}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
            />
        </div>
    )
}
