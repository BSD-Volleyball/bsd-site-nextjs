import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Season Schedule"
}

export default async function SchedulePage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Season Schedule"
                description="View the season schedule."
            />
            <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                This feature is coming soon.
            </div>
        </div>
    )
}
