import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { PageHeader } from "@/components/layout/page-header"
import { StatusBanner } from "@/components/ui/status-banner"
import { playerPicBaseUrl } from "@/config/env"
import { getSeasonConfig } from "@/lib/site-config"
import { requireSessionOrRedirect } from "@/next/page-guards"
import { hasPermissionBySession } from "@/next/session"

import { getMatchDatesForSeason } from "../enter-scores/actions"
import { getSheetInbox } from "./actions"
import { ScoreSheetInboxClient } from "./score-sheet-inbox-client"

export const metadata: Metadata = {
    title: "Score Sheet Photos"
}

/**
 * Reading a sheet decodes a photo and may call out to a transcriber, so give
 * the route room. Server actions inherit their segment's ceiling.
 */
export const maxDuration = 300

export default async function ScoreSheetInboxPage() {
    await requireSessionOrRedirect()

    const config = await getSeasonConfig()
    const allowed =
        !!config.seasonId &&
        (await hasPermissionBySession("scores:enter", {
            seasonId: config.seasonId
        }))
    if (!allowed) redirect("/dashboard")

    const datesResult = await getMatchDatesForSeason()
    const matchDates = datesResult.dates

    const today = new Date().toISOString().split("T")[0]
    let defaultDate = matchDates.length > 0 ? matchDates[0].date : ""
    for (const d of matchDates) {
        if (d.date <= today) defaultDate = d.date
        else break
    }

    const inbox = defaultDate ? await getSheetInbox(defaultDate) : null

    return (
        <div className="space-y-6">
            <PageHeader
                title="Score Sheet Photos"
                description="Photograph each court's sheet at the end of the night, or drop them in from a computer. Each sheet says which court it is, so they file themselves, and whatever can be read is offered as a draft on Enter Scores for you to check and save."
            />
            {matchDates.length === 0 ? (
                <StatusBanner variant="error">
                    No match dates found for the current season.
                </StatusBanner>
            ) : (
                <ScoreSheetInboxClient
                    matchDates={matchDates}
                    defaultDate={defaultDate}
                    initialRows={inbox?.status ? inbox.data : []}
                    picBaseUrl={playerPicBaseUrl()}
                />
            )}
        </div>
    )
}
