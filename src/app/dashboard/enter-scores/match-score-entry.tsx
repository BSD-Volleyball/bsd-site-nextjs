"use client"

import { formatMatchTime } from "@/lib/season-utils"
import type { MatchScoreData } from "./actions"
import type { MatchFormState } from "./match-form-state"
import type { ResolvedMatchInfo } from "./match-resolution"
import { ScoreInputRow } from "./score-input-row"

export function MatchScoreEntry({
    match,
    form,
    warnings,
    resolved,
    onFieldChange,
    onSelectWinner
}: {
    match: MatchScoreData
    form: MatchFormState
    warnings: string[]
    resolved: ResolvedMatchInfo
    onFieldChange: (field: keyof MatchFormState, value: string) => void
    onSelectWinner: (teamId: number | null) => void
}) {
    const isPlayoff = match.playoff
    const hasWarnings = warnings.length > 0
    const isLocked = resolved.isLocked
    const homeButtonLabel = resolved.homeIsResolved
        ? resolved.homeTeamName
        : (resolved.homeLockLabel ?? "TBD")
    const awayButtonLabel = resolved.awayIsResolved
        ? resolved.awayTeamName
        : (resolved.awayLockLabel ?? "TBD")
    const lockReason = (() => {
        if (!isLocked) return null
        const parts: string[] = []
        if (!resolved.homeIsResolved && resolved.homeLockLabel) {
            parts.push(resolved.homeLockLabel)
        }
        if (!resolved.awayIsResolved && resolved.awayLockLabel) {
            parts.push(resolved.awayLockLabel)
        }
        if (parts.length === 0) return "awaiting earlier match result"
        return `awaiting ${parts.join(" & ")}`
    })()

    return (
        <div
            className={`rounded-md border p-3 ${hasWarnings ? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30" : ""} ${isLocked ? "bg-muted/30" : ""}`}
        >
            {/* Playoff badge */}
            {isPlayoff && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-700 text-xs dark:bg-purple-900 dark:text-purple-300">
                        Playoff
                    </span>
                    {isLocked && lockReason && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-slate-700 text-xs dark:bg-slate-700 dark:text-slate-200">
                            🔒 Locked — {lockReason}
                        </span>
                    )}
                </div>
            )}

            {/* Time and court */}
            {(match.time || match.court !== null) && (
                <div className="mb-2 flex items-center gap-3 text-muted-foreground text-sm">
                    {match.time && <span>{formatMatchTime(match.time)}</span>}
                    {match.court !== null && <span>Court {match.court}</span>}
                </div>
            )}

            {/* Score table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr>
                            {/* Row label column */}
                            <th className="w-44 pb-2 text-left font-normal text-muted-foreground">
                                Overall Winner: (select)
                            </th>
                            <th className="w-24 pb-2 text-center">
                                <button
                                    type="button"
                                    disabled={
                                        isLocked || !resolved.homeIsResolved
                                    }
                                    className={`w-full rounded-md px-2 py-1 font-semibold transition-colors ${
                                        !resolved.homeIsResolved
                                            ? "cursor-not-allowed bg-muted text-muted-foreground italic"
                                            : form.winner ===
                                                resolved.homeTeamId
                                              ? "bg-green-600 text-white"
                                              : form.winner === null
                                                ? "bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:hover:bg-yellow-900/60"
                                                : "bg-muted hover:bg-muted/80"
                                    }`}
                                    onClick={() =>
                                        onSelectWinner(resolved.homeTeamId)
                                    }
                                    title={
                                        isLocked
                                            ? "Match is locked until earlier results are entered"
                                            : "Click to select as winner"
                                    }
                                >
                                    {homeButtonLabel}
                                </button>
                            </th>
                            <th className="w-4 pb-2 text-center font-normal text-muted-foreground text-sm">
                                vs
                            </th>
                            <th className="w-24 pb-2 text-center">
                                <button
                                    type="button"
                                    disabled={
                                        isLocked || !resolved.awayIsResolved
                                    }
                                    className={`w-full rounded-md px-2 py-1 font-semibold transition-colors ${
                                        !resolved.awayIsResolved
                                            ? "cursor-not-allowed bg-muted text-muted-foreground italic"
                                            : form.winner ===
                                                resolved.awayTeamId
                                              ? "bg-green-600 text-white"
                                              : form.winner === null
                                                ? "bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:hover:bg-yellow-900/60"
                                                : "bg-muted hover:bg-muted/80"
                                    }`}
                                    onClick={() =>
                                        onSelectWinner(resolved.awayTeamId)
                                    }
                                    title={
                                        isLocked
                                            ? "Match is locked until earlier results are entered"
                                            : "Click to select as winner"
                                    }
                                >
                                    {awayButtonLabel}
                                </button>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {/* Game score rows */}
                        <ScoreInputRow
                            label="Game 1 Score"
                            homeValue={form.homeSet1Score}
                            awayValue={form.awaySet1Score}
                            onHomeChange={(v) =>
                                onFieldChange("homeSet1Score", v)
                            }
                            onAwayChange={(v) =>
                                onFieldChange("awaySet1Score", v)
                            }
                            disabled={isLocked}
                        />
                        <ScoreInputRow
                            label="Game 2 Score"
                            homeValue={form.homeSet2Score}
                            awayValue={form.awaySet2Score}
                            onHomeChange={(v) =>
                                onFieldChange("homeSet2Score", v)
                            }
                            onAwayChange={(v) =>
                                onFieldChange("awaySet2Score", v)
                            }
                            disabled={isLocked}
                        />
                        <ScoreInputRow
                            label={
                                isPlayoff
                                    ? "Game 3 Score (if needed)"
                                    : "Game 3 Score"
                            }
                            homeValue={form.homeSet3Score}
                            awayValue={form.awaySet3Score}
                            onHomeChange={(v) =>
                                onFieldChange("homeSet3Score", v)
                            }
                            onAwayChange={(v) =>
                                onFieldChange("awaySet3Score", v)
                            }
                            optional={isPlayoff}
                            disabled={isLocked}
                        />

                        {/* Total games won — separated */}
                        <ScoreInputRow
                            label="Total Games Won"
                            homeValue={form.homeScore}
                            awayValue={form.awayScore}
                            onHomeChange={(v) => onFieldChange("homeScore", v)}
                            onAwayChange={(v) => onFieldChange("awayScore", v)}
                            bold
                            topBorder
                            disabled={isLocked}
                        />
                    </tbody>
                </table>
            </div>

            {/* Validation Warnings */}
            {hasWarnings && (
                <div className="mt-3 space-y-1">
                    {warnings.map((msg) => (
                        <p
                            key={msg}
                            className="text-amber-700 text-sm dark:text-amber-400"
                        >
                            ⚠ {msg}
                        </p>
                    ))}
                </div>
            )}
        </div>
    )
}
