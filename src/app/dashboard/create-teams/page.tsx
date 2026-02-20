import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { CreateTeamsForm } from "./create-teams-form"
import { getCreateTeamsData } from "./actions"
import { getIsCommissioner } from "@/app/dashboard/actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Create Teams"
}

export const dynamic = "force-dynamic"

export default async function CreateTeamsPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await getIsCommissioner()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getCreateTeamsData()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Create Teams"
                    description="Create teams for the current season."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load data."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Create Teams"
                description="Create teams for the current season by selecting captains."
            />
            <CreateTeamsForm
                seasonLabel={result.seasonLabel || ""}
                divisions={result.divisions}
                users={result.users}
            />
        </div>
    )
}
