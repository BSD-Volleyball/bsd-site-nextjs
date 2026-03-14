"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import type {
    PrepareForDraftData,
    PlayerRow,
    PairDifferential
} from "./actions"
import { setCaptainRound, setPairDiff } from "./actions"
import {
    usePlayerDetailModal,
    PlayerDetailPopup
} from "@/components/player-detail"

function getRoundClass(round: number): string {
    if (round <= 2) return "bg-green-50 text-green-700"
    if (round <= 4) return "bg-lime-50 text-lime-700"
    if (round <= 6) return "bg-yellow-50 text-yellow-700"
    if (round <= 8) return "bg-orange-50 text-orange-700"
    return "text-muted-foreground"
}

function PlayerTableRow({
    player,
    isCaptain,
    setRound,
    onSetRound,
    onOpenDetail
}: {
    player: PlayerRow
    isCaptain: boolean
    setRound?: number
    onSetRound?: (v: number) => void
    onOpenDetail: (userId: string) => void
}) {
    const rowClass = isCaptain
        ? "border-t bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-950/60"
        : player.isPairPick
          ? "border-t bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/40 dark:hover:bg-violet-950/60"
          : "border-t hover:bg-muted/30"
    const stickyBg = isCaptain
        ? "bg-blue-50 dark:bg-blue-950/40"
        : player.isPairPick
          ? "bg-violet-50 dark:bg-violet-950/40"
          : "bg-background"

    return (
        <tr className={rowClass}>
            <td
                className={`sticky left-0 z-10 whitespace-nowrap border-r px-3 py-2 font-medium ${stickyBg}`}
            >
                <button
                    type="button"
                    onClick={() => onOpenDetail(player.userId)}
                    className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary"
                >
                    {player.displayName} {player.lastName}
                </button>
                {player.isPairPick && (
                    <span className="ml-1.5 rounded bg-violet-100 px-1 py-0.5 font-semibold text-violet-700 text-xs dark:bg-violet-900/40 dark:text-violet-300">
                        PP
                    </span>
                )}
                {isCaptain && (
                    <span className="ml-1.5 rounded bg-blue-100 px-1 py-0.5 font-semibold text-blue-700 text-xs dark:bg-blue-900/40 dark:text-blue-300">
                        CAP
                    </span>
                )}
            </td>
            {player.captainRounds.map((cr) => (
                <td
                    key={cr.captainId}
                    className={`px-3 py-2 text-center ${getRoundClass(cr.mappedRound)}`}
                >
                    {cr.mappedRound === 9 ? (
                        <span className="text-muted-foreground">—</span>
                    ) : (
                        cr.mappedRound
                    )}
                </td>
            ))}
            <td className="px-3 py-2 text-center tabular-nums">
                {player.captainAverage.toFixed(1)}
            </td>
            <td className="px-3 py-2 text-center text-muted-foreground tabular-nums">
                {player.draftHistoryAverage !== null
                    ? player.draftHistoryAverage.toFixed(1)
                    : "—"}
            </td>
            <td className="px-3 py-2 text-center font-semibold tabular-nums">
                {player.recommendedRound.toFixed(1)}
            </td>
            <td className="px-3 py-2 text-center">
                {isCaptain && onSetRound !== undefined ? (
                    <select
                        value={setRound ?? ""}
                        onChange={(e) => onSetRound(Number(e.target.value))}
                        className="rounded border bg-background px-2 py-1 text-sm"
                    >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((r) => (
                            <option key={r} value={r}>
                                {r}
                            </option>
                        ))}
                    </select>
                ) : null}
            </td>
        </tr>
    )
}

function clampRound(v: number): number {
    return Math.min(8, Math.max(1, Math.round(v)))
}

interface SeasonInfo {
    id: number
    year: number
    name: string
}

export function PrepareForDraftTable({
    data,
    allSeasons,
    playerPicUrl
}: {
    data: PrepareForDraftData
    allSeasons: SeasonInfo[]
    playerPicUrl: string
}) {
    const router = useRouter()
    const modal = usePlayerDetailModal()
    const [captainRoundOverrides, setCaptainRoundOverrides] = useState<
        Record<string, number>
    >({})
    const [pairDiffOverrides, setPairDiffOverrides] = useState<
        Record<string, number>
    >({})
    const [saving, setSaving] = useState(false)
    const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">(
        "idle"
    )

    const tableWrapperRef = useRef<HTMLDivElement>(null)
    const theadRef = useRef<HTMLTableSectionElement>(null)

    useEffect(() => {
        const wrapper = tableWrapperRef.current
        const thead = theadRef.current
        if (!wrapper || !thead) return

        const update = () => {
            const top = wrapper.getBoundingClientRect().top
            const maxShift = wrapper.offsetHeight - thead.offsetHeight
            if (top < 0 && -top < maxShift) {
                thead.style.transform = `translateY(${-top}px)`
            } else {
                thead.style.transform = ""
            }
        }

        window.addEventListener("scroll", update, { passive: true })
        return () => window.removeEventListener("scroll", update)
    }, [])

    const hasHomework = data.players.length > 0
    const captainIds = new Set(data.captains.map((c) => c.userId))

    async function handleSave() {
        setSaving(true)
        setSaveStatus("idle")
        try {
            const captainSaves = data.players
                .filter((p) => captainIds.has(p.userId))
                .map((p) => {
                    const round =
                        captainRoundOverrides[p.userId] ??
                        data.savedCaptainRounds[p.userId] ??
                        clampRound(p.recommendedRound)
                    return setCaptainRound({
                        captainId: p.userId,
                        round,
                        divisionId: data.divisionId
                    })
                })

            const pairSaves = data.pairDifferentials.map((pair) => {
                const pairKey = [pair.player1UserId, pair.player2UserId]
                    .sort()
                    .join(":")
                const p2Unrated = pair.player2Round === 9
                const defaultDiff = p2Unrated ? 8 : clampRound(pair.difference)
                const diff =
                    pairDiffOverrides[pairKey] ??
                    data.savedPairDiffs[pairKey] ??
                    defaultDiff
                return setPairDiff({
                    player1Id: pair.player1UserId,
                    player2Id: pair.player2UserId,
                    diff,
                    divisionId: data.divisionId
                })
            })

            await Promise.all([...captainSaves, ...pairSaves])
            setSaveStatus("saved")
            router.refresh()
        } catch {
            setSaveStatus("error")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-4">
            {data.isLeagueWide && data.availableDivisions.length > 1 && (
                <div className="flex items-center gap-2">
                    <label
                        htmlFor="division-select"
                        className="font-medium text-sm"
                    >
                        Division
                    </label>
                    <select
                        id="division-select"
                        value={data.divisionId}
                        onChange={(e) =>
                            router.push(
                                `/dashboard/prepare-for-draft?divisionId=${e.target.value}`
                            )
                        }
                        className="rounded border bg-background px-2 py-1 text-sm"
                    >
                        {data.availableDivisions.map((div) => (
                            <option key={div.id} value={div.id}>
                                {div.name}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {!hasHomework && (
                <div className="rounded-md bg-muted p-4 text-muted-foreground text-sm">
                    No draft homework has been submitted yet for this division.
                    Players will appear here once at least one captain ranks
                    them.
                </div>
            )}

            {data.captains.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No captains have been assigned to this division yet.
                </div>
            ) : (
                <div
                    ref={tableWrapperRef}
                    className="overflow-x-auto rounded-md border"
                >
                    <table className="min-w-full border-collapse text-sm">
                        <thead ref={theadRef} className="relative z-20">
                            <tr className="bg-muted">
                                <th className="sticky left-0 z-30 whitespace-nowrap border-r bg-muted px-3 py-2 text-left font-medium">
                                    Player
                                </th>
                                {data.captains.map((cap) => (
                                    <th
                                        key={cap.userId}
                                        className="whitespace-nowrap px-3 py-2 text-center font-medium"
                                        title={`${cap.displayName} ${cap.lastName}`}
                                    >
                                        {cap.displayName}
                                    </th>
                                ))}
                                <th className="whitespace-nowrap px-3 py-2 text-center font-medium">
                                    Cap Avg
                                </th>
                                <th className="whitespace-nowrap px-3 py-2 text-center font-medium">
                                    Draft History
                                </th>
                                <th className="whitespace-nowrap px-3 py-2 text-center font-medium">
                                    Rec&apos;d Round
                                </th>
                                <th className="whitespace-nowrap px-3 py-2 text-center font-medium">
                                    Set Round
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.players.map((player) => {
                                const isCap = captainIds.has(player.userId)
                                const roundValue =
                                    captainRoundOverrides[player.userId] ??
                                    data.savedCaptainRounds[player.userId] ??
                                    clampRound(player.recommendedRound)
                                return (
                                    <PlayerTableRow
                                        key={player.userId}
                                        player={player}
                                        isCaptain={isCap}
                                        setRound={
                                            isCap ? roundValue : undefined
                                        }
                                        onSetRound={
                                            isCap
                                                ? (v) => {
                                                      setCaptainRoundOverrides(
                                                          (prev) => ({
                                                              ...prev,
                                                              [player.userId]: v
                                                          })
                                                      )
                                                      setSaveStatus("idle")
                                                  }
                                                : undefined
                                        }
                                        onOpenDetail={modal.openPlayerDetail}
                                    />
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {(data.captains.length > 0 ||
                data.pairDifferentials.length > 0) && (
                <div className="flex items-center gap-4 pt-2">
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="rounded-lg bg-primary px-8 py-3 font-semibold text-base text-primary-foreground shadow transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                        {saving ? "Saving…" : "Lock In Picks"}
                    </button>
                    {saveStatus === "saved" && (
                        <span className="font-medium text-green-700 text-sm">
                            Saved successfully
                        </span>
                    )}
                    {saveStatus === "error" && (
                        <span className="font-medium text-red-700 text-sm">
                            Save failed — please try again
                        </span>
                    )}
                </div>
            )}

            {data.pairDifferentials.length > 0 && (
                <div className="space-y-2">
                    <h2 className="font-semibold text-lg">
                        Set Pair Differentials
                    </h2>
                    <div className="rounded-md border">
                        <table className="min-w-full border-collapse text-sm">
                            <thead>
                                <tr className="bg-muted/50">
                                    <th className="px-3 py-2 text-left font-medium">
                                        Player 1
                                    </th>
                                    <th className="px-3 py-2 text-center font-medium">
                                        Rec&apos;d Round
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                        Player 2
                                    </th>
                                    <th className="px-3 py-2 text-center font-medium">
                                        Rec&apos;d Round
                                    </th>
                                    <th className="px-3 py-2 text-center font-medium">
                                        Difference
                                    </th>
                                    <th className="px-3 py-2 text-center font-medium">
                                        Set Diff
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.pairDifferentials.map((pair) => {
                                    const pairKey = [
                                        pair.player1UserId,
                                        pair.player2UserId
                                    ]
                                        .sort()
                                        .join(":")
                                    const p2Unrated = pair.player2Round === 9
                                    const defaultDiff = p2Unrated
                                        ? 8
                                        : clampRound(pair.difference)
                                    const diffValue =
                                        pairDiffOverrides[pairKey] ??
                                        data.savedPairDiffs[pairKey] ??
                                        defaultDiff
                                    return (
                                        <PairDifferentialRow
                                            key={pairKey}
                                            pair={pair}
                                            setValue={diffValue}
                                            onSetValue={(v) => {
                                                setPairDiffOverrides(
                                                    (prev) => ({
                                                        ...prev,
                                                        [pairKey]: v
                                                    })
                                                )
                                                setSaveStatus("idle")
                                            }}
                                            onOpenDetail={
                                                modal.openPlayerDetail
                                            }
                                        />
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {(data.captains.length > 0 ||
                data.pairDifferentials.length > 0) && (
                <div className="flex items-center gap-4 pt-2">
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="rounded-lg bg-primary px-8 py-3 font-semibold text-base text-primary-foreground shadow transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                        {saving ? "Saving…" : "Lock In Picks"}
                    </button>
                    {saveStatus === "saved" && (
                        <span className="font-medium text-green-700 text-sm">
                            Saved successfully
                        </span>
                    )}
                    {saveStatus === "error" && (
                        <span className="font-medium text-red-700 text-sm">
                            Save failed — please try again
                        </span>
                    )}
                </div>
            )}

            <PlayerDetailPopup
                open={!!modal.selectedUserId}
                onClose={modal.closePlayerDetail}
                playerDetails={modal.playerDetails}
                draftHistory={modal.draftHistory}
                allSeasons={allSeasons}
                playerPicUrl={playerPicUrl}
                isLoading={modal.isLoading}
                pairPickName={modal.pairPickName}
                pairReason={modal.pairReason}
                datesMissing={modal.datesMissing}
                playoffDates={modal.playoffDates}
                ratingAverages={modal.ratingAverages}
                sharedRatingNotes={modal.sharedRatingNotes}
                privateRatingNotes={modal.privateRatingNotes}
                viewerRating={modal.viewerRating}
            />
        </div>
    )
}

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
    // player2Round === 9 means they weren't in the rated table (default value)
    const p2Unrated = pair.player2Round === 9

    // Unrated pairs always display as difference of 8 (large unknown gap)
    const displayDiff = p2Unrated ? 8 : pair.difference
    const diffClass =
        displayDiff === 0
            ? "text-green-700"
            : displayDiff <= 1
              ? "text-lime-700"
              : displayDiff <= 2
                ? "text-yellow-700"
                : "text-red-700"

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
                    <span className="ml-1.5 text-muted-foreground text-xs">
                        (unrated)
                    </span>
                )}
            </td>
            <td className="px-3 py-2 text-center text-muted-foreground tabular-nums">
                {p2Unrated ? "—" : pair.player2Round.toFixed(1)}
            </td>
            <td
                className={`px-3 py-2 text-center font-semibold tabular-nums ${diffClass}`}
            >
                {p2Unrated ? 8 : pair.difference.toFixed(1)}
            </td>
            <td className="px-3 py-2 text-center">
                <select
                    value={setValue ?? ""}
                    onChange={(e) => onSetValue?.(Number(e.target.value))}
                    className="rounded border bg-background px-2 py-1 text-sm"
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
