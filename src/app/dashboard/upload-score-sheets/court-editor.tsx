"use client"

import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle
} from "@/components/ui/sheet"
import {
    type CourtSummary,
    gameCandidates
} from "@/lib/scoresheets/court-status"
import type { ScoreDraft } from "@/lib/scoresheets/read/draft"
import type { SheetRead } from "@/lib/scoresheets/read/read"
import { formatMatchTime } from "@/lib/season-utils"
import { cn } from "@/lib/utils"

import type { DivisionMatchGroup } from "../enter-scores/actions"
import type { CourtMatch } from "./court-card"
import { displayedGames } from "./court-card"
import {
    courtForms,
    courtMatchProblems,
    EMPTY_GAMES,
    GAME_FIELDS,
    type GameField,
    type GameScores
} from "./court-forms"

export type SaveCourt = (
    games: Record<number, GameScores>
) => Promise<{ ok: boolean; problems?: Record<number, string[]> }>

/**
 * A bottom sheet over the court card: the photo at the top to read from, then
 * each match's three games as big number boxes. Games won and the winner are
 * worked out from the games, so a correction is only ever typing what the
 * sheet says.
 */
export function CourtEditor({
    summary,
    courtMatches,
    divisions,
    read,
    photoUrl,
    onClose,
    onSave
}: {
    summary: CourtSummary
    courtMatches: CourtMatch[]
    divisions: DivisionMatchGroup[]
    read: SheetRead | null
    photoUrl: string | null
    onClose: () => void
    onSave: SaveCourt
}) {
    const [games, setGames] = useState<Record<number, GameScores>>(() =>
        displayedGames(summary, courtMatches)
    )
    const [photoOpen, setPhotoOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [serverProblems, setServerProblems] = useState<
        Record<number, string[]>
    >({})
    const { forms, resolved } = useMemo(
        () => courtForms(divisions, games),
        [divisions, games]
    )
    const fromPhoto =
        summary.state === "ready" || summary.state === "needs_review"

    const firstFlagged = (() => {
        if (!fromPhoto) return null
        for (const { match } of courtMatches) {
            const flag = summary.drafts[match.matchId]?.flags.find((f) =>
                f.field.includes("Set")
            )
            if (flag) return `${match.matchId}:${flag.field}`
        }
        return null
    })()

    const setGame = (matchId: number, field: GameField, value: string) => {
        setServerProblems({})
        setGames((current) => ({
            ...current,
            [matchId]: {
                ...(current[matchId] ?? EMPTY_GAMES),
                [field]: value.replace(/\D/g, "").slice(0, 2)
            }
        }))
    }

    const problemsFor = (matchId: number) =>
        serverProblems[matchId] ??
        courtMatchProblems(
            forms[matchId],
            resolved.get(matchId),
            games[matchId] ?? EMPTY_GAMES
        )
    const blocked = courtMatches.some(
        ({ match }) => problemsFor(match.matchId).length > 0
    )

    const save = async () => {
        setSaving(true)
        try {
            const result = await onSave(games)
            if (result.ok) onClose()
            else if (result.problems) setServerProblems(result.problems)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Sheet open onOpenChange={(open) => !open && onClose()}>
            <SheetContent
                side="bottom"
                className="flex max-h-[92dvh] flex-col gap-0 rounded-t-xl p-0 sm:mx-auto sm:max-w-xl"
            >
                <SheetHeader className="border-b px-4 py-3 text-left">
                    <SheetTitle>Court {summary.court} scores</SheetTitle>
                    <SheetDescription>
                        Type each game as written on the sheet. Games won and
                        the winner fill in themselves.
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
                    {photoUrl && (
                        <button
                            type="button"
                            onClick={() => setPhotoOpen((v) => !v)}
                            className="block w-full overflow-hidden rounded-md border"
                            aria-label={
                                photoOpen ? "Shrink photo" : "Enlarge photo"
                            }
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={photoUrl}
                                alt={`Court ${summary.court} score sheet`}
                                className={cn(
                                    "w-full object-cover object-top transition-[max-height]",
                                    photoOpen ? "max-h-none" : "max-h-44"
                                )}
                            />
                            <span className="block bg-muted py-1 text-center text-muted-foreground text-xs">
                                {photoOpen
                                    ? "Tap to shrink"
                                    : "Tap to see the whole sheet"}
                            </span>
                        </button>
                    )}

                    {courtMatches.map(({ match, divisionName }) => (
                        <MatchEditor
                            key={match.matchId}
                            matchId={match.matchId}
                            heading={`${formatMatchTime(match.time)}${divisionName ? ` · ${divisionName}` : ""}`}
                            homeName={
                                resolved.get(match.matchId)?.homeTeamName ??
                                match.homeTeamName
                            }
                            awayName={
                                resolved.get(match.matchId)?.awayTeamName ??
                                match.awayTeamName
                            }
                            games={games[match.matchId] ?? EMPTY_GAMES}
                            winnerSide={
                                forms[match.matchId]?.winner == null
                                    ? null
                                    : forms[match.matchId].winner ===
                                        resolved.get(match.matchId)?.homeTeamId
                                      ? "home"
                                      : "away"
                            }
                            totals={[
                                forms[match.matchId]?.homeScore ?? "",
                                forms[match.matchId]?.awayScore ?? ""
                            ]}
                            draft={
                                fromPhoto
                                    ? summary.drafts[match.matchId]
                                    : undefined
                            }
                            read={fromPhoto ? read : null}
                            locked={!!resolved.get(match.matchId)?.isLocked}
                            problems={problemsFor(match.matchId)}
                            autoFocusField={
                                firstFlagged?.startsWith(`${match.matchId}:`)
                                    ? (firstFlagged.split(":")[1] as GameField)
                                    : null
                            }
                            onChange={(field, value) =>
                                setGame(match.matchId, field, value)
                            }
                            onPick={(gameIndex, home, away) => {
                                const [h, a] = GAME_FIELDS[gameIndex]
                                setGame(match.matchId, h, String(home))
                                setGame(match.matchId, a, String(away))
                            }}
                            onClear={() =>
                                setGames((current) => ({
                                    ...current,
                                    [match.matchId]: EMPTY_GAMES
                                }))
                            }
                        />
                    ))}
                </div>

                <div className="flex gap-2 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <Button
                        variant="outline"
                        className="h-12"
                        onClick={onClose}
                        disabled={saving}
                    >
                        Cancel
                    </Button>
                    <Button
                        className="h-12 flex-1 text-base"
                        onClick={() => void save()}
                        disabled={saving || blocked}
                    >
                        {saving ? "Saving…" : `Save court ${summary.court}`}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}

function MatchEditor({
    matchId,
    heading,
    homeName,
    awayName,
    games,
    winnerSide,
    totals,
    draft,
    read,
    locked,
    problems,
    autoFocusField,
    onChange,
    onPick,
    onClear
}: {
    matchId: number
    heading: string
    homeName: string
    awayName: string
    games: GameScores
    winnerSide: "home" | "away" | null
    totals: [string, string]
    draft: ScoreDraft | undefined
    read: SheetRead | null
    locked: boolean
    problems: string[]
    autoFocusField: GameField | null
    onChange: (field: GameField, value: string) => void
    onPick: (gameIndex: number, home: number, away: number) => void
    onClear: () => void
}) {
    const hasAny = Object.values(games).some((v) => v !== "")
    const winnerName =
        winnerSide === "home"
            ? homeName
            : winnerSide === "away"
              ? awayName
              : null

    return (
        <section className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
                <p className="truncate text-muted-foreground text-xs">
                    {heading}
                </p>
                {hasAny && !locked && (
                    <button
                        type="button"
                        className="shrink-0 text-muted-foreground text-xs underline"
                        onClick={onClear}
                    >
                        Not played
                    </button>
                )}
            </div>

            <div className="grid grid-cols-[2.5rem_1fr_1fr] items-end gap-x-2 gap-y-2">
                <span />
                <span className="truncate text-center font-medium text-sm">
                    {homeName}
                </span>
                <span className="truncate text-center font-medium text-sm">
                    {awayName}
                </span>

                {GAME_FIELDS.map(([homeField, awayField], index) => {
                    const flag = draft?.flags.find((f) => f.field === homeField)
                    const candidates =
                        flag && read ? gameCandidates(read, matchId, index) : []
                    return (
                        <GameRow
                            key={homeField}
                            label={`G${index + 1}`}
                            homeValue={games[homeField]}
                            awayValue={games[awayField]}
                            flagNote={flag?.note ?? null}
                            candidates={candidates}
                            disabled={locked}
                            autoFocus={autoFocusField === homeField}
                            onHome={(v) => onChange(homeField, v)}
                            onAway={(v) => onChange(awayField, v)}
                            onPick={(home, away) => onPick(index, home, away)}
                        />
                    )
                })}
            </div>

            <div className="mt-3 flex items-center justify-between border-t pt-2 text-sm">
                <span className="text-muted-foreground">Games won</span>
                <span className="font-semibold tabular-nums">
                    {totals[0] || "–"} – {totals[1] || "–"}
                </span>
            </div>
            {winnerName && problems.length === 0 && (
                <p className="mt-1 text-right font-medium text-green-700 text-sm dark:text-green-400">
                    ✓ {winnerName} won
                </p>
            )}
            {problems.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                    {problems.map((problem) => (
                        <li
                            key={problem}
                            className="text-amber-700 text-sm dark:text-amber-400"
                        >
                            ⚠ {problem}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}

function GameRow({
    label,
    homeValue,
    awayValue,
    flagNote,
    candidates,
    disabled,
    autoFocus,
    onHome,
    onAway,
    onPick
}: {
    label: string
    homeValue: string
    awayValue: string
    flagNote: string | null
    candidates: { home: number; away: number; models: string[] }[]
    disabled: boolean
    autoFocus: boolean
    onHome: (value: string) => void
    onAway: (value: string) => void
    onPick: (home: number, away: number) => void
}) {
    const input = (
        value: string,
        onValue: (v: string) => void,
        side: string,
        focus: boolean
    ) => (
        <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            enterKeyHint="next"
            disabled={disabled}
            // biome-ignore lint/a11y/noAutofocus: opening "Fix scores" lands on the value that needs fixing
            autoFocus={focus}
            aria-label={`${label} ${side}`}
            value={value}
            onChange={(e) => onValue(e.target.value)}
            onFocus={(e) => e.target.select()}
            className={cn(
                "h-12 w-full rounded-md border bg-background text-center font-semibold text-xl tabular-nums",
                flagNote &&
                    "border-amber-500 bg-amber-50 ring-2 ring-amber-400/60 dark:bg-amber-950/40",
                disabled && "cursor-not-allowed bg-muted text-muted-foreground"
            )}
        />
    )

    return (
        <>
            <span className="pb-3 font-medium text-muted-foreground text-sm">
                {label}
            </span>
            {input(homeValue, onHome, "home", autoFocus)}
            {input(awayValue, onAway, "away", false)}
            {flagNote && (
                <div className="col-span-3 -mt-1 space-y-1.5">
                    <p className="text-amber-800 text-xs dark:text-amber-300">
                        {flagNote}
                    </p>
                    {candidates.length > 1 && (
                        <div className="flex flex-wrap gap-2">
                            {candidates.map((c) => (
                                <button
                                    key={`${c.home}-${c.away}`}
                                    type="button"
                                    onClick={() => onPick(c.home, c.away)}
                                    className="rounded-full border border-amber-400 bg-amber-50 px-3 py-1.5 font-medium text-sm tabular-nums active:bg-amber-100 dark:bg-amber-950/40"
                                >
                                    Use {c.home}–{c.away}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </>
    )
}
