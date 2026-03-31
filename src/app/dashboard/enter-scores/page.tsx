import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { getSeasonConfig } from "@/lib/site-config"
import { hasPermissionBySession } from "@/lib/rbac"
import { getMatchDatesForSeason, getMatchesForDate } from "./actions"
import { EnterScoresClient } from "./enter-scores-client"

export default async function EnterScoresPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

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
    if (defaultDate) {
        initialData = await getMatchesForDate(defaultDate)
    }

    const playerPicUrl = process.env.PLAYER_PIC_URL ?? ""

    return (
        <div className="space-y-6">
            <h1 className="font-bold text-2xl">Enter Scores</h1>
            <EnterScoresClient
                matchDates={matchDates}
                defaultDate={defaultDate}
                initialDivisions={initialData?.divisions ?? []}
                initialScoreSheets={initialData?.scoreSheets ?? []}
                picBaseUrl={playerPicUrl}
            />
        </div>
    )
}
