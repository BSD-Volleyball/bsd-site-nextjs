import type { Metadata } from "next"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { PageHeader } from "@/components/layout/page-header"
import { DivisionLabel } from "@/app/dashboard/tournament-schedule-view/schedule-view"
import { TournamentPlacementsCard } from "@/components/tournament/tournament-placements-card"
import { BracketView } from "@/components/playoffs/bracket-view"
import { getTournamentPlayoffs } from "./actions"

export const metadata: Metadata = {
    title: "Tournament Playoffs"
}

export const dynamic = "force-dynamic"

function SectionHeading({ children }: { children: React.ReactNode }) {
    return <h2 className="font-semibold text-lg tracking-tight">{children}</h2>
}

export default async function TournamentPlayoffsPage({
    params
}: {
    params: Promise<{ tournamentId: string }>
}) {
    await requireSessionOrRedirect()

    const { tournamentId } = await params
    const result = await getTournamentPlayoffs(parseInt(tournamentId, 10))

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Tournament Playoffs"
                    description="Final rankings and playoff brackets."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load playoff results."}
                </StatusBanner>
            </div>
        )
    }

    const { tournamentLabel, eliminationFormat, placements, divisions } =
        result.data
    const bracketDivisions = divisions.filter((d) => d.bracket !== null)

    return (
        <div className="space-y-10">
            <PageHeader
                title={`${tournamentLabel} — Playoffs`}
                description="Final rankings and playoff brackets by division."
            />

            {placements.length > 0 && (
                <section className="space-y-4">
                    <SectionHeading>Final Rankings</SectionHeading>
                    <TournamentPlacementsCard divisions={placements} />
                </section>
            )}

            {bracketDivisions.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No playoff matches recorded for this tournament.
                </div>
            ) : (
                <section className="space-y-5">
                    <div className="flex items-center gap-2">
                        <SectionHeading>Brackets</SectionHeading>
                        <span className="text-muted-foreground text-xs">
                            {eliminationFormat === "double"
                                ? "Double elimination"
                                : "Single elimination"}
                        </span>
                    </div>
                    {bracketDivisions.map((division) => (
                        <div key={division.id} className="space-y-3">
                            <DivisionLabel name={division.name} />
                            <BracketView
                                matches={
                                    division.bracket as NonNullable<
                                        typeof division.bracket
                                    >
                                }
                            />
                        </div>
                    ))}
                </section>
            )}
        </div>
    )
}
