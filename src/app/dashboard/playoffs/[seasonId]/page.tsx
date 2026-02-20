import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { getPlayoffData } from "./actions"
import { DivisionSection } from "./division-section"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Playoffs"
}

export const dynamic = "force-dynamic"

export default async function PlayoffsPage({
    params
}: {
    params: Promise<{ seasonId: string }>
}) {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const { seasonId } = await params
    const result = await getPlayoffData(parseInt(seasonId, 10))

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Playoffs"
                    description="View playoff brackets and results."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load playoff data."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${result.seasonLabel} Playoffs`}
                description="Double-elimination bracket, schedule, and results by division."
            />
            {result.divisions.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No playoff matches found for this season.
                </div>
            ) : (
                result.divisions.map((division) => (
                    <DivisionSection key={division.id} division={division} />
                ))
            )}
        </div>
    )
}
