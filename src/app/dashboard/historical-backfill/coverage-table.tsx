"use client"

import {
    RiCheckLine,
    RiCloseLine,
    RiErrorWarningLine,
    RiRefreshLine,
    RiSubtractLine
} from "@remixicon/react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import type {
    CoverageStatus,
    HistoricalCoverage,
    SeasonCoverage
} from "@/lib/historical-coverage"
import { cn } from "@/lib/utils"

/**
 * One cell of the grid. The tooltip carries the numbers behind the symbol --
 * "3 of 5 divisions" is the part that actually tells you what to go and fix,
 * and a bare triangle does not.
 */
function StatusCell({
    status,
    detail
}: {
    status: CoverageStatus
    detail: string
}) {
    const config = {
        full: {
            Icon: RiCheckLine,
            className: "text-emerald-600 dark:text-emerald-400",
            label: "Complete"
        },
        partial: {
            Icon: RiErrorWarningLine,
            className: "text-amber-600 dark:text-amber-400",
            label: "Partial"
        },
        none: {
            Icon: RiCloseLine,
            className: "text-red-600 dark:text-red-400",
            label: "Missing"
        },
        na: {
            Icon: RiSubtractLine,
            className: "text-muted-foreground/40",
            label: "Not applicable"
        }
    }[status]

    return (
        <TableCell className="text-center">
            {/* role="img" so the icon carries its meaning to a screen reader;
                a bare span has no role and cannot take an aria-label. */}
            <span
                role="img"
                className="inline-flex"
                title={`${config.label} — ${detail}`}
                aria-label={`${config.label}. ${detail}`}
            >
                <config.Icon className={cn("h-4 w-4", config.className)} />
            </span>
        </TableCell>
    )
}

function divisionDetail(covered: number, total: number, noun: string) {
    if (total === 0) {
        return "no divisions on record to measure against"
    }
    if (covered === 0) {
        return `no ${noun} for any of the ${total} divisions`
    }
    return `${covered} of ${total} divisions have ${noun}`
}

function draftDetail(season: SeasonCoverage) {
    const { realDivisions, syntheticDivisions, rosterDivisions } = season.counts
    if (rosterDivisions === 0) {
        return "no rosters to judge"
    }
    if (syntheticDivisions === 0) {
        return `all ${realDivisions} roster divisions come from a real draft`
    }
    if (realDivisions === 0) {
        return `all ${syntheticDivisions} roster divisions are reconstructed from the archive, with no pick order`
    }
    return `${realDivisions} real draft, ${syntheticDivisions} reconstructed from the archive`
}

const LEGEND = [
    {
        Icon: RiCheckLine,
        className: "text-emerald-600 dark:text-emerald-400",
        label: "Complete",
        text: "every division the season ran is covered"
    },
    {
        Icon: RiErrorWarningLine,
        className: "text-amber-600 dark:text-amber-400",
        label: "Partial",
        text: "some divisions covered, others missing"
    },
    {
        Icon: RiCloseLine,
        className: "text-red-600 dark:text-red-400",
        label: "Missing",
        text: "no data for this season"
    },
    {
        Icon: RiSubtractLine,
        className: "text-muted-foreground/40",
        label: "N/A",
        text: "nothing to record — season not played, or no rosters to judge"
    }
]

export function CoverageTable({ coverage }: { coverage: HistoricalCoverage }) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [onlyGaps, setOnlyGaps] = useState(false)

    // "na" counts as settled, not as a gap: an unplayed season has no backlog,
    // so "show gaps only" must not park it at the top of the list forever.
    const settled = (status: CoverageStatus) =>
        status === "full" || status === "na"

    const isComplete = (s: SeasonCoverage) =>
        settled(s.champions) &&
        settled(s.regularMatches) &&
        settled(s.playoffMatches) &&
        settled(s.rosters) &&
        settled(s.realDraft)

    const rows = onlyGaps
        ? coverage.seasons.filter((s) => !isComplete(s))
        : coverage.seasons
    const { totals } = coverage

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground text-sm">
                    {LEGEND.map((l) => (
                        <span
                            key={l.label}
                            className="inline-flex items-center gap-1.5"
                        >
                            <l.Icon
                                className={cn("h-4 w-4 shrink-0", l.className)}
                            />
                            <span className="font-medium text-foreground">
                                {l.label}
                            </span>
                            <span>— {l.text}</span>
                        </span>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setOnlyGaps((v) => !v)}
                    >
                        {onlyGaps ? "Show all seasons" : "Show gaps only"}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => startTransition(() => router.refresh())}
                    >
                        <RiRefreshLine
                            className={cn(
                                "mr-1.5 h-4 w-4",
                                pending && "animate-spin"
                            )}
                        />
                        {pending ? "Refreshing…" : "Refresh"}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <SummaryCard label="Seasons" value={totals.seasons} />
                <SummaryCard
                    label="With champions"
                    value={totals.withChampions}
                    of={totals.seasons}
                />
                <SummaryCard
                    label="With regular matches"
                    value={totals.withRegular}
                    of={totals.seasons}
                />
                <SummaryCard
                    label="With playoffs"
                    value={totals.withPlayoff}
                    of={totals.seasons}
                />
                <SummaryCard
                    label="With rosters"
                    value={totals.withRosters}
                    of={totals.seasons}
                />
                <SummaryCard
                    label="With real draft"
                    value={totals.withRealDraft}
                    of={totals.seasons}
                />
            </div>

            <div className="overflow-x-auto rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="whitespace-nowrap">
                                Season
                            </TableHead>
                            <TableHead className="text-center">
                                Champions
                            </TableHead>
                            <TableHead className="text-center">
                                Regular matches
                            </TableHead>
                            <TableHead className="text-center">
                                Playoff matches
                            </TableHead>
                            <TableHead className="text-center">
                                Rosters
                            </TableHead>
                            <TableHead className="text-center">
                                Real draft
                            </TableHead>
                            <TableHead className="whitespace-nowrap text-right">
                                Divisions
                            </TableHead>
                            <TableHead className="whitespace-nowrap text-right">
                                Matches
                            </TableHead>
                            <TableHead className="whitespace-nowrap text-right">
                                Players
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((s) => (
                            <TableRow key={s.id}>
                                <TableCell className="whitespace-nowrap font-medium">
                                    {s.code}
                                    <span className="ml-2 text-muted-foreground text-sm">
                                        {s.season} {s.year}
                                    </span>
                                </TableCell>
                                <StatusCell
                                    status={s.champions}
                                    detail={
                                        s.champions === "na"
                                            ? "season not played yet"
                                            : s.divisions > 0
                                              ? `${s.divisions} divisions recorded`
                                              : "no champions recorded"
                                    }
                                />
                                <StatusCell
                                    status={s.regularMatches}
                                    detail={`${divisionDetail(
                                        s.counts.regularDivisions,
                                        s.divisions,
                                        "regular-season matches"
                                    )} · ${s.counts.regular} matches`}
                                />
                                <StatusCell
                                    status={s.playoffMatches}
                                    detail={`${divisionDetail(
                                        s.counts.playoffDivisions,
                                        s.divisions,
                                        "playoff matches"
                                    )} · ${s.counts.playoff} matches`}
                                />
                                <StatusCell
                                    status={s.rosters}
                                    detail={divisionDetail(
                                        s.counts.rosterDivisions,
                                        s.divisions,
                                        "rosters"
                                    )}
                                />
                                <StatusCell
                                    status={s.realDraft}
                                    detail={draftDetail(s)}
                                />
                                <TableCell className="text-right tabular-nums">
                                    {s.divisions || "—"}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {s.counts.regular + s.counts.playoff || "—"}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {s.counts.players || "—"}
                                </TableCell>
                            </TableRow>
                        ))}
                        {rows.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={9}
                                    className="py-8 text-center text-muted-foreground"
                                >
                                    Every season is complete.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <p className="text-muted-foreground text-sm">
                Showing {rows.length} of {coverage.seasons.length} seasons.{" "}
                <Badge variant="secondary">
                    {totals.regular.toLocaleString()}
                </Badge>{" "}
                regular and{" "}
                <Badge variant="secondary">
                    {totals.playoff.toLocaleString()}
                </Badge>{" "}
                playoff matches,{" "}
                <Badge variant="secondary">
                    {totals.players.toLocaleString()}
                </Badge>{" "}
                roster spots in total.
            </p>
        </div>
    )
}

function SummaryCard({
    label,
    value,
    of
}: {
    label: string
    value: number
    of?: number
}) {
    return (
        <div className="rounded-md border p-3">
            <div className="font-semibold text-2xl tabular-nums">
                {value}
                {of !== undefined && (
                    <span className="ml-1 font-normal text-base text-muted-foreground">
                        / {of}
                    </span>
                )}
            </div>
            <div className="text-muted-foreground text-sm">{label}</div>
        </div>
    )
}
