import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { PageHeader } from "@/components/layout/page-header"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { getEditWeek1Data } from "./actions"
import { EditWeek1Form } from "./edit-week-1-form"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Edit Week 1"
}

export const dynamic = "force-dynamic"

export default async function EditWeek1Page() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await getIsAdminOrDirector()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getEditWeek1Data()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Edit Week 1"
                    description="Edit preseason week 1 roster assignments for the current season."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load week 1 roster data."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${result.seasonLabel} Edit Week 1`}
                description="Edit player assignments for each session and court, then save changes."
            />
            {result.slots.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No week 1 roster slots found for this season.
                </div>
            ) : (
                <EditWeek1Form players={result.players} slots={result.slots} />
            )}
        </div>
    )
}
