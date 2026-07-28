"use client"

import { useState, useTransition } from "react"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RiCloseCircleFill, RiCheckboxCircleLine } from "@remixicon/react"
import { getRegularSubCandidates } from "./find-sub-actions"
import type { RegularSubCandidate } from "./find-sub-actions"
import type { RosterPlayer, EventInfo, DateMatchInfo } from "./actions"
import { RegularCandidateRow } from "./find-sub-candidate-rows"
import { displayName, formatDate, formatMatchTime } from "./find-sub-helpers"
import type { RegularLockTarget, SubRequestTarget } from "./find-sub-helpers"
import { formatDisplayName } from "@/lib/utils"

type RegularSubCardProps = {
    teamId: number
    futureEvents: EventInfo[]
    roster: RosterPlayer[]
    teamMatchTimeByEventDate: Record<string, string | null>
    dateMatchInfo: Record<string, DateMatchInfo>
    eventDateById: Record<number, string>
    onOpenDetail: (userId: string) => void
    onOpenContact: (userId: string, name: string) => void
    onLockInvalid: (message: string) => void
    onOpenLock: (target: RegularLockTarget) => void
    onOpenRequest: (target: SubRequestTarget) => void
}

export function RegularSubCard({
    teamId,
    futureEvents,
    roster,
    teamMatchTimeByEventDate,
    dateMatchInfo,
    eventDateById,
    onOpenDetail,
    onOpenContact,
    onLockInvalid,
    onOpenLock,
    onOpenRequest
}: RegularSubCardProps) {
    // Regular sub state
    const [selectedEventId, setSelectedEventId] = useState<string>("")
    const [selectedMissingUserIds, setSelectedMissingUserIds] = useState<
        Set<string>
    >(new Set())
    const [regularResult, setRegularResult] = useState<{
        candidates: RegularSubCandidate[]
        nonMaleNeeded: boolean
        missingCount: number
        missingPlayers: { name: string; round: number }[]
    } | null>(null)
    const [regularError, setRegularError] = useState<string | null>(null)
    const [isPendingRegular, startRegularTransition] = useTransition()

    function handleOpenRegularLock(candidate: RegularSubCandidate) {
        if (!selectedEventId) return
        const eventDate = eventDateById[parseInt(selectedEventId, 10)]
        const info = eventDate ? dateMatchInfo[eventDate] : undefined
        if (!info?.matchId) {
            onLockInvalid(
                "No match found for this date — cannot record a regular sub."
            )
            return
        }
        // Require exactly one selected missing player to disambiguate.
        if (selectedMissingUserIds.size !== 1) {
            onLockInvalid(
                "Select exactly one player to be replaced before locking in a sub."
            )
            return
        }
        const originalUserId = Array.from(selectedMissingUserIds)[0]
        const originalPlayer = roster.find((p) => p.userId === originalUserId)
        if (!originalPlayer) return
        onOpenLock({
            matchId: info.matchId,
            matchDate: eventDate,
            originalUserId,
            originalName: displayName(originalPlayer),
            subUserId: candidate.userId,
            subName: formatDisplayName(
                candidate.firstName,
                candidate.lastName,
                candidate.preferredName
            )
        })
    }

    function handleOpenRequestSub(candidate: RegularSubCandidate) {
        if (!selectedEventId) return
        const eventDate = eventDateById[parseInt(selectedEventId, 10)]
        const info = eventDate ? dateMatchInfo[eventDate] : undefined
        if (!info?.matchId) {
            onLockInvalid(
                "No match found for this date — cannot request a sub."
            )
            return
        }
        if (selectedMissingUserIds.size !== 1) {
            onLockInvalid(
                "Select exactly one player to be replaced before requesting a sub."
            )
            return
        }
        const originalUserId = Array.from(selectedMissingUserIds)[0]
        const originalPlayer = roster.find((p) => p.userId === originalUserId)
        if (!originalPlayer) return
        onOpenRequest({
            matchId: info.matchId,
            matchDate: eventDate,
            originalUserId,
            originalName: displayName(originalPlayer),
            subUserId: candidate.userId,
            subName: formatDisplayName(
                candidate.firstName,
                candidate.lastName,
                candidate.preferredName
            ),
            subTeamName: candidate.teamName
        })
    }

    function handleEventChange(eventIdStr: string) {
        setSelectedEventId(eventIdStr)
        const eventId = parseInt(eventIdStr, 10)
        const defaultMissing = new Set(
            roster
                .filter((p) => p.unavailableEventIds.includes(eventId))
                .map((p) => p.userId)
        )
        setSelectedMissingUserIds(defaultMissing)
        setRegularError(null)
        setRegularResult(null)
    }

    function handleToggleMissing(userId: string) {
        setSelectedMissingUserIds((prev) => {
            const next = new Set(prev)
            if (next.has(userId)) {
                next.delete(userId)
            } else {
                next.add(userId)
            }
            return next
        })
        setRegularResult(null)
        setRegularError(null)
    }

    function handleFindSub() {
        if (!selectedEventId) return
        setRegularError(null)
        setRegularResult(null)
        startRegularTransition(async () => {
            const result = await getRegularSubCandidates(
                teamId,
                parseInt(selectedEventId, 10),
                Array.from(selectedMissingUserIds)
            )
            if (result.status) {
                setRegularResult({
                    candidates: result.candidates,
                    nonMaleNeeded: result.nonMaleNeeded,
                    missingCount: result.missingCount,
                    missingPlayers: result.missingPlayers
                })
            } else {
                setRegularError(result.message)
            }
        })
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Find a Regular Sub</CardTitle>
                <CardDescription>
                    Select a date, pick who will be out, then find available
                    players from the same division at an adjacent time slot.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {futureEvents.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                        No upcoming game dates.
                    </p>
                ) : (
                    <>
                        <Select
                            value={selectedEventId}
                            onValueChange={handleEventChange}
                            disabled={isPendingRegular}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select a date…" />
                            </SelectTrigger>
                            <SelectContent>
                                {futureEvents.map((e) => {
                                    const matchTime =
                                        teamMatchTimeByEventDate[e.eventDate] ??
                                        null
                                    return (
                                        <SelectItem
                                            key={e.id}
                                            value={e.id.toString()}
                                        >
                                            {formatDate(e.eventDate)}
                                            {matchTime
                                                ? ` — ${formatMatchTime(matchTime)}`
                                                : ""}
                                            {e.eventType === "playoff"
                                                ? " (Playoff)"
                                                : ""}
                                        </SelectItem>
                                    )
                                })}
                            </SelectContent>
                        </Select>

                        {selectedEventId && (
                            <>
                                <div>
                                    <p className="mb-2 font-medium text-sm">
                                        Who will be out?
                                    </p>
                                    <div className="space-y-0.5">
                                        {roster.map((player) => {
                                            const isOut =
                                                selectedMissingUserIds.has(
                                                    player.userId
                                                )
                                            return (
                                                <button
                                                    key={player.userId}
                                                    type="button"
                                                    onClick={() =>
                                                        handleToggleMissing(
                                                            player.userId
                                                        )
                                                    }
                                                    disabled={isPendingRegular}
                                                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
                                                >
                                                    {isOut ? (
                                                        <RiCloseCircleFill className="h-4 w-4 shrink-0 text-red-500" />
                                                    ) : (
                                                        <RiCheckboxCircleLine className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                    )}
                                                    <span
                                                        className={
                                                            isOut
                                                                ? "text-red-600"
                                                                : ""
                                                        }
                                                    >
                                                        {displayName(player)}
                                                    </span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                                <Button
                                    type="button"
                                    onClick={handleFindSub}
                                    disabled={
                                        isPendingRegular ||
                                        selectedMissingUserIds.size === 0
                                    }
                                    className="w-full"
                                >
                                    Find Sub
                                </Button>
                            </>
                        )}

                        {isPendingRegular && (
                            <p className="text-muted-foreground text-sm">
                                Searching for substitutes…
                            </p>
                        )}

                        {regularError && (
                            <p className="text-destructive text-sm">
                                {regularError}
                            </p>
                        )}

                        {!isPendingRegular && regularResult && (
                            <div className="space-y-3">
                                {regularResult.nonMaleNeeded && (
                                    <Badge
                                        variant="destructive"
                                        className="text-xs"
                                    >
                                        Non-male substitute needed
                                    </Badge>
                                )}
                                {regularResult.missingPlayers.length > 0 && (
                                    <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                                        <span className="font-medium">
                                            Missing:{" "}
                                        </span>
                                        {regularResult.missingPlayers
                                            .map(
                                                (p) =>
                                                    `${p.name} (Rd ${p.round})`
                                            )
                                            .join(", ")}
                                    </div>
                                )}
                                {regularResult.candidates.length === 0 && (
                                    <p className="text-muted-foreground text-sm">
                                        No available substitutes found for this
                                        date.
                                    </p>
                                )}
                                {regularResult.candidates.map((c, i) => (
                                    <RegularCandidateRow
                                        key={c.userId}
                                        candidate={c}
                                        rank={i + 1}
                                        nonMaleNeeded={
                                            regularResult.nonMaleNeeded
                                        }
                                        canLockIn={
                                            selectedMissingUserIds.size === 1
                                        }
                                        onOpenDetail={onOpenDetail}
                                        onOpenContact={onOpenContact}
                                        onLockIn={() =>
                                            handleOpenRegularLock(c)
                                        }
                                        onRequestSub={() =>
                                            handleOpenRequestSub(c)
                                        }
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    )
}
