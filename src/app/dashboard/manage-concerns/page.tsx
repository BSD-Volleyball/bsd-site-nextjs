import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { hasPermissionBySession } from "@/lib/rbac"
import { getSeasonConfig } from "@/lib/site-config"
import { PageHeader } from "@/components/layout/page-header"
import { ManageConcernsClient } from "./manage-concerns-client"
import { getConcerns, getAssignableUsers } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Manage Concerns"
}

export const dynamic = "force-dynamic"

export default async function ManageConcernsPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        redirect("/auth/sign-in")
    }

    const config = await getSeasonConfig()
    const canView =
        !!config.seasonId &&
        (await hasPermissionBySession("concerns:view", {
            seasonId: config.seasonId
        }))
    if (!canView) {
        redirect("/dashboard")
    }

    const [concernsResult, assignableUsers] = await Promise.all([
        getConcerns(),
        getAssignableUsers()
    ])

    return (
        <div className="space-y-6">
            <PageHeader
                title="Manage Concerns"
                description="Review, assign, and track player concerns and incidents."
            />
            {!concernsResult.status ? (
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {concernsResult.message || "Failed to load concerns."}
                </div>
            ) : (
                <ManageConcernsClient
                    initialConcerns={concernsResult.concerns}
                    assignableUsers={assignableUsers}
                    playerPicUrl={process.env.PLAYER_PIC_URL ?? ""}
                />
            )}
        </div>
    )
}
