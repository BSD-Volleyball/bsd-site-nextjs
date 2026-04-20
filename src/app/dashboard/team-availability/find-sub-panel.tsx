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
import {
    usePlayerDetailModal,
    PlayerDetailPopup
} from "@/components/player-detail"
import { getPlayerDetailsPublic } from "@/app/dashboard/view-signups/actions"
import {
    getRegularSubCandidates,
    getPermanentSubCandidates,
    getSubContactDetails,
    logSubContactViewed
} from "./find-sub-actions"
import type {
    RegularSubCandidate,
    PermanentSubCandidate,
    SubContactDetails
} from "./find-sub-actions"
import type { RosterPlayer, EventInfo, SeasonInfo } from "./actions"
import {
    RiAlertLine,
    RiCloseLine,
    RiPhoneLine,
    RiMailLine,
    RiCloseCircleFill,
    RiCheckboxCircleLine
} from "@remixicon/react"

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
    futureEvents: EventInfo[]
    roster: RosterPlayer[]
    allSeasons: SeasonInfo[]
    playerPicUrl: string
    teamMatchTimeByEventDate: Record<string, string | null>
}

export function FindSubPanel({
    teamId,
    futureEvents,
    roster,
    allSeasons,
    playerPicUrl,
    teamMatchTimeByEventDate
}: FindSubPanelProps) {
    // Player detail modal
    const modal = usePlayerDetailModal({ fetchFn: getPlayerDetailsPublic })

    // Contact details state
    const [contactWarningTarget, setContactWarningTarget] = useState<{
        userId: string
        name: string
    } | null>(null)
    const [contactDetails, setContactDetails] = useState<{
        userId: string
        name: string
        data: SubContactDetails
    } | null>(null)
    const [isLoadingContact, setIsLoadingContact] = useState(false)

    async function handleAcknowledgeContact() {
        if (!contactWarningTarget) return
        setIsLoadingContact(true)
        try {
            await logSubContactViewed(
                teamId,
                contactWarningTarget.userId,
                contactWarningTarget.name
            )
            const result = await getSubContactDetails(
                contactWarningTarget.userId,
                teamId
            )
            if (result.status) {
                setContactDetails({
                    userId: contactWarningTarget.userId,
                    name: contactWarningTarget.name,
                    data: result.contact
                })
            }
        } catch (err) {
            console.error("Failed to load contact details", err)
        } finally {
            setIsLoadingContact(false)
            setContactWarningTarget(null)
        }
    }

    function handleOpenContactWarning(userId: string, name: string) {
        setContactDetails(null)
        setContactWarningTarget({ userId, name })
    }

    function handleCloseContactWarning() {
        setContactWarningTarget(null)
    }

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
                                            teamMatchTimeByEventDate[
                                                e.eventDate
                                            ] ?? null
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
                                                        disabled={
                                                            isPendingRegular
                                                        }
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
                                                            {displayName(
                                                                player
                                                            )}
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
                                    {regularResult.missingPlayers.length >
                                        0 && (
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
                                            No available substitutes found for
                                            this date.
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
                                            onOpenContact={
                                                handleOpenContactWarning
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
                                        onOpenContact={handleOpenContactWarning}
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

            {/* Contact info warning modal */}
            {contactWarningTarget && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                    onClick={handleCloseContactWarning}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") handleCloseContactWarning()
                    }}
                    role="dialog"
                    aria-modal="true"
                    tabIndex={-1}
                >
                    <div
                        className="relative w-full max-w-md rounded-lg bg-background p-6 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        role="document"
                    >
                        <button
                            type="button"
                            onClick={handleCloseContactWarning}
                            className="absolute top-3 right-3 z-10 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <RiCloseLine className="h-5 w-5" />
                        </button>
                        <div className="mb-5 flex items-start gap-3">
                            <RiAlertLine className="mt-0.5 h-6 w-6 shrink-0 text-amber-500" />
                            <div>
                                <h3 className="mb-2 font-semibold text-lg">
                                    Contact Information Notice
                                </h3>
                                <p className="text-muted-foreground text-sm">
                                    This contact information should only be used
                                    exclusively for BSD Volleyball League
                                    purposes. If you would like to contact
                                    someone for any other purpose, please ask
                                    them for their contact details directly in
                                    person.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleCloseContactWarning}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={handleAcknowledgeContact}
                                disabled={isLoadingContact}
                            >
                                Acknowledge &amp; View Details
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Contact details modal */}
            {contactDetails && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                    onClick={() => setContactDetails(null)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") setContactDetails(null)
                    }}
                    role="dialog"
                    aria-modal="true"
                    tabIndex={-1}
                >
                    <div
                        className="relative w-full max-w-sm rounded-lg bg-background p-6 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        role="document"
                    >
                        <button
                            type="button"
                            onClick={() => setContactDetails(null)}
                            className="absolute top-3 right-3 z-10 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <RiCloseLine className="h-5 w-5" />
                        </button>
                        <h3 className="mb-4 font-semibold text-lg">
                            {contactDetails.name}
                        </h3>
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm">
                                <RiMailLine className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <a
                                    href={`mailto:${contactDetails.data.email}`}
                                    className="hover:underline"
                                >
                                    {contactDetails.data.email}
                                </a>
                            </div>
                            {contactDetails.data.phone && (
                                <div className="flex items-center gap-2 text-sm">
                                    <RiPhoneLine className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <a
                                        href={`tel:${contactDetails.data.phone}`}
                                        className="hover:underline"
                                    >
                                        {contactDetails.data.phone}
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
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
    onOpenDetail,
    onOpenContact
}: {
    candidate: RegularSubCandidate
    rank: number
    nonMaleNeeded: boolean
    onOpenDetail: (userId: string) => void
    onOpenContact: (userId: string, name: string) => void
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
                        {genderLabel(c.male) ? ` (${genderLabel(c.male)})` : ""}
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
                </p>
                {c.matchTime && (
                    <p className="text-muted-foreground text-xs">
                        Their match: {formatMatchTime(c.matchTime)}
                    </p>
                )}
                {c.notes.length > 0 && (
                    <p className="mt-0.5 text-muted-foreground/70 text-xs">
                        {c.notes.map((note, i) => (
                            <span key={note}>
                                {i > 0 && " · "}
                                <span
                                    className={
                                        note === "Adjacent time slot"
                                            ? "font-medium text-green-600 dark:text-green-400"
                                            : undefined
                                    }
                                >
                                    {note}
                                </span>
                            </span>
                        ))}
                    </p>
                )}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 h-6 px-2 text-xs"
                    onClick={() => onOpenContact(c.userId, name)}
                >
                    Contact Info
                </Button>
            </div>
        </div>
    )
}

function PermanentCandidateRow({
    candidate: c,
    rank,
    onOpenDetail,
    onOpenContact
}: {
    candidate: PermanentSubCandidate
    rank: number
    onOpenDetail: (userId: string) => void
    onOpenContact: (userId: string, name: string) => void
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
                        {genderLabel(c.male) ? ` (${genderLabel(c.male)})` : ""}
                    </button>
                </div>
                {c.lastDivisionName ? (
                    <p className="text-muted-foreground text-xs">
                        Last played: {c.lastDivisionName}
                        {c.lastSeasonLabel ? ` (${c.lastSeasonLabel})` : ""}
                    </p>
                ) : (
                    <p className="text-muted-foreground text-xs">
                        No prior season history
                    </p>
                )}
                {c.lastRound != null && (
                    <p className="text-muted-foreground text-xs">
                        Previously drafted: Round {c.lastRound}
                    </p>
                )}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 h-6 px-2 text-xs"
                    onClick={() => onOpenContact(c.userId, name)}
                >
                    Contact Info
                </Button>
            </div>
        </div>
    )
}
