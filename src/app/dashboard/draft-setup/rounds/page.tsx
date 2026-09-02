import { playerPicBaseUrl } from "@/config/env"
import { StatusBanner } from "@/components/ui/status-banner"
import type { Metadata } from "next"
import { asc } from "drizzle-orm"
import { db } from "@/database/db"
import { seasons } from "@/database/schema"
import { getDraftSetupStatus } from "@/lib/draft-setup"
import { parseDivisionIdParam } from "../division-param"
import {
    DraftSetupDivisionPicker,
    DraftSetupStepper
} from "../draft-setup-stepper"
import { getPrepareForDraftData } from "./actions"
import { PrepareForDraftTable } from "./prepare-for-draft-table"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Draft Setup — Seat the Captains" }

export default async function DraftSetupRoundsPage({
    searchParams
}: {
    searchParams: Promise<{ divisionId?: string }>
}) {
    const divisionIdParam = parseDivisionIdParam(
        (await searchParams).divisionId
    )

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
            <StatusBanner variant="error">
                {result.message || "Failed to load data."}
            </StatusBanner>
        )
    }

    const { data } = result
    const status = await getDraftSetupStatus(data.seasonId, data.divisionId)

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="font-semibold text-xl">
                    {data.seasonLabel} — {data.divisionName}
                </h2>
                <DraftSetupDivisionPicker
                    step="rounds"
                    divisionId={data.divisionId}
                    divisions={data.availableDivisions}
                />
            </div>

            <DraftSetupStepper
                active="rounds"
                divisionId={data.divisionId}
                status={status}
            />

            {status.rounds.state === "stale" && (
                <StatusBanner variant="warning">
                    Captains changed since this step was locked. Press{" "}
                    <strong>Lock In Picks</strong> again so every captain has a
                    seat on the draft board.
                </StatusBanner>
            )}

            <p className="text-muted-foreground text-sm">
                Pivot table of all captains&apos; draft homework, enriched with
                historical draft data and recommended round. Adjust each
                captain&apos;s round, then press <strong>Lock In Picks</strong>.
            </p>

            <PrepareForDraftTable
                data={data}
                allSeasons={allSeasons}
                playerPicUrl={playerPicBaseUrl()}
            />
        </div>
    )
}
