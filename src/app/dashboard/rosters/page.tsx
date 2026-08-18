import { PageHeader } from "@/components/layout/page-header"
import { PlayerHighlightLegend } from "@/components/player-highlight-legend"
import { StatusBanner } from "@/components/ui/status-banner"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { listFriendIds } from "@/lib/friends"
import { SEASON_PHASES } from "@/lib/season-phases"
import { getSeasonConfig } from "@/lib/site-config"
import type { Metadata } from "next"
import { getRosterData } from "./[seasonId]/actions"
import { RosterDivisionSection } from "./[seasonId]/roster-division-section"

export const metadata: Metadata = {
    title: "Rosters"
}

export const dynamic = "force-dynamic"

const rosterVisibleFromPhase = "draft"
const rosterVisibleThroughPhase = "complete"

export default async function CurrentRosterPage() {
    const session = await requireSessionOrRedirect()

    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Rosters"
                    description="View team rosters for the current season."
                />
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No active season is configured.
                </div>
            </div>
        )
    }

    const phaseIndex = SEASON_PHASES.indexOf(config.phase)
    const isRosterPhaseVisible =
        phaseIndex >= SEASON_PHASES.indexOf(rosterVisibleFromPhase) &&
        phaseIndex <= SEASON_PHASES.indexOf(rosterVisibleThroughPhase)

    if (!isRosterPhaseVisible) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Rosters"
                    description="View team rosters for the current season."
                />
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    Current season rosters are available starting in the Draft
                    phase.
                </div>
            </div>
        )
    }

    const [result, friendIds] = await Promise.all([
        getRosterData(config.seasonId),
        listFriendIds(session.user.id)
    ])

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Rosters"
                    description="View team rosters for the current season."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load roster data."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${result.data.seasonLabel} Rosters`}
                description="View team rosters by division."
            />
            <PlayerHighlightLegend hasFriends={friendIds.length > 0} />
            {result.data.divisions.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No rosters found for the current season.
                </div>
            ) : (
                result.data.divisions.map((division) => (
                    <RosterDivisionSection
                        key={division.id}
                        division={division}
                        currentUserId={session.user.id}
                        friendIds={friendIds}
                    />
                ))
            )}
        </div>
    )
}
