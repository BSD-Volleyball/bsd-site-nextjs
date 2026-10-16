import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { playerPicBaseUrl } from "@/config/env"
import { requireSessionOrRedirect } from "@/next/page-guards"
import { getSeasonConfig } from "@/lib/site-config"
import { hasPermissionBySession } from "@/next/session"
import { getMatchesForDate } from "./actions"
import { getMatchDatesForSeason } from "./data"
import { EnterScoresClient } from "./enter-scores-client"

export const metadata: Metadata = {
    title: "Edit Scores"
}

export default async function EnterScoresPage() {
    await requireSessionOrRedirect()

    const config = await getSeasonConfig()
    const hasAccess =
        !!config.seasonId &&
        (await hasPermissionBySession("scores:enter", {
            seasonId: config.seasonId
        }))

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const datesResult = await getMatchDatesForSeason()
    const matchDates = datesResult.status ? datesResult.data : []

    // Default to today or most recent past date
    const today = new Date().toISOString().split("T")[0]
    let defaultDate = matchDates.length > 0 ? matchDates[0].date : ""
    for (const d of matchDates) {
        if (d.date <= today) {
            defaultDate = d.date
        } else {
            break
        }
    }

    // Pre-fetch matches for the default date
    const initialData = defaultDate
        ? await getMatchesForDate(defaultDate)
        : null

    const playerPicUrl = playerPicBaseUrl()

    return (
        <div className="space-y-6">
            <h1 className="font-bold text-2xl">Edit Scores</h1>
            <EnterScoresClient
                matchDates={matchDates}
                defaultDate={defaultDate}
                initialDivisions={
                    initialData?.status ? initialData.data.divisions : []
                }
                initialScoreSheets={
                    initialData?.status ? initialData.data.scoreSheets : []
                }
                picBaseUrl={playerPicUrl}
            />
        </div>
    )
}
