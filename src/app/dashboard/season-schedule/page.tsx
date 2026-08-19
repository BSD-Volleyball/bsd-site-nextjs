import { requireSessionOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { getSeasonConfig } from "@/lib/site-config"
import { DivisionSection } from "@/components/division-section"
import {
    type CurrentSeasonScheduleDivision,
    getCurrentSeasonScheduleData
} from "./actions"
import { CalendarLinksDialog } from "@/components/calendar/calendar-links-dialog"
import { SEASON_PHASES } from "@/lib/season-phases"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Season Schedule"
}

export const dynamic = "force-dynamic"

const SCHEDULE_START_PHASE = "draft"
const SCHEDULE_END_PHASE = "complete"

function decorateWeeksForUser(
    weeks: CurrentSeasonScheduleDivision["weeks"],
    userTeamId: number | null
) {
    return weeks.map((week) => ({
        ...week,
        matches: week.matches.map((match) => ({
            ...match,
            highlightedMatchTeam:
                userTeamId === match.homeTeamId
                    ? ("home" as const)
                    : userTeamId === match.awayTeamId
                      ? ("away" as const)
                      : null,
            highlightScheduleDetails:
                userTeamId !== null &&
                (match.homeTeamId === userTeamId ||
                    match.awayTeamId === userTeamId),
            winnerHighlighted:
                userTeamId !== null && match.winnerTeamId === userTeamId,
            loserHighlighted:
                userTeamId !== null && match.loserTeamId === userTeamId
        }))
    }))
}

export default async function SeasonSchedulePage() {
    await requireSessionOrRedirect()

    const config = await getSeasonConfig()

    if (!config.seasonId || !config.phase) {
        redirect("/dashboard")
    }

    const startIdx = SEASON_PHASES.indexOf(SCHEDULE_START_PHASE)
    const endIdx = SEASON_PHASES.indexOf(SCHEDULE_END_PHASE)
    const currentIdx = SEASON_PHASES.indexOf(config.phase)

    if (currentIdx < startIdx || currentIdx > endIdx) {
        redirect("/dashboard")
    }

    const result = await getCurrentSeasonScheduleData(config.seasonId)

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Season Schedule"
                    description="View standings, schedule, and results."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load season schedule data."}
                </StatusBanner>
            </div>
        )
    }

    const { seasonLabel, divisions, userTeamId, userDivisionId } = result.data

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <PageHeader
                    title={`${seasonLabel} Season`}
                    description="Standings, schedule, and results by division."
                />
                <CalendarLinksDialog triggerLabel="Add to Calendar" />
            </div>
            {divisions.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No season schedule data found for this season.
                </div>
            ) : (
                divisions.map((division) => (
                    <DivisionSection
                        key={division.id}
                        title={division.name}
                        titleBadge={
                            !division.isDrafted ? (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                                    Undrafted
                                </span>
                            ) : null
                        }
                        defaultOpen={
                            userDivisionId !== null &&
                            division.id === userDivisionId
                        }
                        standings={division.standings}
                        highlightTeamId={userTeamId}
                        weeks={decorateWeeksForUser(division.weeks, userTeamId)}
                    />
                ))
            )}
        </div>
    )
}
