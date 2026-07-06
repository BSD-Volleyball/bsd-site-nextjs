"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { saveWeek1Rosters } from "./actions"
import {
    usePlayerDetailModal,
    AdminPlayerDetailPopup
} from "@/components/player-detail"
import {
    GROUP_COLORS,
    type Week1Candidate,
    type Week1GroupSummary,
    type Week1RosterAssignment
} from "./week1-types"

interface CreateWeek1FormProps {
    seasonLabel: string
    candidates: Week1Candidate[]
    groups: Week1GroupSummary[]
    playerPicUrl: string
}

import {
    type CandidateWithIndex,
    type AssignmentView,
    type CourtAlternates,
    CUTOFF_COUNT,
    displayName,
    cleanGroupLabel,
    reorder,
    buildAssignments
} from "./placement"

export function CreateWeek1Form({
    seasonLabel,
    candidates,
    groups,
    playerPicUrl
}: CreateWeek1FormProps) {
    const [orderedPlayers, setOrderedPlayers] = useState<CandidateWithIndex[]>(
        candidates.map((candidate, sourceIndex) => ({
            ...candidate,
            sourceIndex
        }))
    )
    const [step, setStep] = useState<1 | 2>(1)
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)

    const modal = usePlayerDetailModal()

    const topPlayers = useMemo(
        () => orderedPlayers.slice(0, CUTOFF_COUNT),
        [orderedPlayers]
    )
    const shouldBuildStepTwo = step === 2 && topPlayers.length === CUTOFF_COUNT

    const { assignments, pairInfo } = useMemo(
        () =>
            shouldBuildStepTwo
                ? buildAssignments(topPlayers)
                : {
                      assignments: [] as Week1RosterAssignment[],
                      pairInfo: new Map<
                          string,
                          { partnerName: string; averageScore: number }
                      >()
                  },
        [shouldBuildStepTwo, topPlayers]
    )

    const assignmentsView = useMemo<AssignmentView[]>(() => {
        if (step !== 2 || assignments.length === 0) {
            return []
        }

        const playerById = new Map(
            orderedPlayers.map((player) => [player.userId, player])
        )

        return assignments
            .map((assignment) => {
                const player = playerById.get(assignment.userId)

                if (!player) {
                    return null
                }

                return {
                    userId: assignment.userId,
                    displayName: displayName(player),
                    male: player.male,
                    placementScore: player.placementScore,
                    isNew: player.overallMostRecent === null,
                    pairWith: pairInfo.get(player.userId)?.partnerName || null,
                    pairAverageScore:
                        pairInfo.get(player.userId)?.averageScore || null,
                    sessionNumber: assignment.sessionNumber,
                    courtNumber: assignment.courtNumber
                }
            })
            .filter((item): item is AssignmentView => item !== null)
            .sort((a, b) => {
                if (a.courtNumber !== b.courtNumber) {
                    return a.courtNumber - b.courtNumber
                }
                if (a.sessionNumber !== b.sessionNumber) {
                    return a.sessionNumber - b.sessionNumber
                }
                if (a.placementScore !== b.placementScore) {
                    return a.placementScore - b.placementScore
                }
                return a.displayName.localeCompare(b.displayName)
            })
    }, [step, assignments, orderedPlayers, pairInfo])

    const alternatesByCourt = useMemo<CourtAlternates[]>(() => {
        if (step !== 2 || assignmentsView.length === 0) {
            return []
        }

        const topPlayerIds = new Set(topPlayers.map((player) => player.userId))
        const belowCut = orderedPlayers.filter(
            (player) =>
                !topPlayerIds.has(player.userId) && player.pairUserId === null
        )

        const courtMinimums = new Map<number, number>()
        for (let court = 1 as 1 | 2 | 3 | 4; court <= 4; court++) {
            const courtPlayers = assignmentsView.filter(
                (player) => player.courtNumber === court
            )
            if (courtPlayers.length === 0) {
                courtMinimums.set(court, Number.NaN)
                continue
            }
            const scores = courtPlayers.map((player) => player.placementScore)
            courtMinimums.set(court, Math.min(...scores))
        }

        const usedAlternateUserIds = new Set<string>()
        const result: CourtAlternates[] = []

        for (let court = 1 as 1 | 2 | 3 | 4; court <= 4; court++) {
            const lowerBound =
                court === 1 ? 0 : (courtMinimums.get(court) ?? Number.NaN)
            const upperBound =
                court === 4
                    ? Number.POSITIVE_INFINITY
                    : (courtMinimums.get((court + 1) as 1 | 2 | 3 | 4) ??
                      Number.NaN)
            const selected: CandidateWithIndex[] = []

            if (Number.isNaN(lowerBound) || Number.isNaN(upperBound)) {
                result.push({ courtNumber: court, players: selected })
                continue
            }

            for (const player of belowCut) {
                if (selected.length >= 2) {
                    break
                }
                if (usedAlternateUserIds.has(player.userId)) {
                    continue
                }
                if (
                    player.placementScore >= lowerBound &&
                    player.placementScore <
                        (court === 4 ? Number.POSITIVE_INFINITY : upperBound)
                ) {
                    selected.push(player)
                    usedAlternateUserIds.add(player.userId)
                }
            }

            result.push({ courtNumber: court, players: selected })
        }

        return result
    }, [step, assignmentsView, orderedPlayers, topPlayers])

    const alternateAssignments = useMemo<Week1RosterAssignment[]>(() => {
        return alternatesByCourt.flatMap((courtAlternates) =>
            courtAlternates.players.map((player) => ({
                userId: player.userId,
                sessionNumber: 3 as const,
                courtNumber: courtAlternates.courtNumber
            }))
        )
    }, [alternatesByCourt])

    const saveAssignments = useMemo<Week1RosterAssignment[]>(
        () => [...assignments, ...alternateAssignments],
        [assignments, alternateAssignments]
    )

    const hasFullAlternates = alternateAssignments.length === 8

    const groupedAssignments = useMemo(() => {
        const grouped = new Map<string, AssignmentView[]>()

        if (step !== 2 || assignmentsView.length === 0) {
            return grouped
        }

        for (const row of assignmentsView) {
            const key = `Session ${row.sessionNumber} - Court ${row.courtNumber}`
            const arr = grouped.get(key) || []
            arr.push(row)
            grouped.set(key, arr)
        }

        return grouped
    }, [step, assignmentsView])

    const canProceed = orderedPlayers.length >= CUTOFF_COUNT

    const handleDrop = (dropIndex: number) => {
        if (draggedIndex === null) {
            return
        }

        setOrderedPlayers((prev) => reorder(prev, draggedIndex, dropIndex))
        setDraggedIndex(null)
    }

    const moveBy = (index: number, offset: number) => {
        const target = index + offset
        if (target < 0 || target >= orderedPlayers.length) {
            return
        }

        setOrderedPlayers((prev) => reorder(prev, index, target))
    }

    const handleSave = async () => {
        setError(null)
        setMessage(null)

        if (assignments.length !== CUTOFF_COUNT) {
            setError("You need exactly 96 players above the cutoff line.")
            return
        }
        if (!hasFullAlternates) {
            setError(
                "Need exactly 2 alternates per court (8 total) before saving."
            )
            return
        }

        setIsSaving(true)

        const result = await saveWeek1Rosters(saveAssignments)

        if (result.status) {
            setMessage(result.message ?? null)
        } else {
            setError(result.message)
        }

        setIsSaving(false)
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>
                        Season: {seasonLabel} | Candidates:{" "}
                        {orderedPlayers.length}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {groups.map((group) => (
                            <span
                                key={group.key}
                                className={cn(
                                    "rounded-md border px-2.5 py-1 font-medium text-sm",
                                    group.colorClass
                                )}
                            >
                                {group.label}: {group.count}
                            </span>
                        ))}
                    </div>

                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant={step === 1 ? "default" : "outline"}
                            onClick={() => setStep(1)}
                        >
                            Step 1: Select Top 96
                        </Button>
                        <Button
                            type="button"
                            variant={step === 2 ? "default" : "outline"}
                            onClick={() => setStep(2)}
                            disabled={!canProceed}
                        >
                            Step 2: Build Sessions/Courts
                        </Button>
                    </div>

                    {!canProceed && (
                        <div className="rounded-md bg-amber-50 p-3 text-amber-800 text-sm">
                            Need at least 96 candidates in the prioritized list
                            before continuing.
                        </div>
                    )}
                </CardContent>
            </Card>

            {step === 1 && (
                <Card>
                    <CardHeader>
                        <CardTitle>
                            Ordered Candidate List (drag to reorder)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1">
                        {orderedPlayers.map((player, index) => {
                            const isAboveCutoff = index < CUTOFF_COUNT
                            return (
                                <div key={player.userId}>
                                    <div
                                        role="listitem"
                                        onDragOver={(event) => {
                                            event.preventDefault()
                                        }}
                                        onDrop={() => handleDrop(index)}
                                        className={cn(
                                            "flex items-center gap-3 rounded-md border px-3 py-2",
                                            GROUP_COLORS[player.group],
                                            draggedIndex === index &&
                                                "opacity-60"
                                        )}
                                    >
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            draggable
                                            onDragStart={() =>
                                                setDraggedIndex(index)
                                            }
                                            onDragEnd={() =>
                                                setDraggedIndex(null)
                                            }
                                        >
                                            Drag
                                        </Button>
                                        <span className="w-12 font-semibold text-sm">
                                            {index + 1}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <button
                                                type="button"
                                                className="truncate text-left font-medium text-sm underline-offset-2 hover:underline"
                                                onClick={() =>
                                                    modal.openPlayerDetail(
                                                        player.userId
                                                    )
                                                }
                                            >
                                                {displayName(player)}
                                                {player.oldId !== null && (
                                                    <span className="ml-2 text-muted-foreground text-xs">
                                                        [{player.oldId}]
                                                    </span>
                                                )}
                                            </button>
                                            <p className="truncate text-muted-foreground text-xs">
                                                {cleanGroupLabel(
                                                    player.groupLabel
                                                )}{" "}
                                                | seasons:{" "}
                                                {player.seasonsPlayedCount} |
                                                last:{" "}
                                                {player.lastDraftSeasonLabel ||
                                                    "none"}
                                                {player.lastDraftDivisionName
                                                    ? ` (${player.lastDraftDivisionName})`
                                                    : ""}
                                                | previous:{" "}
                                                {player.previousDraftSeasonLabel ||
                                                    "none"}
                                                {player.previousDraftDivisionName
                                                    ? ` (${player.previousDraftDivisionName})`
                                                    : ""}
                                                {player.overallMostRecent !==
                                                null
                                                    ? ` | overall ${player.overallMostRecent}`
                                                    : ""}
                                                {player.pairWithName
                                                    ? ` | paired: ${player.pairWithName}`
                                                    : ""}
                                            </p>
                                        </div>
                                        <span className="text-xs">
                                            {player.male === true
                                                ? "M"
                                                : player.male === false
                                                  ? "NM"
                                                  : "?"}
                                        </span>
                                        <div className="flex gap-1">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    moveBy(index, -1)
                                                }
                                                disabled={index === 0}
                                            >
                                                Up
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => moveBy(index, 1)}
                                                disabled={
                                                    index ===
                                                    orderedPlayers.length - 1
                                                }
                                            >
                                                Down
                                            </Button>
                                        </div>
                                        <span
                                            className={cn(
                                                "rounded px-2 py-1 font-semibold text-xs",
                                                isAboveCutoff
                                                    ? "bg-green-100 text-green-800"
                                                    : "bg-muted text-muted-foreground"
                                            )}
                                        >
                                            {isAboveCutoff ? "IN" : "OUT"}
                                        </span>
                                    </div>

                                    {index === CUTOFF_COUNT - 1 && (
                                        <div className="my-2 rounded bg-red-600 px-3 py-2 text-center font-bold text-white text-xs">
                                            Cutoff line after player #
                                            {CUTOFF_COUNT}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </CardContent>
                </Card>
            )}

            {step === 2 && (
                <Card>
                    <CardHeader>
                        <CardTitle>
                            Session/Court Assignment Preview (top 96 only)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {Array.from(groupedAssignments.entries()).map(
                            ([key, players]) => {
                                const maleCount = players.filter(
                                    (player) => player.male === true
                                ).length
                                const nonMaleCount = players.length - maleCount

                                return (
                                    <div
                                        key={key}
                                        className="rounded-md border p-3"
                                    >
                                        <div className="mb-2 flex items-center justify-between">
                                            <h3 className="font-semibold text-sm">
                                                {key}
                                            </h3>
                                            <span className="text-muted-foreground text-xs">
                                                {players.length} total |{" "}
                                                {maleCount} male |{" "}
                                                {nonMaleCount} non-male
                                            </span>
                                        </div>
                                        <div className="grid gap-1">
                                            {players.map((player) => (
                                                <div
                                                    key={player.userId}
                                                    className={cn(
                                                        "flex items-center justify-between rounded-sm px-2 py-1 text-xs",
                                                        player.isNew
                                                            ? "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100"
                                                            : "bg-muted/40"
                                                    )}
                                                >
                                                    <button
                                                        type="button"
                                                        className="text-left underline-offset-2 hover:underline"
                                                        onClick={() =>
                                                            modal.openPlayerDetail(
                                                                player.userId
                                                            )
                                                        }
                                                    >
                                                        {player.displayName}
                                                        {player.pairWith && (
                                                            <span className="ml-2 text-[11px] opacity-85">
                                                                (paired with{" "}
                                                                {
                                                                    player.pairWith
                                                                }
                                                                ; avg{" "}
                                                                {Math.round(
                                                                    player.pairAverageScore ||
                                                                        0
                                                                )}
                                                                )
                                                            </span>
                                                        )}
                                                    </button>
                                                    <span className="text-muted-foreground">
                                                        {Math.round(
                                                            player.placementScore
                                                        )}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            }
                        )}

                        <div className="flex items-center gap-3">
                            <Button
                                type="button"
                                onClick={handleSave}
                                disabled={
                                    isSaving ||
                                    assignments.length !== 96 ||
                                    !hasFullAlternates
                                }
                            >
                                {isSaving ? "Saving..." : "Save Week 1 Rosters"}
                            </Button>
                            {message && (
                                <span className="text-green-700 text-sm dark:text-green-300">
                                    {message}
                                </span>
                            )}
                            {error && (
                                <span className="text-red-700 text-sm dark:text-red-300">
                                    {error}
                                </span>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {step === 2 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Alternates (Session 3)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {alternatesByCourt.map((courtAlternates) => (
                            <div
                                key={`alt-${courtAlternates.courtNumber}`}
                                className="rounded-md border p-3"
                            >
                                <div className="mb-2 flex items-center justify-between">
                                    <h3 className="font-semibold text-sm">
                                        Court {courtAlternates.courtNumber}
                                    </h3>
                                    <span className="text-muted-foreground text-xs">
                                        {courtAlternates.players.length}/2
                                        selected
                                    </span>
                                </div>
                                {courtAlternates.players.length === 0 ? (
                                    <p className="text-muted-foreground text-xs">
                                        No eligible alternates found in score
                                        range.
                                    </p>
                                ) : (
                                    <div className="grid gap-1">
                                        {courtAlternates.players.map(
                                            (player) => (
                                                <div
                                                    key={`alt-${courtAlternates.courtNumber}-${player.userId}`}
                                                    className="flex items-center justify-between rounded-sm bg-muted/40 px-2 py-1 text-xs"
                                                >
                                                    <button
                                                        type="button"
                                                        className="text-left underline-offset-2 hover:underline"
                                                        onClick={() =>
                                                            modal.openPlayerDetail(
                                                                player.userId
                                                            )
                                                        }
                                                    >
                                                        {displayName(player)}
                                                    </button>
                                                    <span className="text-muted-foreground">
                                                        {Math.round(
                                                            player.placementScore
                                                        )}
                                                    </span>
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                        {!hasFullAlternates && (
                            <p className="text-amber-700 text-xs dark:text-amber-300">
                                Need 2 alternates per court to save.
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            <AdminPlayerDetailPopup
                open={!!modal.selectedUserId}
                onClose={modal.closePlayerDetail}
                playerDetails={modal.playerDetails}
                draftHistory={modal.draftHistory}
                signupHistory={modal.signupHistory}
                playerPicUrl={playerPicUrl}
                isLoading={modal.isLoading}
                pairPickName={modal.pairPickName}
                pairReason={modal.pairReason}
                ratingAverages={modal.ratingAverages}
                sharedRatingNotes={modal.sharedRatingNotes}
                privateRatingNotes={modal.privateRatingNotes}
                viewerRating={modal.viewerRating}
            />
        </div>
    )
}
