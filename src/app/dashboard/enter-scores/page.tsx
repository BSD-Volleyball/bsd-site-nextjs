import { redirect } from "next/navigation"
import { playerPicBaseUrl } from "@/config/env"
import { requireSessionOrRedirect } from "@/next/page-guards"
import { getSeasonConfig } from "@/lib/site-config"
import { hasPermissionBySession } from "@/next/session"
import { getSheetReads } from "../score-sheet-inbox/actions"
import { getMatchDatesForSeason, getMatchesForDate } from "./actions"
import { EnterScoresClient } from "./enter-scores-client"
import type { ScoreDraft } from "@/lib/scoresheets/read/draft"
import { toScoreDrafts } from "@/lib/scoresheets/read/draft"

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
    // Whatever has already been read from photographs of this night, so the
    // form can offer it without a round trip once the page is up.
    const initialDrafts: Record<number, ScoreDraft> = {}
    if (defaultDate) {
        initialData = await getMatchesForDate(defaultDate)
        const reads = await getSheetReads(defaultDate)
        if (reads.status) {
            for (const entry of reads.data) {
                for (const draft of toScoreDrafts(entry.read)) {
                    if (!draft.empty) initialDrafts[draft.matchId] = draft
                }
            }
        }
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
                initialDrafts={initialDrafts}
            />
        </div>
    )
}
