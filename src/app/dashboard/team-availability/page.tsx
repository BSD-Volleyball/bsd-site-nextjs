import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { getTeamAvailabilityData } from "./actions"
import { AvailabilityMatrix } from "./availability-matrix"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Team Availability"
}

export const dynamic = "force-dynamic"

export default async function TeamAvailabilityPage() {
    const session = await auth.api.getSession({
        headers: await headers()
    })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const result = await getTeamAvailabilityData()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Team Availability"
                description="View your roster's availability across game dates."
            />
            {result.status ? (
                <AvailabilityMatrix initialData={result} />
            ) : (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    {result.message}
                </div>
            )}
        </div>
    )
}
