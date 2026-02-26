import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { PageHeader } from "@/components/layout/page-header"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { getEditWeek2Data } from "./actions"
import { EditWeek2Form } from "./edit-week-2-form"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Edit Week 2"
}

export const dynamic = "force-dynamic"

export default async function EditWeek2Page() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await getIsAdminOrDirector()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getEditWeek2Data()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Edit Week 2"
                    description="Edit tryout 2 team assignments for the current season."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load week 2 roster data."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${result.seasonLabel} Edit Week 2`}
                description="Edit player assignments by division/team, then save changes."
            />
            {result.slots.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No week 2 roster slots found for this season.
                </div>
            ) : (
                <EditWeek2Form players={result.players} slots={result.slots} />
            )}
        </div>
    )
}
