import { PageHeader } from "@/components/layout/page-header"
import { auth } from "@/lib/auth"
import { SEASON_PHASES } from "@/lib/season-phases"
import { getSeasonConfig } from "@/lib/site-config"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { getRosterData } from "./[seasonId]/actions"
import { DivisionSection } from "./[seasonId]/division-section"

export const metadata: Metadata = {
    title: "Rosters"
}

export const dynamic = "force-dynamic"

const rosterVisibleFromPhase = "draft"
const rosterVisibleThroughPhase = "complete"

export default async function CurrentRosterPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

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

    const result = await getRosterData(config.seasonId)

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Rosters"
                    description="View team rosters for the current season."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load roster data."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${result.seasonLabel} Rosters`}
                description="View team rosters by division."
            />
            {result.divisions.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No rosters found for the current season.
                </div>
            ) : (
                result.divisions.map((division) => (
                    <DivisionSection
                        key={division.id}
                        division={division}
                        currentUserId={session.user.id}
                    />
                ))
            )}
        </div>
    )
}
