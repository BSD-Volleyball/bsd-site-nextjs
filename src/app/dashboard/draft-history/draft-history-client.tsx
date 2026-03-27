"use client"

import { useCallback, useEffect, useState } from "react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { usePlayerDetailModal } from "@/components/player-detail/use-player-detail-modal"
import { AdminPlayerDetailPopup } from "@/components/player-detail/admin-player-detail-popup"
import {
    getSeasonsForYear,
    getDivisionsForSeason,
    getDraftResults
} from "./actions"
import type {
    SeasonOption,
    DivisionOption,
    DraftTeam,
    DraftPlayer
} from "./actions"

const ROUND_COLORS = [
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
    "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200"
]

function getRoundColor(round: number): string {
    return ROUND_COLORS[(round - 1) % ROUND_COLORS.length]
}

function displayName(
    firstName: string,
    lastName: string,
    preferredName: string | null
): string {
    const first = preferredName ?? firstName
    return `${first} ${lastName}`
}

function DraftPickBubble({ player }: { player: DraftPlayer }) {
    return (
        <span
            className={`mr-2 inline-flex min-w-[70px] items-center justify-center rounded-full px-2 py-0.5 font-semibold text-xs ${getRoundColor(player.round)}`}
        >
            R{player.round} ({player.overall})
        </span>
    )
}

function TeamCard({
    team,
    onPlayerClick
}: {
    team: DraftTeam
    onPlayerClick: (userId: string) => void
}) {
    const captainName = displayName(
        team.captainFirstName,
        team.captainLastName,
        team.captainPreferredName
    )

    return (
        <div className="overflow-hidden rounded-lg border">
            <div className="border-b bg-muted/50 px-4 py-3">
                <div className="flex items-center gap-2">
                    {team.teamNumber != null && (
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-sm">
                            {team.teamNumber}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => onPlayerClick(team.captainId)}
                        className="font-semibold text-lg hover:underline focus:outline-none"
                    >
                        {captainName}
                    </button>
                    <span className="text-muted-foreground text-sm">
                        — {team.teamName}
                    </span>
                </div>
            </div>
            <div className="divide-y">
                {team.players.length === 0 ? (
                    <p className="px-4 py-3 text-muted-foreground text-sm">
                        No draft picks recorded
                    </p>
                ) : (
                    team.players.map((player) => (
                        <div
                            key={`${player.round}-${player.overall}`}
                            className="flex items-center px-4 py-2 transition-colors hover:bg-accent/50"
                        >
                            <DraftPickBubble player={player} />
                            <button
                                type="button"
                                onClick={() => onPlayerClick(player.userId)}
                                className="font-medium text-sm hover:underline focus:outline-none"
                            >
                                {displayName(
                                    player.firstName,
                                    player.lastName,
                                    player.preferredName
                                )}
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

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
                    setDraftTeams(result.teams)
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
                    <label className="mb-1 block font-medium text-muted-foreground text-sm">
                        Year
                    </label>
                    <Select
                        value={selectedYear}
                        onValueChange={handleYearChange}
                    >
                        <SelectTrigger>
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
                    <label className="mb-1 block font-medium text-muted-foreground text-sm">
                        Season
                    </label>
                    <Select
                        value={selectedSeason}
                        onValueChange={handleSeasonChange}
                        disabled={!selectedYear || loadingSeasons}
                    >
                        <SelectTrigger>
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
                    <label className="mb-1 block font-medium text-muted-foreground text-sm">
                        Division
                    </label>
                    <Select
                        value={selectedDivision}
                        onValueChange={setSelectedDivision}
                        disabled={!selectedSeason || loadingDivisions}
                    >
                        <SelectTrigger>
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
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {errorMessage}
                </div>
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
                <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
                    {draftTeams.map((team) => (
                        <TeamCard
                            key={team.teamId}
                            team={team}
                            onPlayerClick={openPlayerDetail}
                        />
                    ))}
                </div>
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
                viewerRating={viewerRating}
            />
        </div>
    )
}
