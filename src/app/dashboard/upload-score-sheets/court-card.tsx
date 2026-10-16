"use client"

import {
    RiAlertFill,
    RiCheckboxCircleFill,
    RiEditLine,
    RiRefreshLine
} from "@remixicon/react"
import { useMemo } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { formatEnteredTime } from "@/lib/scores/entered-by"
import type { CourtState, CourtSummary } from "@/lib/scoresheets/court-status"
import { formatMatchTime } from "@/lib/season-utils"
import { cn } from "@/lib/utils"

import type {
    DivisionMatchGroup,
    MatchScoreData
} from "../enter-scores/actions"
import type { SheetInboxRow } from "./actions"
import {
    courtForms,
    draftGames,
    GAME_FIELDS,
    type GameScores,
    savedGames
} from "./court-forms"
import { ScanningPhoto } from "./processing-card"

export interface CourtMatch {
    match: MatchScoreData
    divisionName: string
}

export const STATE_LABEL: Record<CourtState, string> = {
    saved: "Saved",
    ready: "Ready to save",
    needs_review: "Needs a look",
    reading: "Reading…",
    failed: "Couldn't read",
    no_photo: "No photo yet"
}

export const STATE_TONE: Record<CourtState, string> = {
    saved: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100",
    ready: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
    needs_review:
        "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
    reading: "bg-primary/15 text-primary",
    failed: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
    no_photo: "bg-muted text-muted-foreground"
}

/**
 * The games the card shows: the photo's reading until the court is saved,
 * then what was saved. A match the photo had nothing for keeps its saved
 * result either way.
 */
export function displayedGames(
    summary: CourtSummary,
    courtMatches: CourtMatch[]
): Record<number, GameScores> {
    const fromPhoto =
        summary.state === "ready" || summary.state === "needs_review"
    const games: Record<number, GameScores> = {}
    for (const { match } of courtMatches) {
        const draft = summary.drafts[match.matchId]
        games[match.matchId] =
            fromPhoto && draft && !draft.empty
                ? draftGames(draft)
                : savedGames(match)
    }
    return games
}

function personLine(courtMatches: CourtMatch[]): string | null {
    const entries = courtMatches
        .map(({ match }) => ({
            by: match.scoresEnteredBy,
            at: match.scoresEnteredAt
        }))
        .filter((e): e is { by: string; at: string | null } => e.by !== null)
    if (entries.length === 0) return null
    const names = Array.from(new Set(entries.map((e) => e.by)))
    const latest = entries
        .map((e) => e.at)
        .filter((at): at is string => at !== null)
        .sort()
        .at(-1)
    const time = formatEnteredTime(latest ?? null)
    return `Saved by ${names.join(", ")}${time ? ` · ${time}` : ""}`
}

export function CourtCard({
    summary,
    courtMatches,
    divisions,
    row,
    picBaseUrl,
    busy,
    highlight,
    onQuickSave,
    onEdit,
    onViewPhoto,
    onRetry
}: {
    summary: CourtSummary
    courtMatches: CourtMatch[]
    divisions: DivisionMatchGroup[]
    row: SheetInboxRow | null
    picBaseUrl: string
    busy: boolean
    highlight: boolean
    onQuickSave: () => void
    onEdit: () => void
    onViewPhoto: (url: string) => void
    onRetry: () => void
}) {
    const games = useMemo(
        () => displayedGames(summary, courtMatches),
        [summary, courtMatches]
    )
    const { forms, resolved } = useMemo(
        () => courtForms(divisions, games),
        [divisions, games]
    )
    const photoUrl = row ? `${picBaseUrl}/${row.imagePath}` : null
    const savedLine = personLine(courtMatches)
    const fromPhoto =
        summary.state === "ready" || summary.state === "needs_review"
    const problems = row?.problems ?? []

    return (
        <Card
            id={`court-${summary.court}`}
            className={cn(
                "scroll-mt-4 gap-0 py-0 transition-shadow",
                highlight && "ring-2 ring-primary"
            )}
        >
            <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="font-semibold text-lg">
                        Court {summary.court}
                    </h2>
                    <Badge className={STATE_TONE[summary.state]}>
                        {summary.state === "saved" && (
                            <RiCheckboxCircleFill className="mr-1 h-3.5 w-3.5" />
                        )}
                        {summary.state === "needs_review" && (
                            <RiAlertFill className="mr-1 h-3.5 w-3.5" />
                        )}
                        {STATE_LABEL[summary.state]}
                    </Badge>
                </div>

                <div className="flex gap-3">
                    {photoUrl &&
                        (summary.state === "reading" ? (
                            <ScanningPhoto
                                src={photoUrl}
                                alt={`Court ${summary.court} score sheet`}
                                className="h-28 w-20 shrink-0"
                            />
                        ) : (
                            <button
                                type="button"
                                onClick={() => onViewPhoto(photoUrl)}
                                className="shrink-0"
                                aria-label={`View court ${summary.court} photo`}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={photoUrl}
                                    alt={`Court ${summary.court} score sheet`}
                                    className="h-28 w-20 rounded-md border object-cover"
                                />
                            </button>
                        ))}

                    <div className="min-w-0 flex-1 space-y-3">
                        {courtMatches.map(({ match, divisionName }) => {
                            const draft = summary.drafts[match.matchId]
                            const info = resolved.get(match.matchId)
                            const form = forms[match.matchId]
                            return (
                                <MatchLine
                                    key={match.matchId}
                                    time={formatMatchTime(match.time)}
                                    divisionName={divisionName}
                                    games={games[match.matchId]}
                                    flagged={
                                        new Set(
                                            fromPhoto
                                                ? (draft?.flags.map(
                                                      (f) => f.field
                                                  ) ?? [])
                                                : []
                                        )
                                    }
                                    notPlayed={
                                        fromPhoto &&
                                        !!draft?.empty &&
                                        !form?.homeScore
                                    }
                                    home={{
                                        name:
                                            info?.homeTeamName ??
                                            match.homeTeamName,
                                        won:
                                            form?.winner != null &&
                                            form.winner === info?.homeTeamId,
                                        total: form?.homeScore ?? ""
                                    }}
                                    away={{
                                        name:
                                            info?.awayTeamName ??
                                            match.awayTeamName,
                                        won:
                                            form?.winner != null &&
                                            form.winner === info?.awayTeamId,
                                        total: form?.awayScore ?? ""
                                    }}
                                />
                            )
                        })}
                    </div>
                </div>

                {summary.differsFromSaved && (
                    <p className="rounded-md bg-amber-50 p-2 text-amber-900 text-sm dark:bg-amber-950/40 dark:text-amber-100">
                        This photo reads differently from the scores already
                        saved. Saving replaces them.
                    </p>
                )}
                {summary.state === "needs_review" && problems.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground text-xs">
                        {problems.slice(0, 3).map((problem) => (
                            <li key={problem}>{problem}</li>
                        ))}
                    </ul>
                )}
                {summary.state === "failed" && (
                    <p className="text-muted-foreground text-sm">
                        {problems[0] ??
                            "The readers could not make this photo out."}{" "}
                        Retake it, or type the scores in.
                    </p>
                )}

                {(row || savedLine) && (
                    <p className="text-muted-foreground text-xs">
                        {row &&
                            `Photo by ${row.uploadedBy} · ${formatEnteredTime(row.uploadedAt) ?? ""}`}
                        {row && savedLine && <br />}
                        {savedLine}
                    </p>
                )}

                <CourtActions
                    state={summary.state}
                    busy={busy}
                    canRetry={!!row && row.attempts < 3}
                    onQuickSave={onQuickSave}
                    onEdit={onEdit}
                    onRetry={onRetry}
                />
            </CardContent>
        </Card>
    )
}

interface SideLine {
    name: string
    won: boolean
    total: string
}

/** One match as a tiny scoreboard: a row per team, a column per game. */
function MatchLine({
    time,
    divisionName,
    games,
    flagged,
    notPlayed,
    home,
    away
}: {
    time: string
    divisionName: string
    games: GameScores
    flagged: Set<string>
    notPlayed: boolean
    home: SideLine
    away: SideLine
}) {
    // Always show games 1 and 2; game 3 only when it has something in it.
    const shown = GAME_FIELDS.filter(
        ([h, a], i) =>
            i < 2 || games[h] !== "" || games[a] !== "" || flagged.has(h)
    )
    const rows = [
        { key: "home", side: home, fields: shown.map(([h]) => h) },
        { key: "away", side: away, fields: shown.map(([, a]) => a) }
    ]
    return (
        <div className="text-sm">
            <p className="mb-1 truncate text-muted-foreground text-xs">
                {time}
                {divisionName && ` · ${divisionName}`}
            </p>
            {notPlayed ? (
                <p className="text-muted-foreground italic">
                    Not played, per the sheet
                </p>
            ) : (
                <table className="w-full table-fixed">
                    <tbody>
                        {rows.map(({ key, side, fields }) => (
                            <tr key={key}>
                                <td
                                    className={cn(
                                        "truncate py-0.5 pr-2",
                                        side.won && "font-semibold"
                                    )}
                                >
                                    {side.won && (
                                        <span className="mr-1 text-green-600">
                                            ✓
                                        </span>
                                    )}
                                    {side.name}
                                </td>
                                {fields.map((field) => (
                                    <td
                                        key={field}
                                        className="w-8 py-0.5 text-center tabular-nums"
                                    >
                                        <span
                                            className={cn(
                                                "inline-block min-w-6 rounded px-0.5",
                                                flagged.has(field) &&
                                                    "bg-amber-200 font-semibold text-amber-950 dark:bg-amber-800 dark:text-amber-50"
                                            )}
                                        >
                                            {games[field] ||
                                                (flagged.has(field)
                                                    ? "?"
                                                    : "–")}
                                        </span>
                                    </td>
                                ))}
                                <td className="w-7 py-0.5 text-right font-bold tabular-nums">
                                    {side.total}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    )
}

function CourtActions({
    state,
    busy,
    canRetry,
    onQuickSave,
    onEdit,
    onRetry
}: {
    state: CourtState
    busy: boolean
    canRetry: boolean
    onQuickSave: () => void
    onEdit: () => void
    onRetry: () => void
}) {
    if (state === "reading") return null
    const wide = "h-12 flex-1 text-base"
    return (
        <div className="flex gap-2">
            {state === "ready" && (
                <>
                    <Button
                        className={wide}
                        disabled={busy}
                        onClick={onQuickSave}
                    >
                        <RiCheckboxCircleFill className="mr-1.5 h-5 w-5" />
                        {busy ? "Saving…" : "Looks right — Save"}
                    </Button>
                    <Button
                        variant="outline"
                        className="h-12"
                        disabled={busy}
                        onClick={onEdit}
                        aria-label="Edit scores"
                    >
                        <RiEditLine className="h-5 w-5" />
                    </Button>
                </>
            )}
            {state === "needs_review" && (
                <Button className={wide} disabled={busy} onClick={onEdit}>
                    <RiEditLine className="mr-1.5 h-5 w-5" />
                    Fix scores
                </Button>
            )}
            {state === "saved" && (
                <Button
                    variant="outline"
                    className={wide}
                    disabled={busy}
                    onClick={onEdit}
                >
                    <RiEditLine className="mr-1.5 h-5 w-5" />
                    Edit
                </Button>
            )}
            {(state === "no_photo" || state === "failed") && (
                <Button
                    variant="outline"
                    className={wide}
                    disabled={busy}
                    onClick={onEdit}
                >
                    <RiEditLine className="mr-1.5 h-5 w-5" />
                    Enter by hand
                </Button>
            )}
            {state === "failed" && canRetry && (
                <Button
                    variant="outline"
                    className="h-12"
                    disabled={busy}
                    onClick={onRetry}
                    aria-label="Read again"
                >
                    <RiRefreshLine className="h-5 w-5" />
                </Button>
            )}
        </div>
    )
}
