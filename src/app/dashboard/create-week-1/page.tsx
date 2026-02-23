import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { CreateWeek1Form } from "./create-week-1-form"
import { getCreateWeek1Data } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Create Week 1"
}

export const dynamic = "force-dynamic"

export default async function CreateWeek1Page() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await getIsAdminOrDirector()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getCreateWeek1Data()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Create Week 1"
                    description="Build and save week 1 rosters for the current season."
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
                title="Create Week 1"
                description="Prioritize week 1 candidates, select the top 96, and assign them to sessions/courts."
            />
            <CreateWeek1Form
                seasonLabel={result.seasonLabel}
                candidates={result.candidates}
                groups={result.groups}
            />
        </div>
    )
}
