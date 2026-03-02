import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { CreateWeek3Form } from "./create-week-3-form"
import { getCreateWeek3Data } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Create Week 3"
}

export const dynamic = "force-dynamic"

export default async function CreateWeek3Page() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await getIsAdminOrDirector()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getCreateWeek3Data()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Create Week 3"
                    description="Build and save tryout 3 rosters for the current season."
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
                title="Create Week 3"
                description="Place players into division buckets, then generate balanced teams per division."
            />
            <CreateWeek3Form
                seasonLabel={result.seasonLabel}
                divisions={result.divisions}
                candidates={result.candidates}
                excludedPlayers={result.excludedPlayers}
            />
        </div>
    )
}
