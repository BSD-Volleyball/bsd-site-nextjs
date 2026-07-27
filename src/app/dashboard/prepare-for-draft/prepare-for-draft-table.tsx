"use client"

import { useState, useCallback, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { PrepareForDraftData } from "./actions"
import { setCaptainRound, setPairDiff } from "./actions"
import type { DraftHomeworkDetailResult } from "@/app/dashboard/homework-status/actions"
import { getDraftHomeworkDetail } from "@/app/dashboard/homework-status/actions"
import { CaptainHomeworkPopup } from "@/components/captain-homework-popup"
import {
    usePlayerDetailModal,
    PlayerDetailPopup
} from "@/components/player-detail"
import { Button } from "@/components/ui/button"
import { CaptainEmailModal } from "./captain-email-modal"
import { ConsideredUndraftedSection } from "./considered-undrafted-section"
import { clampRound } from "./draft-round-utils"
import { PairRoundsSection } from "./pair-rounds-section"
import { PlayerRoundTable } from "./player-round-table"

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
    const [showEmailModal, setShowEmailModal] = useState(false)
    const [homeworkPopupOpen, setHomeworkPopupOpen] = useState(false)
    const [homeworkData, setHomeworkData] =
        useState<DraftHomeworkDetailResult | null>(null)
    const [, startHomeworkTransition] = useTransition()

    const handleCaptainNameClick = (captainUserId: string) => {
        setHomeworkPopupOpen(true)
        setHomeworkData(null)
        startHomeworkTransition(async () => {
            const result = await getDraftHomeworkDetail(
                captainUserId,
                data.seasonId
            )
            setHomeworkData(result)
        })
    }

    const hasHomework = data.players.length > 0
    const captainIds = new Set(data.captains.map((c) => c.userId))

    const handleSetCaptainRound = (userId: string, v: number) => {
        setCaptainRoundOverrides((prev) => ({
            ...prev,
            [userId]: v
        }))
        setSaveStatus("idle")
    }

    const handleSetPairDiff = (pairKey: string, v: number) => {
        setPairDiffOverrides((prev) => ({
            ...prev,
            [pairKey]: v
        }))
        setSaveStatus("idle")
    }

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
                const pairKey = `${pair.player1UserId}:${pair.player2UserId}`
                const pinnedUnrated = pair.captainIsLower
                    ? pair.player1Round === 9
                    : pair.player2Round === 9
                const pinnedRound = pair.captainIsLower
                    ? pair.player1Round
                    : pair.player2Round
                const defaultDiff = pinnedUnrated ? 8 : clampRound(pinnedRound)
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

    const handleGenerateMessage = () => {
        setShowEmailModal(true)
    }

    const handleCloseEmailModal = useCallback(() => {
        setShowEmailModal(false)
    }, [])

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

            <PlayerRoundTable
                data={data}
                captainIds={captainIds}
                captainRoundOverrides={captainRoundOverrides}
                onSetRound={handleSetCaptainRound}
                onCaptainNameClick={handleCaptainNameClick}
                onOpenDetail={modal.openPlayerDetail}
            />

            {(data.teams.length > 0 || data.pairDifferentials.length > 0) && (
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

            <PairRoundsSection
                data={data}
                pairDiffOverrides={pairDiffOverrides}
                onSetPairDiff={handleSetPairDiff}
                onOpenDetail={modal.openPlayerDetail}
            />

            {(data.teams.length > 0 || data.pairDifferentials.length > 0) && (
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

            {data.captains.length > 0 && data.emailTemplate && (
                <div className="flex items-center gap-4 pt-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleGenerateMessage}
                    >
                        Generate Message ({data.captains.length} captains)
                    </Button>
                </div>
            )}

            <ConsideredUndraftedSection
                data={data}
                onOpenDetail={modal.openPlayerDetail}
            />

            {showEmailModal && (
                <CaptainEmailModal
                    data={data}
                    captainRoundOverrides={captainRoundOverrides}
                    pairDiffOverrides={pairDiffOverrides}
                    onClose={handleCloseEmailModal}
                />
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
                datesMissing={modal.unavailableDates}
                playoffDates={modal.playoffDates}
                ratingAverages={modal.ratingAverages}
                sharedRatingNotes={modal.sharedRatingNotes}
                privateRatingNotes={modal.privateRatingNotes}
                viewerRating={modal.viewerRating}
            />

            <CaptainHomeworkPopup
                open={homeworkPopupOpen}
                onClose={() => setHomeworkPopupOpen(false)}
                data={homeworkData}
                isLoading={!homeworkData && homeworkPopupOpen}
                playerPicUrl={playerPicUrl}
            />
        </div>
    )
}
