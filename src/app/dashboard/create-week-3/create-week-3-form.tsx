"use client"

import { RiDeleteBinLine, RiFileCopyLine } from "@remixicon/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { saveWeek3Rosters } from "./actions"
import {
    usePlayerDetailModal,
    AdminPlayerDetailPopup
} from "@/components/player-detail"
import type {
    Week3Candidate,
    Week3Division,
    Week3ExcludedPlayer,
    Week3SavedAssignment
} from "./week3-types"

interface CreateWeek3FormProps {
    seasonLabel: string
    divisions: Week3Division[]
    candidates: Week3Candidate[]
    excludedPlayers: Week3ExcludedPlayer[]
    playerPicUrl: string
}

import {
    type Week3PlacedPlayer,
    type PlacementReason,
    placementReasonLabel,
    placementReasonClasses,
    placementReasonOrder,
    getDisplayName,
    sortDivisionPlayers,
    toOriginalPlacedPlayer,
    buildDivisionPlacement,
    buildTeamsForDivision
} from "./placement"

export function CreateWeek3Form({
    seasonLabel,
    divisions,
    candidates,
    excludedPlayers,
    playerPicUrl
}: CreateWeek3FormProps) {
    const [step, setStep] = useState<1 | 2>(1)
    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const modal = usePlayerDetailModal()

    const aaDivision = divisions[0] ?? null
    const aaCaptains = useMemo(
        () =>
            candidates
                .filter(
                    (c) =>
                        c.isCaptain &&
                        aaDivision !== null &&
                        c.captainDivisionId === aaDivision.id
                )
                .sort((a, b) =>
                    getDisplayName(a)
                        .toLowerCase()
                        .localeCompare(getDisplayName(b).toLowerCase())
                ),
        [candidates, aaDivision]
    )

    const [includedAaCaptainIds, setIncludedAaCaptainIds] = useState<
        Set<string>
    >(new Set())

    const toggleAaCaptain = (userId: string) => {
        setIncludedAaCaptainIds((prev) => {
            const next = new Set(prev)
            if (next.has(userId)) {
                next.delete(userId)
            } else {
                next.add(userId)
            }
            return next
        })
    }

    const effectiveCandidates = useMemo(
        () =>
            candidates.filter(
                (c) =>
                    !c.isCaptain ||
                    aaDivision === null ||
                    c.captainDivisionId !== aaDivision.id ||
                    includedAaCaptainIds.has(c.userId)
            ),
        [candidates, aaDivision, includedAaCaptainIds]
    )

    const eligibleMaleCount = useMemo(
        () =>
            effectiveCandidates.filter((candidate) => candidate.male === true)
                .length,
        [effectiveCandidates]
    )
    const eligibleNonMaleCount = useMemo(
        () => effectiveCandidates.length - eligibleMaleCount,
        [effectiveCandidates.length, eligibleMaleCount]
    )

    const placementResult = useMemo(
        () => buildDivisionPlacement(divisions, effectiveCandidates),
        [divisions, effectiveCandidates]
    )
    const placement = placementResult.placement
    const playerPlacementReasonById = placementResult.reasonByUser
    const lockedPlayerIds = placementResult.lockedUserIds
    const duplicateCounterRef = useRef(0)

    const initialDivisionPlayers = useMemo(() => {
        const result = new Map<number, Week3PlacedPlayer[]>()

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

    const divisionNameById = useMemo(
        () =>
            new Map(divisions.map((division) => [division.id, division.name])),
        [divisions]
    )

    const getPlayerPlacementLabel = (
        player: Week3PlacedPlayer,
        reason: PlacementReason
    ) => {
        if (reason === "tryout2_same_division") {
            const week2DivisionName =
                player.week2DivisionId !== null
                    ? (divisionNameById.get(player.week2DivisionId) ?? null)
                    : null
            return week2DivisionName
                ? `Played in ${week2DivisionName} week 2`
                : "Played in week 2"
        }

        if (reason === "forced_move_up" || reason === "forced_move_down") {
            const week2DivisionName =
                player.week2DivisionId !== null
                    ? (divisionNameById.get(player.week2DivisionId) ?? null)
                    : null
            if (week2DivisionName) {
                return `${placementReasonLabel[reason]} from ${week2DivisionName}`
            }
        }

        return placementReasonLabel[reason]
    }

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

        if (lockedPlayerIds.has(selectedPlayer.sourceUserId)) {
            setError("Locked players cannot be moved between divisions.")
            return
        }

        const movingPlayers: Week3PlacedPlayer[] = [selectedPlayer]

        if (selectedPlayer.pairUserId) {
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
            if (lockedPlayerIds.has(partner.sourceUserId)) {
                setError("Locked players cannot be moved between divisions.")
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

        if (lockedPlayerIds.has(selectedPlayer.sourceUserId)) {
            setError("Locked players cannot be duplicated.")
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
        const getDistance = (division: Week3Division) =>
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

        const duplicate: Week3PlacedPlayer = {
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

        const playersById = new Map<string, Week3Candidate>()
        for (const players of editableDivisionPlayers.values()) {
            for (const player of players) {
                playersById.set(player.userId, player)
            }
        }

        const seen = new Set<string>()

        for (const player of playersById.values()) {
            if (!player.pairUserId) {
                continue
            }

            const partner = playersById.get(player.pairUserId)
            if (!partner || partner.pairUserId !== player.userId) {
                continue
            }

            const key =
                player.userId < partner.userId
                    ? `${player.userId}:${partner.userId}`
                    : `${partner.userId}:${player.userId}`

            if (seen.has(key)) {
                continue
            }

            seen.add(key)
            const average = (player.placementScore + partner.placementScore) / 2
            result.set(player.userId, average)
            result.set(partner.userId, average)
        }

        return result
    }, [editableDivisionPlayers])

    const teamAssignments = useMemo(() => {
        return divisions.map((division) => ({
            division,
            teams: buildTeamsForDivision(
                division,
                editableDivisionPlayers.get(division.id) || [],
                division.index === 0 && division.teamCount === 6
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

    const savePayload = useMemo<Week3SavedAssignment[]>(() => {
        const payload: Week3SavedAssignment[] = []

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

        const result = await saveWeek3Rosters(savePayload)

        if (result.status) {
            setMessage(result.message ?? null)
        } else {
            setError(result.message)
        }

        setIsSaving(false)
    }

    return (
        <div className="space-y-6">
            {aaDivision && aaCaptains.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>
                            AA Captains — Week 3 Participation
                        </CardTitle>
                        <p className="text-muted-foreground text-sm">
                            Check each AA captain who is participating in Week
                            3. Unchecked captains will not appear in any
                            division.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col gap-2">
                            {aaCaptains.map((captain) => (
                                <label
                                    key={captain.userId}
                                    className="flex cursor-pointer items-center gap-2"
                                >
                                    <Checkbox
                                        checked={includedAaCaptainIds.has(
                                            captain.userId
                                        )}
                                        onCheckedChange={() =>
                                            toggleAaCaptain(captain.userId)
                                        }
                                    />
                                    <span className="text-sm">
                                        {getDisplayName(captain)}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
            <Card>
                <CardHeader>
                    <CardTitle>
                        Season: {seasonLabel} | Eligible Players:{" "}
                        {effectiveCandidates.length} ({eligibleMaleCount} male /{" "}
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
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Week 3 Placement Legend</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                {placementReasonOrder.map((reason) => (
                                    <span
                                        key={reason}
                                        className={cn(
                                            "inline-flex items-center rounded-sm border px-2 py-1 font-medium text-xs",
                                            placementReasonClasses[reason]
                                        )}
                                    >
                                        {placementReasonLabel[reason]}
                                    </span>
                                ))}
                            </div>
                            <p className="text-muted-foreground text-xs">
                                Only captains and their paired partners are
                                locked for Week 3.
                            </p>
                        </CardContent>
                    </Card>

                    <div className="grid gap-4 xl:grid-cols-2">
                        {divisions.map((division, index) => {
                            const bucket = placement.get(division.id)
                            const players =
                                editableDivisionPlayers.get(division.id) || []
                            const targetLabel = "Week 3 ideal target"
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
                                            {players.map((player) => {
                                                const reason =
                                                    playerPlacementReasonById.get(
                                                        player.sourceUserId
                                                    ) ?? "score_based"
                                                const isLocked =
                                                    lockedPlayerIds.has(
                                                        player.sourceUserId
                                                    )
                                                const duplicateCount =
                                                    duplicateCountBySourceUserId.get(
                                                        player.sourceUserId
                                                    ) ?? 1
                                                const reasonLabel =
                                                    getPlayerPlacementLabel(
                                                        player,
                                                        reason
                                                    )

                                                return (
                                                    <div
                                                        key={player.entryId}
                                                        className={cn(
                                                            "flex items-center justify-between rounded-sm border px-2 py-0.5 text-xs",
                                                            placementReasonClasses[
                                                                reason
                                                            ]
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
                                                                {getDisplayName(
                                                                    player
                                                                )}
                                                            </button>
                                                            {player.seasonsPlayedCount ===
                                                                0 && (
                                                                <span className="ml-2 font-semibold text-green-600 dark:text-green-400">
                                                                    NEW
                                                                </span>
                                                            )}
                                                            {player.pairWithName && (
                                                                <span className="ml-2 opacity-80">
                                                                    pair:{" "}
                                                                    {
                                                                        player.pairWithName
                                                                    }
                                                                </span>
                                                            )}
                                                            <span className="ml-2 font-semibold">
                                                                {reasonLabel}
                                                            </span>
                                                            {duplicateCount >
                                                                1 && (
                                                                <span className="ml-2 font-semibold">
                                                                    plays twice
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="ml-2 flex items-center gap-1">
                                                            <span className="opacity-80">
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
                                                                        (pair
                                                                        avg{" "}
                                                                        {Math.round(
                                                                            pairAverageScoreByUser.get(
                                                                                player.sourceUserId
                                                                            ) ||
                                                                                0
                                                                        )}
                                                                        )
                                                                    </span>
                                                                )}{" "}
                                                                |{" "}
                                                                {player.male ===
                                                                true
                                                                    ? "M"
                                                                    : "NM"}
                                                            </span>
                                                            {player.recommendationUpCount >
                                                                0 && (
                                                                <span className="font-semibold text-green-700 dark:text-green-300">
                                                                    ↑{" "}
                                                                    {
                                                                        player.recommendationUpCount
                                                                    }
                                                                </span>
                                                            )}
                                                            {player.recommendationDownCount >
                                                                0 && (
                                                                <span className="font-semibold text-red-700 dark:text-red-300">
                                                                    ↓{" "}
                                                                    {
                                                                        player.recommendationDownCount
                                                                    }
                                                                </span>
                                                            )}
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
                                                                    index ===
                                                                        0 ||
                                                                    isLocked
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
                                                                    isLocked
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
                                                                    isLocked ||
                                                                    duplicateCount >=
                                                                        2 ||
                                                                    (index ===
                                                                        0 &&
                                                                        divisions.length ===
                                                                            1)
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
                                                )
                                            })}
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
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
                                                            <button
                                                                type="button"
                                                                className="font-medium underline-offset-2 hover:underline"
                                                                onClick={() =>
                                                                    modal.openPlayerDetail(
                                                                        player.assignmentUserId
                                                                    )
                                                                }
                                                            >
                                                                {
                                                                    player.displayName
                                                                }
                                                            </button>
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
                                                                <span className="ml-2 font-semibold text-green-600 dark:text-green-400">
                                                                    NEW
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
                                                            {player.ratingScore !==
                                                                null && (
                                                                <span className="ml-1 text-amber-600 dark:text-amber-400">
                                                                    R
                                                                    {Math.round(
                                                                        player.ratingScore
                                                                    )}
                                                                </span>
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
                            {isSaving ? "Saving..." : "Save Week 3 Rosters"}
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
                            Excluded (missing tryout 3 date):{" "}
                            {excludedPlayers.length}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {excludedPlayers.length === 0 ? (
                            <p className="text-muted-foreground text-sm">
                                No players were excluded for missing the tryout
                                3 date.
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
