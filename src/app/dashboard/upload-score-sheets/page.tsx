import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { PageHeader } from "@/components/layout/page-header"
import { StatusBanner } from "@/components/ui/status-banner"
import { playerPicBaseUrl } from "@/config/env"
import { getSeasonConfig } from "@/lib/site-config"
import { requireSessionOrRedirect } from "@/next/page-guards"
import { hasPermissionBySession } from "@/next/session"

import { getMatchDatesForSeason } from "../enter-scores/data"
import { getScoringNight } from "./actions"
import { UploadScoreSheetsClient } from "./upload-score-sheets-client"

export const metadata: Metadata = {
    title: "Upload Score Sheets"
}

/**
 * Reading a sheet decodes a photo and asks two vision models to read it (about
 * 6-30s each, in parallel), so give the route room. Server actions inherit
 * their segment's ceiling.
 */
export const maxDuration = 300

export default async function UploadScoreSheetsPage() {
    await requireSessionOrRedirect()

    const config = await getSeasonConfig()
    const allowed =
        !!config.seasonId &&
        (await hasPermissionBySession("scores:enter", {
            seasonId: config.seasonId
        }))
    if (!allowed) redirect("/dashboard")

    const datesResult = await getMatchDatesForSeason()
    const matchDates = datesResult.status ? datesResult.data : []

    const today = new Date().toISOString().split("T")[0]
    let defaultDate = matchDates.length > 0 ? matchDates[0].date : ""
    for (const d of matchDates) {
        if (d.date <= today) defaultDate = d.date
        else break
    }

    const night = defaultDate ? await getScoringNight(defaultDate) : null

    return (
        <div className="space-y-6">
            <PageHeader
                title="Upload Score Sheets"
                description="Photograph each court's sheet at the end of the night. Each one files itself under its court; check what was read and save it, or fix anything unclear right on the card."
            />
            {matchDates.length === 0 ? (
                <StatusBanner variant="error">
                    No match dates found for the current season.
                </StatusBanner>
            ) : (
                <UploadScoreSheetsClient
                    matchDates={matchDates}
                    defaultDate={defaultDate}
                    initialNight={
                        night?.status ? night.data : { divisions: [], rows: [] }
                    }
                    picBaseUrl={playerPicBaseUrl()}
                />
            )}
        </div>
    )
}
