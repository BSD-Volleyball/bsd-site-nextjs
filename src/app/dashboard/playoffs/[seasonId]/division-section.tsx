"use client"

import dynamic from "next/dynamic"
import { RiArrowDownSLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from "@/components/ui/collapsible"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
    PlayoffDivision,
    PlayoffMatchLine,
    PlayoffSection
} from "./actions"

const BracketView = dynamic(
    () => import("./bracket-view").then((mod) => mod.BracketView),
    {
        ssr: false,
        loading: () => (
            <div className="flex min-h-[500px] items-center justify-center rounded-lg border bg-muted/20 p-3">
                <span className="text-muted-foreground">
                    Loading bracket visualization...
                </span>
            </div>
        )
    }
)

function MatchCard({ match }: { match: PlayoffMatchLine }) {
    return (
        <div className="rounded-lg border bg-background p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
                <span>
                    Match {match.matchNum !== null ? `#${match.matchNum}` : "—"}{" "}
                    • Week {match.week}
                </span>
                <span className="whitespace-nowrap">
                    {match.date || "TBD"}
                    {match.time ? ` @ ${match.time}` : ""}
                    {match.court !== null ? ` • Ct ${match.court}` : ""}
                </span>
            </div>

            <div className="mt-2 space-y-1.5">
                <div
                    className={cn(
                        "flex items-center justify-between rounded-md px-2 py-1 text-sm",
                        match.homeIsWinner === true &&
                            "bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-300"
                    )}
                >
                    <span className="truncate pr-2">{match.homeLabel}</span>
                    <span className="tabular-nums">
                        {match.homeScore !== null ? match.homeScore : "—"}
                    </span>
                </div>

                <div
                    className={cn(
                        "flex items-center justify-between rounded-md px-2 py-1 text-sm",
                        match.homeIsWinner === false &&
                            "bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-300"
                    )}
                >
                    <span className="truncate pr-2">{match.awayLabel}</span>
                    <span className="tabular-nums">
                        {match.awayScore !== null ? match.awayScore : "—"}
                    </span>
                </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
                {match.homeSourceLabel && (
                    <Badge
                        variant="outline"
                        className="px-1.5 py-0 text-[10px]"
                    >
                        Home: {match.homeSourceLabel}
                    </Badge>
                )}
                {match.awaySourceLabel && (
                    <Badge
                        variant="outline"
                        className="px-1.5 py-0 text-[10px]"
                    >
                        Away: {match.awaySourceLabel}
                    </Badge>
                )}
                {match.workAssignmentLabel && (
                    <Badge
                        variant="secondary"
                        className="px-1.5 py-0 text-[10px]"
                    >
                        Work: {match.workAssignmentLabel}
                    </Badge>
                )}
            </div>

            <p className="mt-2 text-muted-foreground text-xs">
                Sets: {match.scoresDisplay}
            </p>
        </div>
    )
}

function BracketSectionView({ section }: { section: PlayoffSection }) {
    return (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
            <h3 className="font-semibold text-sm uppercase tracking-wide">
                {section.label}
            </h3>

            <div className="overflow-x-auto pb-1">
                <div className="flex min-w-max gap-4">
                    {section.rounds.map((round) => (
                        <div
                            key={`${section.key}-round-${round.round}`}
                            className="w-80 shrink-0"
                        >
                            <div className="mb-2 rounded-md bg-muted px-2 py-1 text-center font-medium text-muted-foreground text-xs">
                                Round {round.round}
                            </div>
                            <div className="space-y-3">
                                {round.matches.map((match) => (
                                    <MatchCard key={match.key} match={match} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

function ScheduleTable({ matches }: { matches: PlayoffMatchLine[] }) {
    return (
        <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b bg-muted/40">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Week
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Date
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Match
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Time
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Court
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Teams
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Work
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {matches.map((match) => (
                        <tr
                            key={`schedule-${match.key}`}
                            className="border-b last:border-0"
                        >
                            <td className="px-3 py-2">{match.week}</td>
                            <td className="whitespace-nowrap px-3 py-2">
                                {match.date || "—"}
                            </td>
                            <td className="px-3 py-2">
                                {match.matchNum !== null
                                    ? `#${match.matchNum}`
                                    : "—"}
                            </td>
                            <td className="px-3 py-2">{match.time || "—"}</td>
                            <td className="px-3 py-2">
                                {match.court !== null ? match.court : "—"}
                            </td>
                            <td className="px-3 py-2">
                                {match.homeLabel} vs {match.awayLabel}
                            </td>
                            <td className="px-3 py-2">
                                {match.workAssignmentLabel || "—"}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function ResultsTable({ matches }: { matches: PlayoffMatchLine[] }) {
    return (
        <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b bg-muted/40">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Winner
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Games
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Loser
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Games
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Scores
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {matches.length === 0 ? (
                        <tr>
                            <td
                                colSpan={5}
                                className="px-3 py-8 text-center text-muted-foreground"
                            >
                                No completed playoff matches yet.
                            </td>
                        </tr>
                    ) : (
                        matches.map((match) => (
                            <tr
                                key={`results-${match.key}`}
                                className="border-b last:border-0"
                            >
                                <td className="px-3 py-2">
                                    {match.winnerLabel || "—"}
                                </td>
                                <td className="px-3 py-2">
                                    {match.winnerGames !== null
                                        ? match.winnerGames
                                        : "—"}
                                </td>
                                <td className="px-3 py-2">
                                    {match.loserLabel || "—"}
                                </td>
                                <td className="px-3 py-2">
                                    {match.loserGames !== null
                                        ? match.loserGames
                                        : "—"}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2">
                                    {match.scoresDisplay}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    )
}

export function DivisionSection({ division }: { division: PlayoffDivision }) {
    return (
        <Collapsible defaultOpen>
            <div className="rounded-lg border bg-card shadow-sm">
                <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/50">
                    <div className="space-y-1 text-left">
                        <h2 className="font-semibold text-xl">
                            {division.name}
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            Double-elimination playoff bracket
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {division.champion ? (
                            <Badge
                                variant="secondary"
                                className="hidden sm:inline-flex"
                            >
                                Champion: {division.champion}
                            </Badge>
                        ) : (
                            <Badge
                                variant="outline"
                                className="hidden sm:inline-flex"
                            >
                                In Progress
                            </Badge>
                        )}
                        <RiArrowDownSLine
                            className="transition-transform duration-200 [[data-state=open]>&]:rotate-180"
                            size={20}
                        />
                    </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                    <div className="space-y-4 border-t p-4">
                        {division.champion && (
                            <Badge variant="secondary" className="sm:hidden">
                                Champion: {division.champion}
                            </Badge>
                        )}

                        <Tabs defaultValue="bracket" className="w-full">
                            <TabsList>
                                <TabsTrigger value="bracket">
                                    Bracket
                                </TabsTrigger>
                                <TabsTrigger value="tables">
                                    Schedule & Results
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="bracket" className="space-y-4">
                                {division.seeds.length > 0 && (
                                    <div className="rounded-lg border bg-muted/20 p-3">
                                        <h3 className="mb-2 font-semibold text-sm uppercase tracking-wide">
                                            Seeds
                                        </h3>
                                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                            {division.seeds.map((seed) => (
                                                <div
                                                    key={`seed-${seed.seed}`}
                                                    className="rounded-md border bg-background px-3 py-2 text-sm"
                                                >
                                                    <span className="font-semibold">
                                                        {seed.seed}
                                                        {seed.seed === 1
                                                            ? "st"
                                                            : seed.seed === 2
                                                              ? "nd"
                                                              : seed.seed === 3
                                                                ? "rd"
                                                                : "th"}{" "}
                                                        Seed:
                                                    </span>{" "}
                                                    {seed.teamLabel}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {division.bracketMatches ? (
                                    <BracketView
                                        matches={division.bracketMatches}
                                    />
                                ) : division.sections.length === 0 ? (
                                    <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                                        No playoff bracket data found for this
                                        division.
                                    </div>
                                ) : (
                                    division.sections.map((section) => (
                                        <BracketSectionView
                                            key={section.key}
                                            section={section}
                                        />
                                    ))
                                )}
                            </TabsContent>

                            <TabsContent value="tables">
                                <div className="grid gap-4 xl:grid-cols-2">
                                    <ScheduleTable
                                        matches={division.scheduleMatches}
                                    />
                                    <ResultsTable
                                        matches={division.resultsMatches}
                                    />
                                </div>
                            </TabsContent>
                        </Tabs>
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    )
}
