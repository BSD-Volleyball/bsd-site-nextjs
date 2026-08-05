import type { Metadata } from "next"
import Link from "next/link"
import { PageHeader } from "@/components/layout/page-header"
import { seasonCategories } from "@/components/layout/sidebar-nav-config"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import {
    fetchHistoricalCoverage,
    hasCoverage,
    type SeasonCoverage
} from "@/lib/historical-coverage"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { formatSeasonLabel } from "@/lib/season-utils"
import { getSeasonConfig } from "@/lib/site-config"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "All Seasons"
}

// Which coverage field backs each sidebar category, so a link only renders
// when the target page actually has data to show.
const CATEGORY_COVERAGE: Record<string, (s: SeasonCoverage) => boolean> = {
    rosters: (s) => hasCoverage(s.rosters),
    schedule: (s) => hasCoverage(s.regularMatches),
    playoffs: (s) => hasCoverage(s.playoffMatches)
}

export default async function SeasonHistoryPage() {
    await requireSessionOrRedirect()

    const [config, coverage] = await Promise.all([
        getSeasonConfig(),
        fetchHistoricalCoverage()
    ])

    // Same rule as the sidebar: the current season joins the historical list
    // only once it is marked Complete.
    const maxHistoricalId =
        config.phase === "complete" ? config.seasonId : config.seasonId - 1
    const rows = coverage.seasons
        .filter(
            (s) =>
                s.id <= maxHistoricalId &&
                Object.values(CATEGORY_COVERAGE).some((covered) => covered(s))
        )
        .sort((a, b) => b.id - a.id)

    return (
        <div className="space-y-6">
            <PageHeader
                title="All Seasons"
                description="Every BSD season we have records for. Jump to a season's rosters, schedule, or playoff results."
            />

            {rows.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No historical seasons yet.
                </div>
            ) : (
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Season</TableHead>
                                {seasonCategories.map((cat) => (
                                    <TableHead key={cat.key}>
                                        {cat.label}
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((season) => (
                                <TableRow key={season.id}>
                                    <TableCell className="whitespace-nowrap font-medium">
                                        {formatSeasonLabel({
                                            seasonName: season.season,
                                            seasonYear: season.year
                                        })}
                                    </TableCell>
                                    {seasonCategories.map((cat) => (
                                        <TableCell key={cat.key}>
                                            {CATEGORY_COVERAGE[cat.key](
                                                season
                                            ) ? (
                                                <Link
                                                    href={`${cat.basePath}/${season.id}`}
                                                    className="text-primary hover:underline"
                                                >
                                                    {cat.label}
                                                </Link>
                                            ) : (
                                                <span className="text-muted-foreground">
                                                    —
                                                </span>
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    )
}
