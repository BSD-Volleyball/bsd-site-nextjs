"use client"

import { RiTrophyLine } from "@remixicon/react"
import type * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type {
    ScheduleBracketGroup,
    ScheduleDivision,
    ScheduleMatch,
    TournamentScheduleView
} from "@/lib/tournament-schedule"

const BRACKET_LABELS: Record<string, string> = {
    winners: "Winners",
    losers: "Losers",
    final: "Final"
}

function formatTime(value: string | null): string | null {
    if (!value) return null
    const [hStr, mStr] = value.split(":")
    const h = Number(hStr)
    const m = Number(mStr)
    if (Number.isNaN(h) || Number.isNaN(m)) return value
    const period = h >= 12 ? "pm" : "am"
    const hour12 = h % 12 === 0 ? 12 : h % 12
    return m === 0
        ? `${hour12}${period}`
        : `${hour12}:${String(m).padStart(2, "0")}${period}`
}

// Which set columns to render — any set where either side has a score.
function scoredSetIndices(match: ScheduleMatch): number[] {
    const idx: number[] = []
    for (let i = 0; i < 3; i++) {
        if (match.sets.home[i] !== null || match.sets.away[i] !== null) {
            idx.push(i)
        }
    }
    return idx
}

function TeamRow({
    name,
    setValues,
    setIndices,
    isWinner,
    isMine,
    decided
}: {
    name: string
    setValues: (number | null)[]
    setIndices: number[]
    isWinner: boolean
    isMine: boolean
    decided: boolean
}) {
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
                <span
                    className={cn(
                        "truncate text-sm",
                        decided && isWinner
                            ? "font-semibold text-foreground"
                            : decided
                              ? "text-muted-foreground"
                              : "text-foreground"
                    )}
                >
                    {name}
                </span>
                {isMine && (
                    <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 font-medium text-[10px] text-primary-foreground uppercase leading-none">
                        You
                    </span>
                )}
            </div>
            {setIndices.length > 0 && (
                <div className="flex shrink-0 items-center gap-1.5 tabular-nums">
                    {setIndices.map((i) => {
                        const v = setValues[i]
                        return (
                            <span
                                key={i}
                                className={cn(
                                    "w-5 text-right text-sm",
                                    isWinner
                                        ? "font-semibold text-foreground"
                                        : "text-muted-foreground"
                                )}
                            >
                                {v === null ? "–" : v}
                            </span>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

export function MatchBlock({
    match,
    myTeamId
}: {
    match: ScheduleMatch
    myTeamId: number | null
}) {
    const time = formatTime(match.startTime)
    const setIndices = scoredSetIndices(match)
    const decided = match.winnerTeamId !== null
    const homeMine = myTeamId !== null && match.home?.id === myTeamId
    const awayMine = myTeamId !== null && match.away?.id === myTeamId
    const isMine = homeMine || awayMine

    const meta: string[] = []
    if (time) meta.push(time)
    if (match.court !== null) meta.push(`Court ${match.court}`)

    return (
        <div
            className={cn(
                "rounded-md border bg-card px-3 py-2.5 transition-colors",
                isMine && "border-l-2 border-l-primary bg-primary/5"
            )}
        >
            {(meta.length > 0 || match.workTeamName) && (
                <div className="mb-1.5 flex items-center justify-between gap-2 text-muted-foreground text-xs">
                    <span className="font-medium">
                        {meta.join(" · ") || "Time TBD"}
                    </span>
                    {match.workTeamName && (
                        <span className="truncate">
                            Work: {match.workTeamName}
                        </span>
                    )}
                </div>
            )}
            <div className="space-y-1">
                <TeamRow
                    name={match.home?.name ?? "TBD"}
                    setValues={match.sets.home}
                    setIndices={setIndices}
                    isWinner={decided && match.winnerTeamId === match.home?.id}
                    isMine={homeMine}
                    decided={decided}
                />
                <TeamRow
                    name={match.away?.name ?? "TBD"}
                    setValues={match.sets.away}
                    setIndices={setIndices}
                    isWinner={decided && match.winnerTeamId === match.away?.id}
                    isMine={awayMine}
                    decided={decided}
                />
            </div>
        </div>
    )
}

function DivisionRoundRobin({
    division,
    myTeamId
}: {
    division: ScheduleDivision
    myTeamId: number | null
}) {
    if (division.pools.length === 0) return null
    return (
        <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {division.pools.map((pool) => (
                <Card key={pool.id}>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-baseline justify-between text-base">
                            <span>{pool.name}</span>
                            <span className="font-normal text-muted-foreground text-xs">
                                {pool.matches.length} match
                                {pool.matches.length === 1 ? "" : "es"}
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {pool.matches.map((match) => (
                            <MatchBlock
                                key={match.id}
                                match={match}
                                myTeamId={myTeamId}
                            />
                        ))}
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

export function DivisionBracket({
    groups,
    myTeamId
}: {
    groups: ScheduleBracketGroup[]
    myTeamId: number | null
}) {
    if (groups.length === 0) return null
    return (
        <div className="flex gap-4 overflow-x-auto pb-2">
            {groups.map((group) => (
                <div
                    key={`${group.bracket}-${group.round}`}
                    className="w-56 shrink-0 space-y-2"
                >
                    <div className="text-muted-foreground text-xs uppercase tracking-wide">
                        {BRACKET_LABELS[group.bracket] ?? group.bracket} · Round{" "}
                        {group.round}
                    </div>
                    {group.matches.map((match) => (
                        <MatchBlock
                            key={match.id}
                            match={match}
                            myTeamId={myTeamId}
                        />
                    ))}
                </div>
            ))}
        </div>
    )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
    return <h2 className="font-semibold text-lg tracking-tight">{children}</h2>
}

export function DivisionLabel({ name }: { name: string }) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-muted-foreground/70 text-xs uppercase tracking-wider">
                Division
            </span>
            <span className="font-semibold text-sm">{name}</span>
        </div>
    )
}

export function ScheduleView({ view }: { view: TournamentScheduleView }) {
    const { myTeamId } = view
    const bracketDivisions = view.divisions.filter(
        (d) => d.bracketGroups.length > 0
    )

    return (
        <div className="space-y-10">
            {/* Round robin */}
            <section className="space-y-5">
                <SectionHeading>Round Robin</SectionHeading>
                {view.hasPoolMatches ? (
                    view.divisions
                        .filter((d) => d.pools.length > 0)
                        .map((division) => (
                            <div key={division.id} className="space-y-3">
                                <DivisionLabel name={division.name} />
                                <DivisionRoundRobin
                                    division={division}
                                    myTeamId={myTeamId}
                                />
                            </div>
                        ))
                ) : (
                    <p className="text-muted-foreground text-sm">
                        The pool schedule hasn't been posted yet. Check back
                        once pools are drawn.
                    </p>
                )}
            </section>

            {/* Playoffs — only once the bracket is seeded */}
            {view.hasBracketMatches && (
                <section className="space-y-5">
                    <div className="flex items-center gap-2">
                        <RiTrophyLine
                            className="text-primary"
                            size={20}
                            aria-hidden="true"
                        />
                        <SectionHeading>Playoffs</SectionHeading>
                        <span className="text-muted-foreground text-xs">
                            {view.eliminationFormat === "double"
                                ? "Double elimination"
                                : "Single elimination"}
                        </span>
                    </div>
                    {bracketDivisions.map((division) => (
                        <div key={division.id} className="space-y-3">
                            <DivisionLabel name={division.name} />
                            <DivisionBracket
                                groups={division.bracketGroups}
                                myTeamId={myTeamId}
                            />
                        </div>
                    ))}
                </section>
            )}
        </div>
    )
}
