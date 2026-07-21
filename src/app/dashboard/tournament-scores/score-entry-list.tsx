"use client"

import { RiArrowDownSLine, RiTrophyLine } from "@remixicon/react"
import { useRouter } from "next/navigation"
import type * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
    saveTournamentMatchScore,
    type ScheduleMatch,
    type TournamentScheduleView
} from "./actions"

const BRACKET_LABELS: Record<string, string> = {
    winners: "Winners",
    losers: "Losers",
    final: "Final"
}

interface RowState {
    homeSet1: string
    awaySet1: string
    homeSet2: string
    awaySet2: string
    homeSet3: string
    awaySet3: string
}

const EMPTY: RowState = {
    homeSet1: "",
    awaySet1: "",
    homeSet2: "",
    awaySet2: "",
    homeSet3: "",
    awaySet3: ""
}

function initFromMatch(m: ScheduleMatch): RowState {
    const v = (n: number | null) => (n === null ? "" : String(n))
    return {
        homeSet1: v(m.sets.home[0]),
        awaySet1: v(m.sets.away[0]),
        homeSet2: v(m.sets.home[1]),
        awaySet2: v(m.sets.away[1]),
        homeSet3: v(m.sets.home[2]),
        awaySet3: v(m.sets.away[2])
    }
}

function num(s: string): number | null {
    if (s === "") return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
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

function countScored(matches: ScheduleMatch[]): number {
    return matches.filter((m) => m.winnerTeamId !== null).length
}

export function ScoreEntryList({
    view,
    poolSetsCount,
    playoffSetsCount
}: {
    view: TournamentScheduleView
    poolSetsCount: number
    playoffSetsCount: number
}) {
    const router = useRouter()

    const allMatches = useMemo(() => {
        const out: ScheduleMatch[] = []
        for (const d of view.divisions) {
            for (const p of d.pools) out.push(...p.matches)
            for (const g of d.bracketGroups) out.push(...g.matches)
        }
        return out
    }, [view])

    const [state, setState] = useState<Record<number, RowState>>(() => {
        const o: Record<number, RowState> = {}
        for (const m of allMatches) o[m.id] = initFromMatch(m)
        return o
    })
    const [busy, setBusy] = useState<number | null>(null)

    // A refresh can surface newly-playable matches — e.g. a bracket seat filled
    // by progression after a score is saved. Seed their edit state without
    // disturbing scores the user may already be typing elsewhere.
    useEffect(() => {
        setState((prev) => {
            let changed = false
            const next = { ...prev }
            for (const m of allMatches) {
                if (!(m.id in next)) {
                    next[m.id] = initFromMatch(m)
                    changed = true
                }
            }
            return changed ? next : prev
        })
    }, [allMatches])

    // Section open state: null means "auto" — the phase stays open while it has
    // pending matches and collapses once fully scored. Once the user toggles a
    // section, their explicit choice sticks.
    const [poolOpen, setPoolOpen] = useState<boolean | null>(null)
    const [playoffOpen, setPlayoffOpen] = useState<boolean | null>(null)

    const poolMatches = useMemo(
        () => view.divisions.flatMap((d) => d.pools.flatMap((p) => p.matches)),
        [view]
    )
    const bracketMatches = useMemo(
        () =>
            view.divisions.flatMap((d) =>
                d.bracketGroups.flatMap((g) => g.matches)
            ),
        [view]
    )
    const poolPending = poolMatches.some((m) => m.winnerTeamId === null)
    const bracketPending = bracketMatches.some((m) => m.winnerTeamId === null)

    function update(id: number, field: keyof RowState, v: string) {
        setState((prev) => ({
            ...prev,
            [id]: { ...(prev[id] ?? EMPTY), [field]: v }
        }))
    }

    async function save(match: ScheduleMatch) {
        const s = state[match.id] ?? EMPTY
        setBusy(match.id)
        const result = await saveTournamentMatchScore(match.id, {
            homeSet1: num(s.homeSet1),
            awaySet1: num(s.awaySet1),
            homeSet2: num(s.homeSet2),
            awaySet2: num(s.awaySet2),
            homeSet3: num(s.homeSet3),
            awaySet3: num(s.awaySet3)
        })
        setBusy(null)
        if (!result.status) {
            toast.error(result.message)
            return
        }
        toast.success("Score saved.")
        router.refresh()
    }

    const showDivisionLabel = view.divisions.length > 1

    const renderMatch = (match: ScheduleMatch, setsCount: number) => (
        <MatchScoreCard
            key={match.id}
            match={match}
            setsCount={setsCount}
            state={state[match.id] ?? EMPTY}
            busy={busy === match.id}
            onChange={update}
            onSave={() => save(match)}
        />
    )

    return (
        <div className="space-y-4">
            {view.hasPoolMatches && (
                <SectionShell
                    title="Pool Play"
                    scored={countScored(poolMatches)}
                    total={poolMatches.length}
                    open={poolOpen ?? poolPending}
                    onOpenChange={setPoolOpen}
                >
                    <div className="space-y-4">
                        {view.divisions
                            .filter((d) => d.pools.length > 0)
                            .map((div) => (
                                <div key={div.id} className="space-y-3">
                                    {showDivisionLabel && (
                                        <DivisionLabel name={div.name} />
                                    )}
                                    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                                        {div.pools.map((pool) => (
                                            <Card key={pool.id}>
                                                <CardHeader className="pb-3">
                                                    <CardTitle className="flex items-baseline justify-between text-base">
                                                        <span>{pool.name}</span>
                                                        <span className="font-normal text-muted-foreground text-xs">
                                                            {countScored(
                                                                pool.matches
                                                            )}
                                                            /
                                                            {
                                                                pool.matches
                                                                    .length
                                                            }
                                                        </span>
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent className="space-y-3">
                                                    {pool.matches.map((m) =>
                                                        renderMatch(
                                                            m,
                                                            poolSetsCount
                                                        )
                                                    )}
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </div>
                            ))}
                    </div>
                </SectionShell>
            )}

            {view.hasBracketMatches && (
                <SectionShell
                    title="Playoffs"
                    icon={
                        <RiTrophyLine
                            className="text-primary"
                            size={18}
                            aria-hidden="true"
                        />
                    }
                    meta={
                        view.eliminationFormat === "double"
                            ? "Double elimination"
                            : "Single elimination"
                    }
                    scored={countScored(bracketMatches)}
                    total={bracketMatches.length}
                    open={playoffOpen ?? bracketPending}
                    onOpenChange={setPlayoffOpen}
                >
                    <div className="space-y-4">
                        {view.divisions
                            .filter((d) => d.bracketGroups.length > 0)
                            .map((div) => (
                                <div key={div.id} className="space-y-3">
                                    {showDivisionLabel && (
                                        <DivisionLabel name={div.name} />
                                    )}
                                    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                                        {div.bracketGroups.map((group) => (
                                            <div
                                                key={`${group.bracket}-${group.round}`}
                                                className="space-y-2"
                                            >
                                                <div className="text-muted-foreground text-xs uppercase tracking-wide">
                                                    {BRACKET_LABELS[
                                                        group.bracket
                                                    ] ?? group.bracket}{" "}
                                                    · Round {group.round}
                                                </div>
                                                {group.matches.map((m) =>
                                                    renderMatch(
                                                        m,
                                                        playoffSetsCount
                                                    )
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                    </div>
                </SectionShell>
            )}
        </div>
    )
}

function SectionShell({
    title,
    icon,
    meta,
    scored,
    total,
    open,
    onOpenChange,
    children
}: {
    title: string
    icon?: React.ReactNode
    meta?: string
    scored: number
    total: number
    open: boolean
    onOpenChange: (open: boolean) => void
    children: React.ReactNode
}) {
    const complete = total > 0 && scored === total
    return (
        <Collapsible
            open={open}
            onOpenChange={onOpenChange}
            className="rounded-lg border bg-card"
        >
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left hover:bg-muted/50">
                <div className="flex items-center gap-2">
                    {icon}
                    <span className="font-semibold text-lg tracking-tight">
                        {title}
                    </span>
                    {meta && (
                        <span className="text-muted-foreground text-xs">
                            {meta}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <span
                        className={cn(
                            "text-xs",
                            complete
                                ? "text-muted-foreground"
                                : "font-medium text-foreground"
                        )}
                    >
                        {complete
                            ? "All scored"
                            : `${scored} of ${total} scored`}
                    </span>
                    <RiArrowDownSLine
                        className="text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90"
                        size={18}
                        aria-hidden="true"
                    />
                </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t px-4 py-4">
                {children}
            </CollapsibleContent>
        </Collapsible>
    )
}

function DivisionLabel({ name }: { name: string }) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-muted-foreground/70 text-xs uppercase tracking-wider">
                Division
            </span>
            <span className="font-semibold text-sm">{name}</span>
        </div>
    )
}

const HOME_FIELDS: Array<keyof RowState> = ["homeSet1", "homeSet2", "homeSet3"]
const AWAY_FIELDS: Array<keyof RowState> = ["awaySet1", "awaySet2", "awaySet3"]

function MatchScoreCard({
    match,
    setsCount,
    state,
    busy,
    onChange,
    onSave
}: {
    match: ScheduleMatch
    setsCount: number
    state: RowState
    busy: boolean
    onChange: (id: number, field: keyof RowState, v: string) => void
    onSave: () => void
}) {
    const decided = match.winnerTeamId !== null
    const time = formatTime(match.startTime)
    const meta: string[] = []
    if (time) meta.push(time)
    if (match.court !== null) meta.push(`Court ${match.court}`)
    const homeWin = decided && match.winnerTeamId === match.home?.id
    const awayWin = decided && match.winnerTeamId === match.away?.id
    // Runtime set count → inline grid columns (Tailwind can't JIT a dynamic
    // repeat()). One label column plus one narrow column per set.
    const gridStyle = {
        gridTemplateColumns: `1fr repeat(${setsCount}, 2.5rem)`
    }

    return (
        <div
            className={cn(
                "rounded-md border bg-background p-3",
                decided && "border-l-2 border-l-primary"
            )}
        >
            <div className="mb-2 flex items-center justify-between gap-2 text-muted-foreground text-xs">
                <span className="font-medium">
                    {meta.join(" · ") || "Time TBD"}
                </span>
                {match.workTeamName && (
                    <span className="truncate">Work: {match.workTeamName}</span>
                )}
            </div>
            <div className="grid items-center gap-2" style={gridStyle}>
                <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Set
                </span>
                {Array.from({ length: setsCount }, (_, i) => i + 1).map((n) => (
                    <span
                        key={n}
                        className="text-center text-[11px] text-muted-foreground"
                    >
                        {n}
                    </span>
                ))}
            </div>
            <ScoreInputRow
                label={match.home?.name ?? "TBD"}
                isWinner={homeWin}
                decided={decided}
                setsCount={setsCount}
                gridStyle={gridStyle}
                values={[state.homeSet1, state.homeSet2, state.homeSet3]}
                fields={HOME_FIELDS}
                onChange={(field, v) => onChange(match.id, field, v)}
            />
            <ScoreInputRow
                label={match.away?.name ?? "TBD"}
                isWinner={awayWin}
                decided={decided}
                setsCount={setsCount}
                gridStyle={gridStyle}
                values={[state.awaySet1, state.awaySet2, state.awaySet3]}
                fields={AWAY_FIELDS}
                onChange={(field, v) => onChange(match.id, field, v)}
            />
            <div className="mt-2 flex justify-end">
                <Button size="sm" disabled={busy} onClick={onSave}>
                    {busy ? "Saving..." : "Save Score"}
                </Button>
            </div>
        </div>
    )
}

function ScoreInputRow({
    label,
    isWinner,
    decided,
    setsCount,
    gridStyle,
    values,
    fields,
    onChange
}: {
    label: string
    isWinner: boolean
    decided: boolean
    setsCount: number
    gridStyle: React.CSSProperties
    values: string[]
    fields: Array<keyof RowState>
    onChange: (field: keyof RowState, v: string) => void
}) {
    return (
        <div className="grid items-center gap-2 py-1" style={gridStyle}>
            <span
                className={cn(
                    "truncate text-sm",
                    decided && isWinner
                        ? "font-semibold text-foreground"
                        : decided
                          ? "text-muted-foreground"
                          : "font-medium"
                )}
            >
                {label}
            </span>
            {fields.slice(0, setsCount).map((field, i) => (
                <Input
                    key={field}
                    type="number"
                    min={0}
                    value={values[i]}
                    onChange={(e) => onChange(field, e.target.value)}
                    placeholder="—"
                    className="h-8 px-1 text-center"
                />
            ))}
        </div>
    )
}
