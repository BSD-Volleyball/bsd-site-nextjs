import { redirect } from "next/navigation"
import { headers } from "next/headers"
import type { Metadata } from "next"
import { asc } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { seasons } from "@/database/schema"
import { getIsCommissioner } from "@/app/dashboard/actions"
import { getPrepareForDraftData } from "./actions"
import { PrepareForDraftTable } from "./prepare-for-draft-table"
import { PageHeader } from "@/components/layout/page-header"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Prepare for Draft" }

export default async function PrepareForDraftPage({
    searchParams
}: {
    searchParams: Promise<{ divisionId?: string }>
}) {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await getIsCommissioner()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const params = await searchParams
    const parsed = params.divisionId
        ? parseInt(params.divisionId, 10)
        : undefined
    const divisionIdParam =
        parsed !== undefined && !Number.isNaN(parsed) && parsed > 0
            ? parsed
            : undefined

    const [result, allSeasons] = await Promise.all([
        getPrepareForDraftData(divisionIdParam),
        db
            .select({
                id: seasons.id,
                year: seasons.year,
                name: seasons.season
            })
            .from(seasons)
            .orderBy(asc(seasons.year))
    ])

    if (!result.status || !result.data) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Prepare for Draft"
                    description="Aggregated captain draft homework for draft preparation."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load data."}
                </div>
            </div>
        )
    }

    const { data } = result

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${data.seasonLabel} — ${data.divisionName} — Prepare for Draft`}
                description="Pivot table of all captains' draft homework, enriched with historical draft data and recommended round."
            />
            <PrepareForDraftTable
                data={data}
                allSeasons={allSeasons}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
            />
        </div>
    )
}
