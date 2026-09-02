"use client"

import type { PairDifferential, PrepareForDraftData } from "./actions"
import { clampRound } from "./draft-round-utils"

function PairDifferentialRow({
    pair,
    setValue,
    onSetValue,
    onOpenDetail
}: {
    pair: PairDifferential
    setValue?: number
    onSetValue?: (v: number) => void
    onOpenDetail: (userId: string) => void
}) {
    const p2Unrated = pair.player2Round === 9
    // The pinned player is player2 normally, or player1 when captainIsLower
    const pinnedUnrated = pair.captainIsLower
        ? pair.player1Round === 9
        : p2Unrated

    return (
        <tr className="border-t hover:bg-muted/30">
            <td className="px-3 py-2 font-medium">
                <button
                    type="button"
                    onClick={() => onOpenDetail(pair.player1UserId)}
                    className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary"
                >
                    {pair.player1DisplayName} {pair.player1LastName}
                </button>
                {pair.captainIsLower && (
                    <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 font-semibold text-amber-700 text-xs dark:bg-amber-900/40 dark:text-amber-300">
                        pinned
                    </span>
                )}
            </td>
            <td className="px-3 py-2 text-center tabular-nums">
                {pair.player1Round.toFixed(1)}
            </td>
            <td className="px-3 py-2 font-medium">
                <button
                    type="button"
                    onClick={() => onOpenDetail(pair.player2UserId)}
                    className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary"
                >
                    {pair.player2DisplayName} {pair.player2LastName}
                </button>
                {p2Unrated && (
                    <span className="ml-1.5 text-muted-foreground text-sm">
                        (unrated)
                    </span>
                )}
                {!pair.captainIsLower && (
                    <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 font-semibold text-amber-700 text-xs dark:bg-amber-900/40 dark:text-amber-300">
                        pinned
                    </span>
                )}
            </td>
            <td className="px-3 py-2 text-center text-muted-foreground tabular-nums">
                {p2Unrated ? "—" : pair.player2Round.toFixed(1)}
            </td>
            <td className="px-3 py-2 text-center">
                <select
                    value={setValue ?? ""}
                    onChange={(e) => onSetValue?.(Number(e.target.value))}
                    className="rounded border bg-background px-2 py-1 text-sm"
                    title={
                        pinnedUnrated
                            ? "Pinned player is unrated — defaulting to round 8"
                            : undefined
                    }
                >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((r) => (
                        <option key={r} value={r}>
                            {r}
                        </option>
                    ))}
                </select>
            </td>
        </tr>
    )
}

export function PairRoundsSection({
    data,
    pairDiffOverrides,
    onSetPairDiff,
    onOpenDetail
}: {
    data: PrepareForDraftData
    pairDiffOverrides: Record<string, number>
    onSetPairDiff: (pairKey: string, v: number) => void
    onOpenDetail: (userId: string) => void
}) {
    if (data.pairDifferentials.length === 0) return null

    return (
        <div className="space-y-2">
            <h2 className="font-semibold text-lg">Set Pair Rounds</h2>
            <div className="rounded-md border">
                <table className="min-w-full border-collapse text-sm">
                    <thead>
                        <tr className="bg-muted/50">
                            <th className="px-3 py-2 text-left font-medium">
                                Player 1 (higher)
                            </th>
                            <th className="px-3 py-2 text-center font-medium">
                                Rec&apos;d Round
                            </th>
                            <th className="px-3 py-2 text-left font-medium">
                                Player 2 (lower)
                            </th>
                            <th className="px-3 py-2 text-center font-medium">
                                Rec&apos;d Round
                            </th>
                            <th className="px-3 py-2 text-center font-medium">
                                Pair Round
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.pairDifferentials.map((pair) => {
                            const pairKey = `${pair.player1UserId}:${pair.player2UserId}`
                            const pinnedUnrated = pair.captainIsLower
                                ? pair.player1Round === 9
                                : pair.player2Round === 9
                            const pinnedRound = pair.captainIsLower
                                ? pair.player1Round
                                : pair.player2Round
                            const defaultDiff = pinnedUnrated
                                ? 8
                                : clampRound(pinnedRound)
                            const diffValue =
                                pairDiffOverrides[pairKey] ??
                                data.savedPairDiffs[pairKey] ??
                                defaultDiff
                            return (
                                <PairDifferentialRow
                                    key={pairKey}
                                    pair={pair}
                                    setValue={diffValue}
                                    onSetValue={(v) =>
                                        onSetPairDiff(pairKey, v)
                                    }
                                    onOpenDetail={onOpenDetail}
                                />
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
