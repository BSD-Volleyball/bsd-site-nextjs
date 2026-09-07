"use client"

import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import type {
    CaptainTeamRef,
    LookupType,
    PlayerRatingValues,
    RatePlayerEntry,
    RatedPlayerEntry,
    RatedSeasonOption,
    SeasonTeamDivisionGroup,
    TryoutDivisionGroup,
    TryoutSessionGroup
} from "./actions"
import {
    ByTeamAccordion,
    TryoutDivisionAccordion,
    TryoutSessionAccordion,
    TryoutTimeSlotAccordion
} from "./lookup-accordions"
import { PlayerTable } from "./player-table"
import { RatePlayerDialog } from "./rate-player-dialog"
import { RatedPlayerTable } from "./rated-player-table"
import { getDisplayName, sortRatedPlayers } from "./rate-player-helpers"
import type { TryoutTimeSlotGroup } from "./rate-player-helpers"
import { useRatePlayerDialog } from "./use-rate-player-dialog"

// Radix Select rejects "" as an item value, so the season filter's
// "All" option uses a sentinel.
const ALL_SEASONS = "all"

// Search box predicate: old ID, display name, or "first last".
function matchesSearch(player: RatePlayerEntry, search: string): boolean {
    const lowerSearch = search.trim().toLowerCase()
    if (!lowerSearch) return true
    const oldIdText = player.oldId?.toString() || ""
    const nameText = getDisplayName(player).toLowerCase()
    const fullNameText = `${player.firstName} ${player.lastName}`.toLowerCase()
    return (
        oldIdText.includes(lowerSearch) ||
        nameText.includes(lowerSearch) ||
        fullNameText.includes(lowerSearch)
    )
}

interface RatePlayerClientProps {
    players: RatePlayerEntry[]
    tryout1Sessions: TryoutSessionGroup[]
    tryout2Divisions: TryoutDivisionGroup[]
    tryout3Divisions: TryoutDivisionGroup[]
    tryout2TimeSlots: TryoutTimeSlotGroup[]
    tryout3TimeSlots: TryoutTimeSlotGroup[]
    byTeamDivisions: SeasonTeamDivisionGroup[]
    captainTeam: CaptainTeamRef | null
    defaultLookupType: LookupType
    initialRatings: Record<string, PlayerRatingValues>
    ratedPlayers: RatedPlayerEntry[]
    ratedSeasons: RatedSeasonOption[]
    currentSeasonId: number
    currentSeasonLabel: string
    playerPicUrl: string
}

export function RatePlayerClient({
    players,
    tryout1Sessions,
    tryout2Divisions,
    tryout3Divisions,
    tryout2TimeSlots,
    tryout3TimeSlots,
    byTeamDivisions,
    captainTeam,
    defaultLookupType,
    initialRatings,
    ratedPlayers,
    ratedSeasons,
    currentSeasonId,
    currentSeasonLabel,
    playerPicUrl
}: RatePlayerClientProps) {
    // The server picks the starting lookup from the season timeline (see
    // resolveDefaultLookupType); a captain's own team is pre-expanded
    // whenever the By Team view is shown.
    const [lookupType, setLookupType] = useState<LookupType>(defaultLookupType)
    const [tryoutSessionValue, setTryoutSessionValue] = useState<string>(() => {
        if (defaultLookupType === "tryout2") {
            return tryout2Divisions[0]?.divisionName ?? "none"
        }
        if (defaultLookupType === "tryout3") {
            return tryout3Divisions[0]?.divisionName ?? "none"
        }
        return tryout1Sessions.length > 0
            ? String(tryout1Sessions[0].sessionNumber)
            : "none"
    })
    const [ratedSeasonValue, setRatedSeasonValue] = useState(ALL_SEASONS)
    const [search, setSearch] = useState("")
    const dialog = useRatePlayerDialog(initialRatings)
    const { openRateDialog, ratingsByPlayer, lastSavedAtByPlayer } = dialog

    const activeGroupOptions = useMemo(() => {
        if (lookupType === "tryout1") {
            return tryout1Sessions.map((s) => ({
                value: String(s.sessionNumber),
                label: `Session ${s.sessionNumber}`
            }))
        }
        if (lookupType === "tryout2") {
            return tryout2Divisions.map((d) => ({
                value: d.divisionName,
                label: d.divisionName
            }))
        }
        if (lookupType === "tryout3") {
            return tryout3Divisions.map((d) => ({
                value: d.divisionName,
                label: d.divisionName
            }))
        }
        if (lookupType === "tryout2Times" || lookupType === "tryout3Times") {
            const slots =
                lookupType === "tryout2Times"
                    ? tryout2TimeSlots
                    : tryout3TimeSlots
            return slots.map((slot) => ({
                value: String(slot.sessionNumber),
                label: slot.timeLabel
            }))
        }
        return []
    }, [
        lookupType,
        tryout1Sessions,
        tryout2Divisions,
        tryout3Divisions,
        tryout2TimeSlots,
        tryout3TimeSlots
    ])

    useEffect(() => {
        if (
            lookupType === "direct" ||
            lookupType === "byTeam" ||
            lookupType === "ratedPlayers"
        ) {
            return
        }
        const validValues = new Set(activeGroupOptions.map((o) => o.value))
        if (!validValues.has(tryoutSessionValue)) {
            setTryoutSessionValue(
                activeGroupOptions.length > 0
                    ? activeGroupOptions[0].value
                    : "none"
            )
        }
    }, [lookupType, activeGroupOptions, tryoutSessionValue])

    const filteredPlayers = useMemo(
        () => players.filter((player) => matchesSearch(player, search)),
        [players, search]
    )

    const filteredPlayerIds = useMemo(
        () => new Set(filteredPlayers.map((player) => player.id)),
        [filteredPlayers]
    )

    // "Players I've Rated": fold in saves made this session so current-season
    // rows show the latest overall/date and newly rated signups appear.
    const visibleRatedPlayers = useMemo(() => {
        const merged = ratedPlayers.map((entry) => {
            if (entry.seasonId !== currentSeasonId) return entry
            const live = ratingsByPlayer[entry.player.id]
            const savedAt = lastSavedAtByPlayer[entry.player.id]
            if (!live && !savedAt) return entry
            return {
                ...entry,
                overall: live ? live.overall : entry.overall,
                ratedAt: savedAt ?? entry.ratedAt
            }
        })

        const listedCurrent = new Set(
            merged
                .filter((entry) => entry.seasonId === currentSeasonId)
                .map((entry) => entry.player.id)
        )
        for (const [playerId, savedAt] of Object.entries(lastSavedAtByPlayer)) {
            if (listedCurrent.has(playerId)) continue
            const player = players.find((p) => p.id === playerId)
            if (!player) continue
            merged.push({
                player,
                seasonId: currentSeasonId,
                seasonLabel: currentSeasonLabel,
                overall: ratingsByPlayer[playerId]?.overall ?? null,
                ratedAt: savedAt,
                canRate: true
            })
        }

        return merged
            .filter(
                (entry) =>
                    (ratedSeasonValue === ALL_SEASONS ||
                        String(entry.seasonId) === ratedSeasonValue) &&
                    matchesSearch(entry.player, search)
            )
            .sort(sortRatedPlayers)
    }, [
        ratedPlayers,
        players,
        currentSeasonId,
        currentSeasonLabel,
        ratingsByPlayer,
        lastSavedAtByPlayer,
        ratedSeasonValue,
        search
    ])

    // Season filter options: seasons with saved ratings, plus the current
    // season once the first rating of this session lands.
    const ratedSeasonOptions = useMemo(() => {
        const hasCurrent = ratedSeasons.some(
            (season) => season.seasonId === currentSeasonId
        )
        if (hasCurrent || Object.keys(lastSavedAtByPlayer).length === 0) {
            return ratedSeasons
        }
        return [
            { seasonId: currentSeasonId, label: currentSeasonLabel },
            ...ratedSeasons
        ]
    }, [ratedSeasons, currentSeasonId, currentSeasonLabel, lastSavedAtByPlayer])

    const selectedTryoutSession = useMemo(
        () =>
            tryout1Sessions.find(
                (session) =>
                    String(session.sessionNumber) === tryoutSessionValue
            ) || null,
        [tryout1Sessions, tryoutSessionValue]
    )

    const selectedTryoutDivision = useMemo(() => {
        if (lookupType === "tryout2") {
            return (
                tryout2Divisions.find(
                    (d) => d.divisionName === tryoutSessionValue
                ) || null
            )
        }
        if (lookupType === "tryout3") {
            return (
                tryout3Divisions.find(
                    (d) => d.divisionName === tryoutSessionValue
                ) || null
            )
        }
        return null
    }, [lookupType, tryout2Divisions, tryout3Divisions, tryoutSessionValue])

    const selectedTimeSlot = useMemo(() => {
        if (lookupType !== "tryout2Times" && lookupType !== "tryout3Times") {
            return null
        }
        const slots =
            lookupType === "tryout2Times" ? tryout2TimeSlots : tryout3TimeSlots
        return (
            slots.find(
                (slot) => String(slot.sessionNumber) === tryoutSessionValue
            ) || null
        )
    }, [lookupType, tryout2TimeSlots, tryout3TimeSlots, tryoutSessionValue])

    return (
        <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                    <Label htmlFor="lookup_type">Lookup type</Label>
                    <Select
                        value={lookupType}
                        onValueChange={(value) =>
                            setLookupType(value as LookupType)
                        }
                    >
                        <SelectTrigger id="lookup_type">
                            <SelectValue placeholder="Select lookup type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="direct">Direct</SelectItem>
                            <SelectItem value="tryout1">Tryout 1</SelectItem>
                            <SelectItem value="tryout2">Tryout 2</SelectItem>
                            <SelectItem value="tryout2Times">
                                Tryout (times) 2
                            </SelectItem>
                            <SelectItem value="tryout3">Tryout 3</SelectItem>
                            <SelectItem value="tryout3Times">
                                Tryout (times) 3
                            </SelectItem>
                            {byTeamDivisions.length > 0 && (
                                <SelectItem value="byTeam">By Team</SelectItem>
                            )}
                            <SelectItem value="ratedPlayers">
                                Players I've Rated
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {lookupType === "ratedPlayers" && (
                    <div className="space-y-2">
                        <Label htmlFor="rated_season">Season</Label>
                        <Select
                            value={ratedSeasonValue}
                            onValueChange={setRatedSeasonValue}
                        >
                            <SelectTrigger id="rated_season">
                                <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL_SEASONS}>All</SelectItem>
                                {ratedSeasonOptions.map((season) => (
                                    <SelectItem
                                        key={season.seasonId}
                                        value={String(season.seasonId)}
                                    >
                                        {season.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {lookupType !== "direct" &&
                    lookupType !== "byTeam" &&
                    lookupType !== "ratedPlayers" && (
                        <div className="space-y-2">
                            <Label htmlFor="session_number">
                                {lookupType === "tryout1"
                                    ? "Session"
                                    : lookupType === "tryout2Times" ||
                                        lookupType === "tryout3Times"
                                      ? "Time"
                                      : "Division"}
                            </Label>
                            <Select
                                value={tryoutSessionValue}
                                onValueChange={setTryoutSessionValue}
                            >
                                <SelectTrigger id="session_number">
                                    <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {activeGroupOptions.length === 0 ? (
                                        <SelectItem value="none" disabled>
                                            No data available
                                        </SelectItem>
                                    ) : (
                                        activeGroupOptions.map((option) => (
                                            <SelectItem
                                                key={option.value}
                                                value={option.value}
                                            >
                                                {option.label}
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                <div className="space-y-2 md:col-span-1">
                    <Label htmlFor="player_search">Search</Label>
                    <Input
                        id="player_search"
                        placeholder="Search by old ID or name..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
            </div>

            {lookupType === "direct" && (
                <PlayerTable
                    players={filteredPlayers}
                    onRate={openRateDialog}
                    playerPicUrl={playerPicUrl}
                />
            )}

            {lookupType === "tryout1" && (
                <TryoutSessionAccordion
                    selectedTryoutSession={selectedTryoutSession}
                    filteredPlayerIds={filteredPlayerIds}
                    onRate={openRateDialog}
                    playerPicUrl={playerPicUrl}
                />
            )}

            {(lookupType === "tryout2" || lookupType === "tryout3") && (
                <TryoutDivisionAccordion
                    lookupType={lookupType}
                    selectedTryoutDivision={selectedTryoutDivision}
                    filteredPlayerIds={filteredPlayerIds}
                    onRate={openRateDialog}
                    playerPicUrl={playerPicUrl}
                />
            )}

            {(lookupType === "tryout2Times" ||
                lookupType === "tryout3Times") && (
                <TryoutTimeSlotAccordion
                    lookupType={lookupType}
                    selectedTimeSlot={selectedTimeSlot}
                    filteredPlayerIds={filteredPlayerIds}
                    onRate={openRateDialog}
                    playerPicUrl={playerPicUrl}
                />
            )}

            {lookupType === "ratedPlayers" && (
                <RatedPlayerTable
                    rows={visibleRatedPlayers}
                    emptyMessage={
                        ratedSeasonValue === ALL_SEASONS
                            ? "You haven't rated any players yet."
                            : "You haven't rated any players in this season."
                    }
                    onRate={openRateDialog}
                    playerPicUrl={playerPicUrl}
                />
            )}

            {lookupType === "byTeam" && (
                <ByTeamAccordion
                    byTeamDivisions={byTeamDivisions}
                    captainTeam={captainTeam}
                    filteredPlayerIds={filteredPlayerIds}
                    onRate={openRateDialog}
                    playerPicUrl={playerPicUrl}
                />
            )}

            <RatePlayerDialog controller={dialog} playerPicUrl={playerPicUrl} />
        </div>
    )
}
