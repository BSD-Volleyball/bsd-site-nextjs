import { requireAdminOrRedirect } from "@/lib/page-guards"
import { playerPicBaseUrl } from "@/config/env"
import { PageHeader } from "@/components/layout/page-header"
import { getAvailableYears } from "./actions"
import { DraftHistoryClient } from "./draft-history-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Draft History"
}

export default async function DraftHistoryPage() {
    await requireAdminOrRedirect()

    const years = await getAvailableYears()
    const playerPicUrl = playerPicBaseUrl()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Draft History"
                description="View historical draft results by year, season, and division."
            />
            <DraftHistoryClient years={years} playerPicUrl={playerPicUrl} />
        </div>
    )
}
