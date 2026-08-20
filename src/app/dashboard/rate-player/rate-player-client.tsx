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
import { getDisplayName } from "./rate-player-helpers"
import type { TryoutTimeSlotGroup } from "./rate-player-helpers"
import { useRatePlayerDialog } from "./use-rate-player-dialog"

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
    const [search, setSearch] = useState("")
    const dialog = useRatePlayerDialog(initialRatings)
    const { openRateDialog } = dialog

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
        if (lookupType === "direct" || lookupType === "byTeam") return
        const validValues = new Set(activeGroupOptions.map((o) => o.value))
        if (!validValues.has(tryoutSessionValue)) {
            setTryoutSessionValue(
                activeGroupOptions.length > 0
                    ? activeGroupOptions[0].value
                    : "none"
            )
        }
    }, [lookupType, activeGroupOptions, tryoutSessionValue])

    const filteredPlayers = useMemo(() => {
        if (!search.trim()) {
            return players
        }

        const lowerSearch = search.toLowerCase()

        return players.filter((player) => {
            const oldIdText = player.oldId?.toString() || ""
            const nameText = getDisplayName(player).toLowerCase()
            const fullNameText =
                `${player.firstName} ${player.lastName}`.toLowerCase()

            return (
                oldIdText.includes(lowerSearch) ||
                nameText.includes(lowerSearch) ||
                fullNameText.includes(lowerSearch)
            )
        })
    }, [players, search])

    const filteredPlayerIds = useMemo(
        () => new Set(filteredPlayers.map((player) => player.id)),
        [filteredPlayers]
    )

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
                        </SelectContent>
                    </Select>
                </div>

                {lookupType !== "direct" && lookupType !== "byTeam" && (
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
