import { redirect } from "next/navigation"
import { StatusBanner } from "@/components/ui/status-banner"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import type { Metadata } from "next"
import { asc } from "drizzle-orm"
import { db } from "@/database/db"
import { seasons } from "@/database/schema"
import { getIsCommissioner } from "@/app/dashboard/access-actions"
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
    await requireSessionOrRedirect()

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
                <StatusBanner variant="error">
                    {result.message || "Failed to load data."}
                </StatusBanner>
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
