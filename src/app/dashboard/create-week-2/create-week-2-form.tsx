"use client"

import { RiDeleteBinLine, RiFileCopyLine } from "@remixicon/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { saveWeek2Rosters } from "./actions"
import {
    usePlayerDetailModal,
    AdminPlayerDetailPopup
} from "@/components/player-detail"
import type {
    Week2Candidate,
    Week2Division,
    Week2ExcludedPlayer,
    Week2SavedAssignment
} from "./week2-types"

interface CreateWeek2FormProps {
    seasonLabel: string
    divisions: Week2Division[]
    candidates: Week2Candidate[]
    excludedPlayers: Week2ExcludedPlayer[]
    playerPicUrl: string
}

import {
    type Week2PlacedPlayer,
    getDisplayName,
    sortDivisionPlayers,
    toOriginalPlacedPlayer,
    buildDivisionPlacement,
    buildTeamsForDivision
} from "./placement"

export function CreateWeek2Form({
    seasonLabel,
    divisions,
    candidates,
    excludedPlayers,
    playerPicUrl
}: CreateWeek2FormProps) {
    const [step, setStep] = useState<1 | 2>(1)
    const modal = usePlayerDetailModal()
    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const duplicateCounterRef = useRef(0)

    const eligibleMaleCount = useMemo(
        () => candidates.filter((candidate) => candidate.male === true).length,
        [candidates]
    )
    const eligibleNonMaleCount = useMemo(
        () => candidates.length - eligibleMaleCount,
        [candidates.length, eligibleMaleCount]
    )

    const placement = useMemo(
        () => buildDivisionPlacement(divisions, candidates),
        [divisions, candidates]
    )

    const initialDivisionPlayers = useMemo(() => {
        const result = new Map<number, Week2PlacedPlayer[]>()

        for (const division of divisions) {
            const bucket = placement.get(division.id)
            if (!bucket) {
                result.set(division.id, [])
                continue
            }

            const players = sortDivisionPlayers(
                bucket.units
                    .flatMap((unit) => unit.players)
                    .map(toOriginalPlacedPlayer)
            )

            result.set(division.id, players)
        }

        return result
    }, [divisions, placement])

    const [editableDivisionPlayers, setEditableDivisionPlayers] = useState(
        initialDivisionPlayers
    )

    useEffect(() => {
        setEditableDivisionPlayers(initialDivisionPlayers)
    }, [initialDivisionPlayers])

    const handleResetStepOne = () => {
        setEditableDivisionPlayers(initialDivisionPlayers)
        setError(null)
        setMessage(null)
    }

    const duplicateCountBySourceUserId = useMemo(() => {
        const counts = new Map<string, number>()
        for (const players of editableDivisionPlayers.values()) {
            for (const player of players) {
                counts.set(
                    player.sourceUserId,
                    (counts.get(player.sourceUserId) ?? 0) + 1
                )
            }
        }
        return counts
    }, [editableDivisionPlayers])

    const captainPairIds = useMemo(() => {
        const captainIds = new Set(
            candidates.filter((c) => c.isCaptain).map((c) => c.userId)
        )
        const result = new Set<string>()
        for (const candidate of candidates) {
            if (candidate.pairUserId && captainIds.has(candidate.pairUserId)) {
                result.add(candidate.userId)
            }
        }
        return result
    }, [candidates])

    const handleMoveDivision = (
        divisionIndex: number,
        entryId: string,
        direction: -1 | 1
    ) => {
        setError(null)
        setMessage(null)

        const targetDivisionIndex = divisionIndex + direction
        if (
            targetDivisionIndex < 0 ||
            targetDivisionIndex >= divisions.length
        ) {
            return
        }

        const sourceDivisionId = divisions[divisionIndex].id
        const targetDivisionId = divisions[targetDivisionIndex].id

        const sourcePlayersCurrent =
            editableDivisionPlayers.get(sourceDivisionId) || []
        const targetPlayersCurrent =
            editableDivisionPlayers.get(targetDivisionId) || []

        const selectedPlayer = sourcePlayersCurrent.find(
            (player) => player.entryId === entryId
        )

        if (!selectedPlayer) {
            return
        }

        if (
            selectedPlayer.isCaptain ||
            captainPairIds.has(selectedPlayer.sourceUserId)
        ) {
            setError(
                "Captains and their paired partners cannot be moved between divisions."
            )
            return
        }

        const movingPlayers: Week2PlacedPlayer[] = [selectedPlayer]

        if (selectedPlayer.pairUserId && !selectedPlayer.isDuplicateEntry) {
            const partner = sourcePlayersCurrent.find(
                (player) =>
                    player.sourceUserId === selectedPlayer.pairUserId &&
                    !player.isDuplicateEntry
            )
            if (
                !partner ||
                partner.pairUserId !== selectedPlayer.sourceUserId
            ) {
                setError(
                    "Paired player move requires both pair members in the same division."
                )
                return
            }
            movingPlayers.push(partner)
        }

        const movingIds = new Set(movingPlayers.map((player) => player.entryId))

        const nextSourcePlayers = sortDivisionPlayers([
            ...sourcePlayersCurrent.filter(
                (player) => !movingIds.has(player.entryId)
            )
        ])

        const nextTargetPlayers = sortDivisionPlayers([
            ...targetPlayersCurrent,
            ...movingPlayers
        ])

        const nextMap = new Map(editableDivisionPlayers)
        nextMap.set(sourceDivisionId, nextSourcePlayers)
        nextMap.set(targetDivisionId, nextTargetPlayers)
        setEditableDivisionPlayers(nextMap)
    }

    const handleDuplicatePlayer = (divisionIndex: number, entryId: string) => {
        setError(null)
        setMessage(null)

        const sourceDivision = divisions[divisionIndex]
        if (!sourceDivision) {
            return
        }

        const sourcePlayersCurrent =
            editableDivisionPlayers.get(sourceDivision.id) || []
        const selectedPlayer = sourcePlayersCurrent.find(
            (player) => player.entryId === entryId
        )

        if (!selectedPlayer) {
            return
        }

        if (
            selectedPlayer.isCaptain ||
            captainPairIds.has(selectedPlayer.sourceUserId)
        ) {
            setError("Captains and their paired partners cannot be duplicated.")
            return
        }

        const existingCount =
            duplicateCountBySourceUserId.get(selectedPlayer.sourceUserId) ?? 1
        if (existingCount >= 2) {
            setError("A player can only appear twice.")
            return
        }

        const aboveDivision = divisions[divisionIndex - 1] ?? null
        const belowDivision = divisions[divisionIndex + 1] ?? null

        if (!aboveDivision && !belowDivision) {
            setError("No adjacent division is available for duplication.")
            return
        }

        const targetLevel = Math.floor(selectedPlayer.placementScore / 50) + 1
        const getDistance = (division: Week2Division) =>
            Math.abs(division.level - targetLevel)

        let targetDivision = aboveDivision || belowDivision
        if (aboveDivision && belowDivision) {
            const aboveDistance = getDistance(aboveDivision)
            const belowDistance = getDistance(belowDivision)
            targetDivision =
                aboveDistance <= belowDistance ? aboveDivision : belowDivision
        }

        if (!targetDivision) {
            return
        }

        duplicateCounterRef.current += 1

        const duplicate: Week2PlacedPlayer = {
            ...selectedPlayer,
            entryId: `dup:${selectedPlayer.sourceUserId}:${duplicateCounterRef.current}`,
            sourceUserId: selectedPlayer.sourceUserId,
            isDuplicateEntry: true,
            isCaptain: false,
            captainDivisionId: null,
            captainDivisionName: null,
            pairUserId: null,
            pairWithName: null
        }

        const targetPlayersCurrent =
            editableDivisionPlayers.get(targetDivision.id) || []
        const nextTargetPlayers = sortDivisionPlayers([
            ...targetPlayersCurrent,
            duplicate
        ])

        const nextMap = new Map(editableDivisionPlayers)
        nextMap.set(targetDivision.id, nextTargetPlayers)
        setEditableDivisionPlayers(nextMap)
    }

    const handleRemoveDuplicate = (entryId: string) => {
        setError(null)
        setMessage(null)

        const nextMap = new Map(editableDivisionPlayers)
        for (const division of divisions) {
            const players = nextMap.get(division.id) || []
            const target = players.find((player) => player.entryId === entryId)
            if (!target?.isDuplicateEntry) {
                continue
            }

            nextMap.set(
                division.id,
                sortDivisionPlayers(
                    players.filter((player) => player.entryId !== entryId)
                )
            )
            setEditableDivisionPlayers(nextMap)
            return
        }
    }

    const pairAverageScoreByUser = useMemo(() => {
        const result = new Map<string, number>()

        const playersById = new Map<string, Week2PlacedPlayer>()
        for (const players of editableDivisionPlayers.values()) {
            for (const player of players) {
                playersById.set(player.sourceUserId, player)
            }
        }

        const seen = new Set<string>()

        for (const player of playersById.values()) {
            if (!player.pairUserId) {
                continue
            }

            const partner = playersById.get(player.pairUserId)
            if (!partner || partner.pairUserId !== player.sourceUserId) {
                continue
            }

            const key =
                player.sourceUserId < partner.sourceUserId
                    ? `${player.sourceUserId}:${partner.sourceUserId}`
                    : `${partner.sourceUserId}:${player.sourceUserId}`

            if (seen.has(key)) {
                continue
            }

            seen.add(key)
            const average = (player.placementScore + partner.placementScore) / 2
            result.set(player.sourceUserId, average)
            result.set(partner.sourceUserId, average)
        }

        return result
    }, [editableDivisionPlayers])

    const teamAssignments = useMemo(() => {
        return divisions.map((division) => ({
            division,
            teams: buildTeamsForDivision(
                division,
                editableDivisionPlayers.get(division.id) || []
            )
        }))
    }, [editableDivisionPlayers, divisions])

    const playsTwiceAssignmentUserIds = useMemo(() => {
        const counts = new Map<string, number>()

        for (const divisionResult of teamAssignments) {
            for (const team of divisionResult.teams) {
                for (const player of team.players) {
                    counts.set(
                        player.assignmentUserId,
                        (counts.get(player.assignmentUserId) ?? 0) + 1
                    )
                }
            }
        }

        return new Set(
            Array.from(counts.entries())
                .filter(([, count]) => count > 1)
                .map(([assignmentUserId]) => assignmentUserId)
        )
    }, [teamAssignments])

    const savePayload = useMemo<Week2SavedAssignment[]>(() => {
        const payload: Week2SavedAssignment[] = []

        for (const divisionResult of teamAssignments) {
            for (const team of divisionResult.teams) {
                for (const player of team.players) {
                    payload.push({
                        userId: player.assignmentUserId,
                        divisionId: divisionResult.division.id,
                        teamNumber: team.number,
                        isCaptain: player.isCaptain
                    })
                }
            }
        }

        return payload
    }, [teamAssignments])

    const handleSave = async () => {
        setError(null)
        setMessage(null)

        if (savePayload.length === 0) {
            setError("No assignments available to save.")
            return
        }

        setIsSaving(true)

        const result = await saveWeek2Rosters(savePayload)

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
                        Season: {seasonLabel} | Eligible Players:{" "}
                        {candidates.length} ({eligibleMaleCount} male /{" "}
                        {eligibleNonMaleCount} non-male)
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant={step === 1 ? "default" : "outline"}
                            onClick={() => setStep(1)}
                        >
                            Step 1: Division Split
                        </Button>
                        <Button
                            type="button"
                            variant={step === 2 ? "default" : "outline"}
                            onClick={() => setStep(2)}
                        >
                            Step 2: Team Split
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleResetStepOne}
                        >
                            Reset Step 1
                        </Button>
                    </div>
                    {error && (
                        <p className="text-red-700 text-sm dark:text-red-300">
                            {error}
                        </p>
                    )}
                </CardContent>
            </Card>

            {step === 1 && (
                <div className="grid gap-4 xl:grid-cols-2">
                    {divisions.map((division, index) => {
                        const bucket = placement.get(division.id)
                        const players =
                            editableDivisionPlayers.get(division.id) || []
                        const targetLabel = "Dynamic team-size target"
                        const actualMaleCount = players.filter(
                            (player) => player.male === true
                        ).length
                        const actualNonMaleCount =
                            players.length - actualMaleCount

                        return (
                            <Card key={division.id}>
                                <CardHeader>
                                    <CardTitle>
                                        {index + 1}. {division.name} |{" "}
                                        {players.length} players
                                    </CardTitle>
                                    <p className="text-muted-foreground text-sm">
                                        {targetLabel}
                                        {bucket
                                            ? ` | target ${bucket.targetSize} (${bucket.targetMale} male / ${bucket.targetNonMale} non-male) | actual ${actualMaleCount} male / ${actualNonMaleCount} non-male`
                                            : ""}
                                    </p>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-0.5">
                                        {players.map((player) => (
                                            <div
                                                key={player.entryId}
                                                className={cn(
                                                    "flex items-center justify-between rounded-sm border px-2 py-0.5 text-xs",
                                                    player.isCaptain &&
                                                        "border-primary bg-primary/10"
                                                )}
                                            >
                                                <div className="min-w-0 flex-1 truncate pr-2">
                                                    <button
                                                        type="button"
                                                        className="font-medium underline-offset-2 hover:underline"
                                                        onClick={() =>
                                                            modal.openPlayerDetail(
                                                                player.sourceUserId
                                                            )
                                                        }
                                                    >
                                                        {getDisplayName(player)}
                                                    </button>
                                                    {player.seasonsPlayedCount ===
                                                    0 ? (
                                                        <span className="ml-2 font-semibold text-green-600 dark:text-green-400">
                                                            NEW
                                                        </span>
                                                    ) : player.lastDivisionName ? (
                                                        <span
                                                            className={cn(
                                                                "ml-2",
                                                                player.lastDivisionName !==
                                                                    division.name
                                                                    ? "font-semibold text-red-600 dark:text-red-400"
                                                                    : "text-muted-foreground"
                                                            )}
                                                        >
                                                            {
                                                                player.lastDivisionName
                                                            }
                                                        </span>
                                                    ) : null}
                                                    {player.pairWithName && (
                                                        <span className="ml-2 text-muted-foreground">
                                                            pair:{" "}
                                                            {
                                                                player.pairWithName
                                                            }
                                                        </span>
                                                    )}
                                                    {player.isCaptain && (
                                                        <span className="ml-2 font-semibold text-primary">
                                                            CAPTAIN (locked)
                                                        </span>
                                                    )}
                                                    {!player.isCaptain &&
                                                        captainPairIds.has(
                                                            player.sourceUserId
                                                        ) && (
                                                            <span className="ml-2 font-semibold text-primary">
                                                                (locked with
                                                                captain)
                                                            </span>
                                                        )}
                                                    {(duplicateCountBySourceUserId.get(
                                                        player.sourceUserId
                                                    ) ?? 1) > 1 && (
                                                        <span className="ml-2 font-semibold">
                                                            plays twice
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="ml-2 flex items-center gap-1">
                                                    <span className="text-muted-foreground">
                                                        {Math.round(
                                                            player.placementScore
                                                        )}
                                                        {player.overallMostRecent !==
                                                            null &&
                                                            player.ratingScore !==
                                                                null && (
                                                                <span className="ml-1 text-amber-600 dark:text-amber-400">
                                                                    R
                                                                    {Math.round(
                                                                        player.ratingScore
                                                                    )}
                                                                </span>
                                                            )}
                                                        {pairAverageScoreByUser.has(
                                                            player.sourceUserId
                                                        ) && (
                                                            <span>
                                                                {" "}
                                                                (pair avg{" "}
                                                                {Math.round(
                                                                    pairAverageScoreByUser.get(
                                                                        player.sourceUserId
                                                                    ) || 0
                                                                )}
                                                                )
                                                            </span>
                                                        )}{" "}
                                                        |{" "}
                                                        {player.male === true
                                                            ? "M"
                                                            : "NM"}
                                                    </span>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-6 px-1.5"
                                                        onClick={() =>
                                                            handleMoveDivision(
                                                                index,
                                                                player.entryId,
                                                                -1
                                                            )
                                                        }
                                                        disabled={
                                                            index === 0 ||
                                                            player.isCaptain ||
                                                            captainPairIds.has(
                                                                player.sourceUserId
                                                            )
                                                        }
                                                    >
                                                        ↑
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-6 px-1.5"
                                                        onClick={() =>
                                                            handleMoveDivision(
                                                                index,
                                                                player.entryId,
                                                                1
                                                            )
                                                        }
                                                        disabled={
                                                            index ===
                                                                divisions.length -
                                                                    1 ||
                                                            player.isCaptain ||
                                                            captainPairIds.has(
                                                                player.sourceUserId
                                                            )
                                                        }
                                                    >
                                                        ↓
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-6 px-1.5"
                                                        onClick={() =>
                                                            handleDuplicatePlayer(
                                                                index,
                                                                player.entryId
                                                            )
                                                        }
                                                        disabled={
                                                            player.isCaptain ||
                                                            captainPairIds.has(
                                                                player.sourceUserId
                                                            ) ||
                                                            (duplicateCountBySourceUserId.get(
                                                                player.sourceUserId
                                                            ) ?? 1) >= 2
                                                        }
                                                    >
                                                        <RiFileCopyLine className="h-3.5 w-3.5" />
                                                    </Button>
                                                    {player.isDuplicateEntry && (
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-6 px-1.5"
                                                            onClick={() =>
                                                                handleRemoveDuplicate(
                                                                    player.entryId
                                                                )
                                                            }
                                                        >
                                                            <RiDeleteBinLine className="h-3.5 w-3.5" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}

            {step === 2 && (
                <div className="space-y-4">
                    {teamAssignments.map(({ division, teams }) => (
                        <Card key={`teams-${division.id}`}>
                            <CardHeader>
                                <CardTitle>
                                    {division.name} | {teams.length} teams
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                    {teams.map((team) => (
                                        <div
                                            key={`${division.id}-${team.number}`}
                                            className="space-y-2 rounded-md border p-3"
                                        >
                                            <div className="flex items-center justify-between">
                                                <h3 className="font-semibold text-sm">
                                                    Team {team.number}
                                                </h3>
                                                <span className="text-muted-foreground text-xs">
                                                    {team.players.length} |{" "}
                                                    {team.maleCount} M /{" "}
                                                    {team.nonMaleCount} NM
                                                </span>
                                            </div>
                                            <div className="space-y-1">
                                                {team.players.map((player) => (
                                                    <div
                                                        key={`${division.id}-${team.number}-${player.entryId}`}
                                                        className={cn(
                                                            "flex items-center justify-between rounded-sm px-2 py-1 text-xs",
                                                            player.male === true
                                                                ? "bg-sky-100 text-sky-900 dark:bg-sky-950/45 dark:text-sky-100"
                                                                : "bg-violet-100 text-violet-900 dark:bg-violet-950/45 dark:text-violet-100",
                                                            player.isCaptain &&
                                                                "border border-primary"
                                                        )}
                                                    >
                                                        <span className="truncate">
                                                            {player.displayName}
                                                            {player.pairName && (
                                                                <span className="ml-2 opacity-90">
                                                                    (pair:{" "}
                                                                    {
                                                                        player.pairName
                                                                    }
                                                                    )
                                                                </span>
                                                            )}
                                                            {player.isNew && (
                                                                <span className="ml-2 font-semibold">
                                                                    *NEW*
                                                                </span>
                                                            )}
                                                            {player.isCaptain && (
                                                                <span className="ml-2 font-semibold">
                                                                    Captain
                                                                </span>
                                                            )}
                                                            {playsTwiceAssignmentUserIds.has(
                                                                player.assignmentUserId
                                                            ) && (
                                                                <span className="ml-2 font-semibold">
                                                                    plays twice
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className="text-muted-foreground">
                                                            {Math.round(
                                                                player.placementScore
                                                            )}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}

                    <div className="flex items-center gap-3">
                        <Button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaving || savePayload.length === 0}
                        >
                            {isSaving ? "Saving..." : "Save Week 2 Rosters"}
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
                </div>
            )}

            {step === 1 && (
                <Card>
                    <CardHeader>
                        <CardTitle>
                            Excluded (missing tryout 2 date):{" "}
                            {excludedPlayers.length}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {excludedPlayers.length === 0 ? (
                            <p className="text-muted-foreground text-sm">
                                No players were excluded for missing the tryout
                                2 date.
                            </p>
                        ) : (
                            <div className="space-y-1">
                                {excludedPlayers.map((player) => (
                                    <div
                                        key={player.userId}
                                        className="rounded-sm border px-2 py-1 text-xs"
                                    >
                                        <span className="font-medium">
                                            {player.preferredName
                                                ? `${player.preferredName} ${player.lastName}`
                                                : `${player.firstName} ${player.lastName}`}
                                        </span>
                                        {player.oldId !== null && (
                                            <span className="ml-2 text-muted-foreground">
                                                [{player.oldId}]
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
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
