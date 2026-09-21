import { redirect } from "next/navigation"
import { playerPicBaseUrl } from "@/config/env"
import { requireSessionOrRedirect } from "@/next/page-guards"
import { getSeasonConfig } from "@/lib/site-config"
import { hasPermissionBySession } from "@/next/session"
import { getMatchDatesForSeason, getMatchesForDate } from "./actions"
import { EnterScoresClient } from "./enter-scores-client"

export default async function EnterScoresPage({
    searchParams
}: {
    searchParams: Promise<{ date?: string; court?: string }>
}) {
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
    const matchDates = datesResult.dates
    const params = await searchParams

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
    let initialData = null
    // A score sheet's QR code deep-links to its own night and court. An
    // unknown date falls back to the default rather than showing nothing.
    if (params.date && matchDates.some((d) => d.date === params.date)) {
        defaultDate = params.date
    }

    const requestedCourt = Number.parseInt(params.court ?? "", 10)
    const highlightCourt =
        Number.isInteger(requestedCourt) && requestedCourt > 0
            ? requestedCourt
            : null

    if (defaultDate) {
        initialData = await getMatchesForDate(defaultDate)
    }

    const playerPicUrl = playerPicBaseUrl()

    return (
        <div className="space-y-6">
            <h1 className="font-bold text-2xl">Enter Scores</h1>
            <EnterScoresClient
                matchDates={matchDates}
                defaultDate={defaultDate}
                initialDivisions={initialData?.divisions ?? []}
                initialScoreSheets={initialData?.scoreSheets ?? []}
                picBaseUrl={playerPicUrl}
                highlightCourt={highlightCourt}
            />
        </div>
    )
}
