import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { getSeasonConfig } from "@/lib/site-config"
import { getCurrentSeasonScheduleData } from "./actions"
import { SeasonDivisionSection } from "./division-section"
import { SEASON_PHASES } from "@/lib/season-phases"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Season Schedule"
}

export const dynamic = "force-dynamic"

const SCHEDULE_START_PHASE = "draft"
const SCHEDULE_END_PHASE = "complete"

export default async function SeasonSchedulePage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        redirect("/auth/sign-in")
    }

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

    const result = await getCurrentSeasonScheduleData(
        config.seasonId,
        session.user.id
    )

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Season Schedule"
                    description="View standings, schedule, and results."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load season schedule data."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${result.seasonLabel} Season`}
                description="Standings, schedule, and results by division."
            />
            {result.divisions.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No season schedule data found for this season.
                </div>
            ) : (
                result.divisions.map((division) => (
                    <SeasonDivisionSection
                        key={division.id}
                        division={division}
                        userTeamId={result.userTeamId}
                        defaultOpen={
                            result.userDivisionId !== null &&
                            division.id === result.userDivisionId
                        }
                    />
                ))
            )}
        </div>
    )
}
