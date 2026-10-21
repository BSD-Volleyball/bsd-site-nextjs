"use client"

import { useEffect, useId, useState } from "react"
import { StatusBanner } from "@/components/ui/status-banner"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import {
    usePlayerDetailModal,
    PlayerDetailPopup
} from "@/components/player-detail"
import { DraftTeamGrid } from "@/components/draft-board/draft-team-card"
import { getPlayerDetailsPublic } from "@/app/dashboard/view-signups/actions"
import type { DivisionOption, DraftTeam } from "@/lib/draft-results"
import { getDraftBoard } from "./actions"

interface DraftBoardClientProps {
    divisions: DivisionOption[]
    playerPicUrl: string
}

export function DraftBoardClient({
    divisions,
    playerPicUrl
}: DraftBoardClientProps) {
    // With a single division there is nothing to choose.
    const [selectedDivision, setSelectedDivision] = useState<string>(
        divisions.length === 1 ? String(divisions[0].id) : ""
    )
    const [draftTeams, setDraftTeams] = useState<DraftTeam[]>([])
    const [loadingDraft, setLoadingDraft] = useState(false)
    const [errorMessage, setErrorMessage] = useState("")
    const divisionSelectId = useId()

    const modal = usePlayerDetailModal({ fetchFn: getPlayerDetailsPublic })

    useEffect(() => {
        if (!selectedDivision) return

        setLoadingDraft(true)
        setErrorMessage("")
        getDraftBoard(Number(selectedDivision))
            .then((result) => {
                if (result.status) {
                    setDraftTeams(result.data)
                } else {
                    setErrorMessage(
                        result.message ?? "Failed to load draft results"
                    )
                    setDraftTeams([])
                }
            })
            .finally(() => setLoadingDraft(false))
    }, [selectedDivision])

    return (
        <div className="space-y-6">
            {divisions.length > 1 && (
                <div className="w-48">
                    <Label
                        htmlFor={divisionSelectId}
                        className="mb-1 block font-medium text-muted-foreground text-sm"
                    >
                        Division
                    </Label>
                    <Select
                        value={selectedDivision}
                        onValueChange={setSelectedDivision}
                    >
                        <SelectTrigger id={divisionSelectId}>
                            <SelectValue placeholder="Select division" />
                        </SelectTrigger>
                        <SelectContent>
                            {divisions.map((d) => (
                                <SelectItem key={d.id} value={String(d.id)}>
                                    {d.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {divisions.length === 1 && (
                <p className="font-medium text-lg">{divisions[0].name}</p>
            )}

            {errorMessage && (
                <StatusBanner variant="error">{errorMessage}</StatusBanner>
            )}

            {loadingDraft && (
                <p className="text-muted-foreground">Loading draft results…</p>
            )}

            {!loadingDraft &&
                selectedDivision &&
                draftTeams.length === 0 &&
                !errorMessage && (
                    <p className="text-muted-foreground">
                        No draft results found for this division yet.
                    </p>
                )}

            {draftTeams.length > 0 && (
                <DraftTeamGrid
                    teams={draftTeams}
                    onPlayerClick={modal.openPlayerDetail}
                />
            )}

            <PlayerDetailPopup
                open={!!modal.selectedUserId}
                onClose={modal.closePlayerDetail}
                playerDetails={modal.playerDetails}
                draftHistory={modal.draftHistory}
                allSeasons={[]}
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
