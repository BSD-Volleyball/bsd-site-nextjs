"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    usePlayerDetailModal,
    PlayerDetailPopup
} from "@/components/player-detail"
import { getPlayerDetailsPublic } from "@/app/dashboard/view-signups/actions"
import {
    getPermanentSubCandidates,
    getSubContactDetails,
    logSubContactViewed,
    lockInPermanentSub,
    lockInRegularSub,
    getWaitlistOptions
} from "./find-sub-actions"
import type {
    PermanentSubCandidate,
    SubContactDetails,
    WaitlistOption
} from "./find-sub-actions"
import type {
    RosterPlayer,
    EventInfo,
    SeasonInfo,
    DateMatchInfo
} from "./actions"
import { displayName } from "./find-sub-helpers"
import type {
    RegularLockTarget,
    PermanentLockTarget,
    SubRequestTarget
} from "./find-sub-helpers"
import { RegularSubCard } from "./regular-sub-card"
import { PermanentSubCard } from "./permanent-sub-card"
import { createSubRequest } from "./sub-request-actions"
import {
    ContactWarningModal,
    ContactDetailsModal,
    RegularLockModal,
    PermanentLockModal,
    RequestSubModal
} from "./find-sub-modals"

type FindSubPanelProps = {
    teamId: number
    futureEvents: EventInfo[]
    roster: RosterPlayer[]
    allSeasons: SeasonInfo[]
    playerPicUrl: string
    teamMatchTimeByEventDate: Record<string, string | null>
    dateMatchInfo: Record<string, DateMatchInfo>
    canLockInPermanent: boolean
    canSeeFullWaitlist: boolean
    eventDateById: Record<number, string>
}

export function FindSubPanel({
    teamId,
    futureEvents,
    roster,
    allSeasons,
    playerPicUrl,
    teamMatchTimeByEventDate,
    dateMatchInfo,
    canLockInPermanent,
    canSeeFullWaitlist,
    eventDateById
}: FindSubPanelProps) {
    const router = useRouter()
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

    // Permanent sub state
    const [selectedPlayerId, setSelectedPlayerId] = useState<string>("")
    const [permanentResult, setPermanentResult] = useState<{
        candidates: PermanentSubCandidate[]
        replacedPlayerName: string
    } | null>(null)
    const [permanentError, setPermanentError] = useState<string | null>(null)
    const [isPendingPermanent, startPermanentTransition] = useTransition()

    // Full waitlist (Other dropdown) — only fetched for elevated viewers.
    const [waitlistOptions, setWaitlistOptions] = useState<
        WaitlistOption[] | null
    >(null)
    const [otherWaitlistUserId, setOtherWaitlistUserId] = useState<string>("")

    useEffect(() => {
        if (!canSeeFullWaitlist) return
        let cancelled = false
        ;(async () => {
            const result = await getWaitlistOptions(teamId)
            if (!cancelled && result.status) setWaitlistOptions(result.data)
        })()
        return () => {
            cancelled = true
        }
    }, [canSeeFullWaitlist, teamId])

    // Sub-request state
    const [requestTarget, setRequestTarget] = useState<SubRequestTarget | null>(
        null
    )
    const [requestMessage, setRequestMessage] = useState("")
    const [requestError, setRequestError] = useState<string | null>(null)
    const [isSendingRequest, setIsSendingRequest] = useState(false)

    // Lock-in confirmation state
    const [regularLockTarget, setRegularLockTarget] =
        useState<RegularLockTarget | null>(null)
    const [permanentLockTarget, setPermanentLockTarget] =
        useState<PermanentLockTarget | null>(null)
    const [lockNotes, setLockNotes] = useState("")
    const [lockReason, setLockReason] = useState("")
    const [lockError, setLockError] = useState<string | null>(null)
    const [isLocking, setIsLocking] = useState(false)

    // Active player roster — UI restricts permanent-sub target dropdown
    // to currently-active players (so admins can't accidentally try to
    // sub someone who's already been subbed out).
    const activeRoster = roster.filter((p) => !p.isSubbedOut)

    function handleOpenRegularLock(target: RegularLockTarget) {
        setLockError(null)
        setLockNotes("")
        setRegularLockTarget(target)
    }

    function handleOpenRequestSub(target: SubRequestTarget) {
        setRequestError(null)
        setRequestMessage("")
        setRequestTarget(target)
    }

    async function handleConfirmRequestSub() {
        if (!requestTarget) return
        setIsSendingRequest(true)
        setRequestError(null)
        const result = await createSubRequest({
            teamId,
            matchId: requestTarget.matchId,
            originalUserId: requestTarget.originalUserId,
            targetUserId: requestTarget.subUserId,
            message: requestMessage.trim() || undefined
        })
        setIsSendingRequest(false)
        if (!result.status) {
            setRequestError(result.message)
            return
        }
        setRequestTarget(null)
        setRequestMessage("")
        toast.success(result.message ?? "Sub request sent.")
        router.refresh()
    }

    function handleOpenPermanentLock(args: { userId: string; name: string }) {
        if (!selectedPlayerId) return
        const original = roster.find((p) => p.userId === selectedPlayerId)
        if (!original) return
        setLockError(null)
        setLockNotes("")
        setLockReason("")
        setPermanentLockTarget({
            originalUserId: original.userId,
            originalName: displayName(original),
            subUserId: args.userId,
            subName: args.name
        })
    }

    async function handleConfirmRegularLock() {
        if (!regularLockTarget) return
        setIsLocking(true)
        setLockError(null)
        const result = await lockInRegularSub({
            teamId,
            matchId: regularLockTarget.matchId,
            originalUserId: regularLockTarget.originalUserId,
            subUserId: regularLockTarget.subUserId,
            notes: lockNotes.trim() || undefined
        })
        setIsLocking(false)
        if (!result.status) {
            setLockError(result.message)
            return
        }
        setRegularLockTarget(null)
        setLockNotes("")
        // Refresh server data so new sub is reflected on the matrix.
        router.refresh()
    }

    async function handleConfirmPermanentLock() {
        if (!permanentLockTarget) return
        setIsLocking(true)
        setLockError(null)
        const result = await lockInPermanentSub({
            teamId,
            originalUserId: permanentLockTarget.originalUserId,
            subUserId: permanentLockTarget.subUserId,
            reason: lockReason.trim() || undefined,
            notes: lockNotes.trim() || undefined
        })
        setIsLocking(false)
        if (!result.status) {
            setLockError(result.message)
            return
        }
        setPermanentLockTarget(null)
        setLockNotes("")
        setLockReason("")
        setSelectedPlayerId("")
        setPermanentResult(null)
        setOtherWaitlistUserId("")
        // Refresh waitlist options (sub-in user just consumed their row).
        const refresh = await getWaitlistOptions(teamId)
        if (refresh.status) setWaitlistOptions(refresh.data)
        router.refresh()
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
            <RegularSubCard
                teamId={teamId}
                futureEvents={futureEvents}
                roster={roster}
                teamMatchTimeByEventDate={teamMatchTimeByEventDate}
                dateMatchInfo={dateMatchInfo}
                eventDateById={eventDateById}
                onOpenDetail={modal.openPlayerDetail}
                onOpenContact={handleOpenContactWarning}
                onLockInvalid={setLockError}
                onOpenLock={handleOpenRegularLock}
                onOpenRequest={handleOpenRequestSub}
            />

            {/* Permanent Sub Finder */}
            <PermanentSubCard
                activeRoster={activeRoster}
                selectedPlayerId={selectedPlayerId}
                onPlayerChange={handlePlayerChange}
                isPending={isPendingPermanent}
                error={permanentError}
                result={permanentResult}
                canLockInPermanent={canLockInPermanent}
                canSeeFullWaitlist={canSeeFullWaitlist}
                waitlistOptions={waitlistOptions}
                otherWaitlistUserId={otherWaitlistUserId}
                onOtherWaitlistChange={setOtherWaitlistUserId}
                onOpenDetail={modal.openPlayerDetail}
                onOpenContact={handleOpenContactWarning}
                onOpenLock={handleOpenPermanentLock}
            />

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
                <ContactWarningModal
                    onClose={handleCloseContactWarning}
                    onAcknowledge={handleAcknowledgeContact}
                    isLoading={isLoadingContact}
                />
            )}

            {/* Sub request modal */}
            {requestTarget && (
                <RequestSubModal
                    target={requestTarget}
                    message={requestMessage}
                    onMessageChange={setRequestMessage}
                    requestError={requestError}
                    isSending={isSendingRequest}
                    onCancel={() => setRequestTarget(null)}
                    onConfirm={handleConfirmRequestSub}
                />
            )}

            {/* Regular sub lock-in modal */}
            {regularLockTarget && (
                <RegularLockModal
                    target={regularLockTarget}
                    lockNotes={lockNotes}
                    onNotesChange={setLockNotes}
                    lockError={lockError}
                    isLocking={isLocking}
                    onCancel={() => setRegularLockTarget(null)}
                    onConfirm={handleConfirmRegularLock}
                />
            )}

            {/* Permanent sub lock-in modal */}
            {permanentLockTarget && (
                <PermanentLockModal
                    target={permanentLockTarget}
                    lockNotes={lockNotes}
                    onNotesChange={setLockNotes}
                    lockReason={lockReason}
                    onReasonChange={setLockReason}
                    lockError={lockError}
                    isLocking={isLocking}
                    onCancel={() => setPermanentLockTarget(null)}
                    onConfirm={handleConfirmPermanentLock}
                />
            )}

            {/* Contact details modal */}
            {contactDetails && (
                <ContactDetailsModal
                    name={contactDetails.name}
                    contact={contactDetails.data}
                    onClose={() => setContactDetails(null)}
                />
            )}
        </div>
    )
}
