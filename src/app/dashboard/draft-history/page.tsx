import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { isAdminOrDirector } from "@/lib/rbac"
import { PageHeader } from "@/components/layout/page-header"
import { getAvailableYears } from "./actions"
import { DraftHistoryClient } from "./draft-history-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Draft History"
}

export default async function DraftHistoryPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await isAdminOrDirector(session.user.id)

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const years = await getAvailableYears()
    const playerPicUrl = process.env.PLAYER_PIC_URL ?? ""

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
