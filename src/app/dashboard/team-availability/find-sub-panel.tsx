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
import {
    usePlayerDetailModal,
    PlayerDetailPopup
} from "@/components/player-detail"
import { getPlayerDetailsPublic } from "@/app/dashboard/view-signups/actions"
import {
    getRegularSubCandidates,
    getPermanentSubCandidates
} from "./find-sub-actions"
import type {
    RegularSubCandidate,
    PermanentSubCandidate
} from "./find-sub-actions"
import type { RosterPlayer, EventInfo, SeasonInfo } from "./actions"

function formatMatchTime(timeStr: string | null): string {
    if (!timeStr) return ""
    const parts = timeStr.split(":")
    if (parts.length < 2) return timeStr
    const h = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10)
    if (Number.isNaN(h) || Number.isNaN(m)) return timeStr
    const ampm = h >= 12 ? "PM" : "AM"
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h
    return `${displayH}:${m.toString().padStart(2, "0")} ${ampm}`
}

function displayName(player: {
    firstName: string
    lastName: string
    preferredName: string | null
}) {
    return player.preferredName
        ? `${player.preferredName} ${player.lastName}`
        : `${player.firstName} ${player.lastName}`
}

function formatDate(dateStr: string): string {
    const date = new Date(`${dateStr}T00:00:00`)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

type FindSubPanelProps = {
    teamId: number
    redEvents: EventInfo[]
    roster: RosterPlayer[]
    allSeasons: SeasonInfo[]
    playerPicUrl: string
}

export function FindSubPanel({
    teamId,
    redEvents,
    roster,
    allSeasons,
    playerPicUrl
}: FindSubPanelProps) {
    // Player detail modal
    const modal = usePlayerDetailModal({ fetchFn: getPlayerDetailsPublic })

    // Regular sub state
    const [selectedEventId, setSelectedEventId] = useState<string>("")
    const [regularResult, setRegularResult] = useState<{
        candidates: RegularSubCandidate[]
        nonMaleNeeded: boolean
        missingCount: number
    } | null>(null)
    const [regularError, setRegularError] = useState<string | null>(null)
    const [isPendingRegular, startRegularTransition] = useTransition()

    // Permanent sub state
    const [selectedPlayerId, setSelectedPlayerId] = useState<string>("")
    const [permanentResult, setPermanentResult] = useState<{
        candidates: PermanentSubCandidate[]
        replacedPlayerName: string
    } | null>(null)
    const [permanentError, setPermanentError] = useState<string | null>(null)
    const [isPendingPermanent, startPermanentTransition] = useTransition()

    function handleEventChange(eventIdStr: string) {
        setSelectedEventId(eventIdStr)
        setRegularError(null)
        setRegularResult(null)
        startRegularTransition(async () => {
            const result = await getRegularSubCandidates(
                teamId,
                parseInt(eventIdStr, 10)
            )
            if (result.status) {
                setRegularResult({
                    candidates: result.candidates,
                    nonMaleNeeded: result.nonMaleNeeded,
                    missingCount: result.missingCount
                })
            } else {
                setRegularError(result.message)
            }
        })
    }

    function handlePlayerChange(userId: string) {
        setSelectedPlayerId(userId)
        setPermanentError(null)
        setPermanentResult(null)
        startPermanentTransition(async () => {
            const result = await getPermanentSubCandidates(teamId, userId)
            if (result.status) {
                setPermanentResult({
                    candidates: result.candidates,
                    replacedPlayerName: result.replacedPlayerName
                })
            } else {
                setPermanentError(result.message)
            }
        })
    }

    return (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
            {/* Regular Sub Finder */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Find a Regular Sub
                    </CardTitle>
                    <CardDescription>
                        Suggests available players from the same division at an
                        adjacent time slot for dates when your team is short.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {redEvents.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            No dates currently need a substitute.
                        </p>
                    ) : (
                        <>
                            <Select
                                value={selectedEventId}
                                onValueChange={handleEventChange}
                                disabled={isPendingRegular}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a date needing a sub…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {redEvents.map((e) => (
                                        <SelectItem
                                            key={e.id}
                                            value={e.id.toString()}
                                        >
                                            {formatDate(e.eventDate)}
                                            {e.eventType === "playoff"
                                                ? " (Playoff)"
                                                : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

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
                                    {regularResult.missingCount === 0 && (
                                        <p className="text-muted-foreground text-sm">
                                            No players are marked unavailable
                                            for this date.
                                        </p>
                                    )}
                                    {regularResult.missingCount > 0 &&
                                        regularResult.candidates.length ===
                                            0 && (
                                            <p className="text-muted-foreground text-sm">
                                                No available substitutes found
                                                for this date.
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
                                            onOpenDetail={
                                                modal.openPlayerDetail
                                            }
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Permanent Sub Finder */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Find a Permanent Sub
                    </CardTitle>
                    <CardDescription>
                        Suggests waitlisted players of the same gender who most
                        recently played in the same division when a rostered
                        player can no longer play the season.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Select
                        value={selectedPlayerId}
                        onValueChange={handlePlayerChange}
                        disabled={isPendingPermanent}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select player to replace…" />
                        </SelectTrigger>
                        <SelectContent>
                            {roster.map((p) => (
                                <SelectItem key={p.userId} value={p.userId}>
                                    {displayName(p)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {isPendingPermanent && (
                        <p className="text-muted-foreground text-sm">
                            Searching waitlist…
                        </p>
                    )}

                    {permanentError && (
                        <p className="text-destructive text-sm">
                            {permanentError}
                        </p>
                    )}

                    {!isPendingPermanent && permanentResult && (
                        <div className="space-y-3">
                            {permanentResult.candidates.length === 0 ? (
                                <p className="text-muted-foreground text-sm">
                                    No waitlisted players found matching the
                                    gender of{" "}
                                    {permanentResult.replacedPlayerName}.
                                </p>
                            ) : (
                                permanentResult.candidates.map((c, i) => (
                                    <PermanentCandidateRow
                                        key={c.userId}
                                        candidate={c}
                                        rank={i + 1}
                                        onOpenDetail={modal.openPlayerDetail}
                                    />
                                ))
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

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
                datesMissing={modal.unavailableDates}
                playoffDates={modal.playoffDates}
                ratingAverages={modal.ratingAverages}
                sharedRatingNotes={modal.sharedRatingNotes}
                privateRatingNotes={modal.privateRatingNotes}
                viewerRating={modal.viewerRating}
            />
        </div>
    )
}

function genderLabel(male: boolean | null): string | null {
    if (male === true) return "Male"
    if (male === false) return "Non-male"
    return null
}

function RegularCandidateRow({
    candidate: c,
    rank,
    nonMaleNeeded,
    onOpenDetail
}: {
    candidate: RegularSubCandidate
    rank: number
    nonMaleNeeded: boolean
    onOpenDetail: (userId: string) => void
}) {
    const name = c.preferredName
        ? `${c.preferredName} ${c.lastName}`
        : `${c.firstName} ${c.lastName}`
    return (
        <div className="flex items-start gap-3 rounded-md border p-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-xs">
                {rank}
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => onOpenDetail(c.userId)}
                        className="font-medium text-sm hover:underline"
                    >
                        {name}
                    </button>
                    {nonMaleNeeded && c.male !== true && (
                        <Badge variant="secondary" className="text-xs">
                            Non-male
                        </Badge>
                    )}
                    {nonMaleNeeded && c.male === true && (
                        <Badge variant="outline" className="text-xs">
                            Male
                        </Badge>
                    )}
                </div>
                <p className="text-muted-foreground text-xs">
                    {c.teamName}
                    {c.teamNumber != null ? ` (#${c.teamNumber})` : ""} &mdash;{" "}
                    {c.divisionName}
                </p>
                <p className="text-muted-foreground text-xs">
                    Round {c.round}, Pick {c.overall}
                    {c.matchTime
                        ? ` · Their match: ${formatMatchTime(c.matchTime)}`
                        : ""}
                    {genderLabel(c.male) ? ` · ${genderLabel(c.male)}` : ""}
                </p>
                {c.notes.length > 0 && (
                    <p className="mt-0.5 text-muted-foreground/70 text-xs">
                        {c.notes.join(" · ")}
                    </p>
                )}
            </div>
        </div>
    )
}

function PermanentCandidateRow({
    candidate: c,
    rank,
    onOpenDetail
}: {
    candidate: PermanentSubCandidate
    rank: number
    onOpenDetail: (userId: string) => void
}) {
    const name = c.preferredName
        ? `${c.preferredName} ${c.lastName}`
        : `${c.firstName} ${c.lastName}`
    return (
        <div className="flex items-start gap-3 rounded-md border p-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-xs">
                {rank}
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => onOpenDetail(c.userId)}
                        className="font-medium text-sm hover:underline"
                    >
                        {name}
                    </button>
                    {c.approved ? (
                        <Badge variant="secondary" className="text-xs">
                            Approved
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="text-xs">
                            Pending Approval
                        </Badge>
                    )}
                </div>
                {c.lastDivisionName ? (
                    <p className="text-muted-foreground text-xs">
                        Last played: {c.lastDivisionName}
                        {c.lastSeasonLabel ? ` (${c.lastSeasonLabel})` : ""}
                        {genderLabel(c.male) ? ` · ${genderLabel(c.male)}` : ""}
                    </p>
                ) : (
                    <p className="text-muted-foreground text-xs">
                        No prior season history
                        {genderLabel(c.male) ? ` · ${genderLabel(c.male)}` : ""}
                    </p>
                )}
                {c.lastOverall != null && (
                    <p className="text-muted-foreground text-xs">
                        Previously drafted: Overall pick {c.lastOverall}
                    </p>
                )}
            </div>
        </div>
    )
}
