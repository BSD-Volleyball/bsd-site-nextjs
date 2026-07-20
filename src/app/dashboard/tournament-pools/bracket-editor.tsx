"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { RiArrowDownSLine, RiCloseLine } from "@remixicon/react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import {
    revertBracketSeeding,
    saveBracketPlacements,
    type BracketEditorView,
    type PlaceableTeam
} from "./actions"

interface Props {
    view: BracketEditorView
}

type SlotState = { home: number | null; away: number | null }
type Assignments = Record<number, SlotState>

function buildAssignments(view: BracketEditorView): Assignments {
    const out: Assignments = {}
    for (const d of view.divisions) {
        for (const g of d.games) {
            out[g.matchId] = { home: g.home, away: g.away }
        }
    }
    return out
}

export function TournamentBracketEditor({ view }: Props) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)
    const initial = useMemo(() => buildAssignments(view), [view])
    const [assignments, setAssignments] = useState<Assignments>(initial)

    const teamById = useMemo(
        () => new Map(view.placeableTeams.map((t) => [t.teamId, t])),
        [view.placeableTeams]
    )

    const locked = view.bracketHasScores
    const dirty = JSON.stringify(assignments) !== JSON.stringify(initial)

    const placedIds = useMemo(() => {
        const s = new Set<number>()
        for (const slot of Object.values(assignments)) {
            if (slot.home !== null) s.add(slot.home)
            if (slot.away !== null) s.add(slot.away)
        }
        return s
    }, [assignments])

    const unplaced = view.placeableTeams.filter((t) => !placedIds.has(t.teamId))

    async function run(
        p: Promise<{ status: boolean; message?: string }>,
        successMsg?: string
    ) {
        setBusy(true)
        const result = await p
        setBusy(false)
        if (!result.status) {
            toast.error(result.message ?? "Failed.")
            return false
        }
        if (successMsg) toast.success(successMsg)
        router.refresh()
        return true
    }

    // Placing a team removes it from any slot it currently occupies (a move);
    // the slot's previous occupant is displaced to the Unplaced tray.
    function placeTeam(matchId: number, side: "home" | "away", teamId: number) {
        setAssignments((prev) => {
            const next: Assignments = {}
            for (const [id, slot] of Object.entries(prev)) {
                next[Number(id)] = {
                    home: slot.home === teamId ? null : slot.home,
                    away: slot.away === teamId ? null : slot.away
                }
            }
            next[matchId] = { ...next[matchId], [side]: teamId }
            return next
        })
    }

    function clearSlot(matchId: number, side: "home" | "away") {
        setAssignments((prev) => ({
            ...prev,
            [matchId]: { ...prev[matchId], [side]: null }
        }))
    }

    async function handleSave() {
        const payload = Object.entries(assignments).map(([matchId, slot]) => ({
            matchId: Number(matchId),
            home: slot.home,
            away: slot.away
        }))
        await run(saveBracketPlacements(payload), "Placements saved.")
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-muted-foreground text-sm">
                    {view.eliminationFormat === "double"
                        ? "Double elimination"
                        : "Single elimination"}
                    {dirty && (
                        <span className="ml-2 font-medium text-amber-600 dark:text-amber-400">
                            Unsaved changes
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={handleSave}
                        disabled={busy || locked || !dirty}
                    >
                        {busy ? "Saving..." : "Save Changes"}
                    </Button>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline" disabled={busy}>
                                Revert to seeded
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    Revert to seeded placements?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    This deletes the current playoff games
                                    (including any manual moves and, if present,
                                    entered scores) and rebuilds every
                                    division's bracket from the final pool
                                    standings. Teams moved across divisions
                                    return to their pool's division. This cannot
                                    be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() =>
                                        run(
                                            revertBracketSeeding(),
                                            "Bracket reset to seeded placements."
                                        )
                                    }
                                >
                                    Revert
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>

            {locked && (
                <Card className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950">
                    <CardContent className="py-4 text-sm">
                        Bracket games are already in progress, so placements are
                        locked to avoid corrupting results. Use{" "}
                        <span className="font-medium">Revert to seeded</span> if
                        you need to rebuild the bracket from pool standings.
                    </CardContent>
                </Card>
            )}

            <Card className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950">
                <CardHeader>
                    <CardTitle className="text-base">
                        Unplaced teams ({unplaced.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {unplaced.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            Every team is placed in a game.
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {unplaced.map((t) => (
                                <span
                                    key={t.teamId}
                                    className="rounded-md border bg-background px-2 py-1 text-sm"
                                >
                                    {t.name}{" "}
                                    <span className="text-muted-foreground">
                                        ({t.annotation})
                                    </span>
                                </span>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {view.divisions.map((d) => (
                <Card key={d.divisionId}>
                    <CardHeader>
                        <CardTitle>{d.divisionName}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {d.games.length === 0 ? (
                            <p className="text-muted-foreground text-sm">
                                No bracket games — fewer than two teams advanced
                                in this division.
                            </p>
                        ) : (
                            d.games.map((g, idx) => {
                                const slot = assignments[g.matchId]
                                return (
                                    <div
                                        key={g.matchId}
                                        className="rounded-md border p-3"
                                    >
                                        <p className="mb-2 font-medium text-sm">
                                            Game {idx + 1}
                                        </p>
                                        <div className="space-y-2">
                                            <SlotPicker
                                                teams={view.placeableTeams}
                                                teamById={teamById}
                                                placedIds={placedIds}
                                                value={slot?.home ?? null}
                                                disabled={busy || locked}
                                                onSelect={(teamId) =>
                                                    placeTeam(
                                                        g.matchId,
                                                        "home",
                                                        teamId
                                                    )
                                                }
                                                onClear={() =>
                                                    clearSlot(g.matchId, "home")
                                                }
                                            />
                                            <p className="text-center text-muted-foreground text-xs">
                                                vs
                                            </p>
                                            <SlotPicker
                                                teams={view.placeableTeams}
                                                teamById={teamById}
                                                placedIds={placedIds}
                                                value={slot?.away ?? null}
                                                disabled={busy || locked}
                                                onSelect={(teamId) =>
                                                    placeTeam(
                                                        g.matchId,
                                                        "away",
                                                        teamId
                                                    )
                                                }
                                                onClear={() =>
                                                    clearSlot(g.matchId, "away")
                                                }
                                            />
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

interface SlotPickerProps {
    teams: PlaceableTeam[]
    teamById: Map<number, PlaceableTeam>
    placedIds: Set<number>
    value: number | null
    disabled?: boolean
    onSelect: (teamId: number) => void
    onClear: () => void
}

function SlotPicker({
    teams,
    teamById,
    placedIds,
    value,
    disabled,
    onSelect,
    onClear
}: SlotPickerProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")

    const selected = value !== null ? teamById.get(value) : undefined

    const filtered = useMemo(() => {
        const lower = search.toLowerCase()
        return teams.filter(
            (t) =>
                !lower ||
                t.name.toLowerCase().includes(lower) ||
                t.annotation.toLowerCase().includes(lower)
        )
    }, [teams, search])

    const advanced = filtered.filter((t) => t.advanced)
    const others = filtered.filter((t) => !t.advanced)

    function choose(teamId: number) {
        onSelect(teamId)
        setOpen(false)
        setSearch("")
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className="w-full justify-between font-normal"
                >
                    <span
                        className={cn(
                            "truncate",
                            !selected && "text-muted-foreground"
                        )}
                    >
                        {selected ? (
                            <>
                                {selected.name}{" "}
                                <span className="text-muted-foreground">
                                    ({selected.annotation})
                                </span>
                            </>
                        ) : (
                            "Empty — pick a team"
                        )}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                        {selected && (
                            <span
                                role="button"
                                tabIndex={0}
                                className="rounded-sm p-0.5 hover:bg-accent"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onClear()
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.stopPropagation()
                                        onClear()
                                    }
                                }}
                            >
                                <RiCloseLine className="h-4 w-4 text-muted-foreground" />
                            </span>
                        )}
                        <RiArrowDownSLine className="h-4 w-4 text-muted-foreground" />
                    </div>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-(--radix-popover-trigger-width) p-2"
                align="start"
            >
                <Input
                    placeholder="Search teams..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoCorrect="off"
                    className="mb-2 h-8 text-sm"
                />
                <div className="max-h-72 overflow-y-auto">
                    {filtered.length === 0 && (
                        <p className="py-2 text-center text-muted-foreground text-sm">
                            No teams found
                        </p>
                    )}
                    {advanced.length > 0 && (
                        <TeamGroup
                            label="Advanced"
                            teams={advanced}
                            value={value}
                            placedIds={placedIds}
                            onChoose={choose}
                        />
                    )}
                    {others.length > 0 && (
                        <TeamGroup
                            label="Did not advance"
                            teams={others}
                            value={value}
                            placedIds={placedIds}
                            onChoose={choose}
                        />
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}

interface TeamGroupProps {
    label: string
    teams: PlaceableTeam[]
    value: number | null
    placedIds: Set<number>
    onChoose: (teamId: number) => void
}

function TeamGroup({
    label,
    teams,
    value,
    placedIds,
    onChoose
}: TeamGroupProps) {
    return (
        <div className="mb-1">
            <p className="px-2 py-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                {label}
            </p>
            {teams.map((t) => (
                <button
                    key={t.teamId}
                    type="button"
                    className={cn(
                        "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                        value === t.teamId && "bg-accent"
                    )}
                    onClick={() => onChoose(t.teamId)}
                >
                    <span>
                        {t.name}{" "}
                        <span className="text-muted-foreground">
                            ({t.annotation})
                        </span>
                    </span>
                    {placedIds.has(t.teamId) && value !== t.teamId && (
                        <span className="ml-2 shrink-0 text-muted-foreground text-xs">
                            placed — will move
                        </span>
                    )}
                </button>
            ))}
        </div>
    )
}
