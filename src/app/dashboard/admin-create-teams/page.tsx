import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import { PageHeader } from "@/components/layout/page-header"
import { CreateTeamsForm } from "./create-teams-form"
import { getCreateTeamsData } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Admin Create Teams"
}

export const revalidate = 300

export default async function AdminCreateTeamsPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await isAdminOrDirectorBySession()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getCreateTeamsData()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Admin Create Teams"
                    description="Create teams for a season."
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
                title="Admin Create Teams"
                description="Create teams for a season by selecting captains."
            />
            <CreateTeamsForm
                seasons={result.seasons}
                divisions={result.divisions}
                users={result.users}
            />
        </div>
    )
}
