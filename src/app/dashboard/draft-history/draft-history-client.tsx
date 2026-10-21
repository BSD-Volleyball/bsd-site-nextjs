"use client"

import { StatusBanner } from "@/components/ui/status-banner"
import { Label } from "@/components/ui/label"
import { useCallback, useEffect, useId, useState } from "react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { usePlayerDetailModal } from "@/components/player-detail/use-player-detail-modal"
import { AdminPlayerDetailPopup } from "@/components/player-detail/admin-player-detail-popup"
import { DraftTeamGrid } from "@/components/draft-board/draft-team-card"
import type { DivisionOption, DraftTeam } from "@/lib/draft-results"
import {
    getSeasonsForYear,
    getDivisionsForSeason,
    getDraftResults
} from "./actions"
import type { SeasonOption } from "./actions"

interface DraftHistoryClientProps {
    years: number[]
    playerPicUrl: string
}

export function DraftHistoryClient({
    years,
    playerPicUrl
}: DraftHistoryClientProps) {
    const [selectedYear, setSelectedYear] = useState<string>("")
    const [selectedSeason, setSelectedSeason] = useState<string>("")
    const [selectedDivision, setSelectedDivision] = useState<string>("")

    const [seasonOptions, setSeasonOptions] = useState<SeasonOption[]>([])
    const [divisionOptions, setDivisionOptions] = useState<DivisionOption[]>([])
    const [draftTeams, setDraftTeams] = useState<DraftTeam[]>([])

    const [loadingSeasons, setLoadingSeasons] = useState(false)
    const yearSelectId = useId()
    const seasonSelectId = useId()
    const divisionSelectId = useId()
    const [loadingDivisions, setLoadingDivisions] = useState(false)
    const [loadingDraft, setLoadingDraft] = useState(false)
    const [errorMessage, setErrorMessage] = useState("")

    const {
        selectedUserId,
        playerDetails,
        draftHistory,
        signupHistory,
        ratingAverages,
        sharedRatingNotes,
        privateRatingNotes,
        emailSuppressions,
        emailHistory,
        viewerRating,
        pairPickName,
        pairReason,
        isLoading: playerLoading,
        openPlayerDetail,
        closePlayerDetail
    } = usePlayerDetailModal()

    const handleYearChange = useCallback((year: string) => {
        setSelectedYear(year)
        setSelectedSeason("")
        setSelectedDivision("")
        setSeasonOptions([])
        setDivisionOptions([])
        setDraftTeams([])
        setErrorMessage("")

        if (!year) return

        setLoadingSeasons(true)
        getSeasonsForYear(Number(year))
            .then(setSeasonOptions)
            .finally(() => setLoadingSeasons(false))
    }, [])

    const handleSeasonChange = useCallback((seasonId: string) => {
        setSelectedSeason(seasonId)
        setSelectedDivision("")
        setDivisionOptions([])
        setDraftTeams([])
        setErrorMessage("")

        if (!seasonId) return

        setLoadingDivisions(true)
        getDivisionsForSeason(Number(seasonId))
            .then(setDivisionOptions)
            .finally(() => setLoadingDivisions(false))
    }, [])

    useEffect(() => {
        if (!selectedSeason || !selectedDivision) return

        setLoadingDraft(true)
        setErrorMessage("")
        getDraftResults(Number(selectedSeason), Number(selectedDivision))
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
    }, [selectedSeason, selectedDivision])

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap gap-4">
                <div className="w-40">
                    <Label
                        htmlFor={yearSelectId}
                        className="mb-1 block font-medium text-muted-foreground text-sm"
                    >
                        Year
                    </Label>
                    <Select
                        value={selectedYear}
                        onValueChange={handleYearChange}
                    >
                        <SelectTrigger id={yearSelectId}>
                            <SelectValue placeholder="Select year" />
                        </SelectTrigger>
                        <SelectContent>
                            {years.map((y) => (
                                <SelectItem key={y} value={String(y)}>
                                    {y}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="w-48">
                    <Label
                        htmlFor={seasonSelectId}
                        className="mb-1 block font-medium text-muted-foreground text-sm"
                    >
                        Season
                    </Label>
                    <Select
                        value={selectedSeason}
                        onValueChange={handleSeasonChange}
                        disabled={!selectedYear || loadingSeasons}
                    >
                        <SelectTrigger id={seasonSelectId}>
                            <SelectValue
                                placeholder={
                                    loadingSeasons
                                        ? "Loading…"
                                        : "Select season"
                                }
                            />
                        </SelectTrigger>
                        <SelectContent>
                            {seasonOptions.map((s) => (
                                <SelectItem key={s.id} value={String(s.id)}>
                                    {s.season}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

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
                        disabled={!selectedSeason || loadingDivisions}
                    >
                        <SelectTrigger id={divisionSelectId}>
                            <SelectValue
                                placeholder={
                                    loadingDivisions
                                        ? "Loading…"
                                        : "Select division"
                                }
                            />
                        </SelectTrigger>
                        <SelectContent>
                            {divisionOptions.map((d) => (
                                <SelectItem key={d.id} value={String(d.id)}>
                                    {d.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

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
                        No draft results found for this selection.
                    </p>
                )}

            {draftTeams.length > 0 && (
                <DraftTeamGrid
                    teams={draftTeams}
                    onPlayerClick={openPlayerDetail}
                />
            )}

            <AdminPlayerDetailPopup
                open={!!selectedUserId}
                onClose={closePlayerDetail}
                playerDetails={playerDetails}
                draftHistory={draftHistory}
                signupHistory={signupHistory}
                playerPicUrl={playerPicUrl}
                isLoading={playerLoading}
                pairPickName={pairPickName}
                pairReason={pairReason}
                ratingAverages={ratingAverages}
                sharedRatingNotes={sharedRatingNotes}
                privateRatingNotes={privateRatingNotes}
                emailSuppressions={emailSuppressions}
                emailHistory={emailHistory}
                viewerRating={viewerRating}
            />
        </div>
    )
}
