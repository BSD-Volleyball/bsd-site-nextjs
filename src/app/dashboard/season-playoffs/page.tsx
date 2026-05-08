import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { getSeasonConfig } from "@/lib/site-config"
import { getPlayoffData } from "@/app/dashboard/playoffs/[seasonId]/actions"
import { DivisionSection } from "@/components/playoffs/division-section"
import { SEASON_PHASES, type SeasonPhase } from "@/lib/season-phases"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Playoffs"
}

export const dynamic = "force-dynamic"

const PLAYOFFS_START_PHASE: SeasonPhase = "playoffs"
const PLAYOFFS_END_PHASE: SeasonPhase = "complete"

export default async function SeasonPlayoffsPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        redirect("/auth/sign-in")
    }

    const config = await getSeasonConfig()

    if (!config.seasonId || !config.phase) {
        redirect("/dashboard")
    }

    const startIdx = SEASON_PHASES.indexOf(PLAYOFFS_START_PHASE)
    const endIdx = SEASON_PHASES.indexOf(PLAYOFFS_END_PHASE)
    const currentIdx = SEASON_PHASES.indexOf(config.phase)

    if (currentIdx < startIdx || currentIdx > endIdx) {
        redirect("/dashboard")
    }

    const result = await getPlayoffData(config.seasonId)

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Playoffs"
                    description="View playoff brackets and results."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load playoff data."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${result.seasonLabel} Playoffs`}
                description="Double-elimination bracket, schedule, and results by division."
            />
            {result.divisions.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No playoff matches found for this season.
                </div>
            ) : (
                result.divisions.map((division) => (
                    <DivisionSection
                        key={division.id}
                        division={division}
                        userTeamId={result.userTeamId}
                        defaultOpen={
                            result.userDivisionId === null ||
                            division.id === result.userDivisionId
                        }
                    />
                ))
            )}
        </div>
    )
}
