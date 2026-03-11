"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { formatHeight } from "@/components/player-detail"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
    savePlayerRatingNote,
    savePlayerSkillRatings,
    type LookupType,
    type PlayerRatingValues,
    type RatePlayerEntry,
    type RatingSkill,
    type TryoutDivisionGroup,
    type TryoutSessionGroup
} from "./actions"

interface RatePlayerClientProps {
    players: RatePlayerEntry[]
    tryout1Sessions: TryoutSessionGroup[]
    tryout2Divisions: TryoutDivisionGroup[]
    tryout3Divisions: TryoutDivisionGroup[]
    initialRatings: Record<string, PlayerRatingValues>
    playerPicUrl: string
}

interface PlayerTableProps {
    players: RatePlayerEntry[]
    onRate: (player: RatePlayerEntry) => void
}

function getDisplayName(player: RatePlayerEntry): string {
    return `${player.preferredName || player.firstName} ${player.lastName}`
}

function getOldIdLabel(player: RatePlayerEntry): string {
    if (player.oldId === null) {
        return "No old_id"
    }

    return `#${player.oldId}`
}

function getGenderLabel(male: boolean | null): string {
    if (male === true) {
        return "Male"
    }

    if (male === false) {
        return "Non-Male"
    }

    return "—"
}

function getEmptyRating(): PlayerRatingValues {
    return {
        overall: null,
        passing: null,
        setting: null,
        hitting: null,
        serving: null,
        sharedNotes: null,
        privateNotes: null
    }
}

function PlayerTable({ players, onRate }: PlayerTableProps) {
    return (
        <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b bg-muted/50">
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground" />
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                            Old ID
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                            Name
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                            Gender
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                            Height
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                            Last Division Played
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {players.length === 0 ? (
                        <tr>
                            <td
                                colSpan={6}
                                className="px-4 py-8 text-center text-muted-foreground"
                            >
                                No players match the current filter.
                            </td>
                        </tr>
                    ) : (
                        players.map((player) => (
                            <tr
                                key={player.id}
                                className="border-b transition-colors last:border-0 hover:bg-accent/50"
                            >
                                <td className="px-4 py-2 text-left">
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => onRate(player)}
                                    >
                                        Rate
                                    </Button>
                                </td>
                                <td className="px-4 py-2 font-medium">
                                    {player.oldId ?? "—"}
                                </td>
                                <td className="px-4 py-2 font-medium">
                                    {getDisplayName(player)}
                                </td>
                                <td className="px-4 py-2">
                                    {getGenderLabel(player.male)}
                                </td>
                                <td className="px-4 py-2">
                                    {formatHeight(player.height)}
                                </td>
                                <td className="px-4 py-2">
                                    {player.lastDivisionName || "—"}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    )
}

function SkillSlider({
    label,
    value,
    disabled,
    onChange
}: {
    label: string
    value: number
    disabled: boolean
    onChange: (nextValue: number) => void
}) {
    const ticksId = `skill-ticks-${label.toLowerCase()}`
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <Label>{label}</Label>
                <span className="font-semibold text-sm">{value.toFixed(1)}</span>
            </div>
            <input
                type="range"
                min={0}
                max={6}
                step={0.2}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                disabled={disabled}
                list={ticksId}
                className="h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed"
            />
            <datalist id={ticksId}>
                <option value="0" />
                <option value="1" />
                <option value="2" />
                <option value="3" />
                <option value="4" />
                <option value="5" />
                <option value="6" />
            </datalist>
            <div className="flex justify-between px-[0.4rem]">
                {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                    <div key={n} className="h-1.5 w-px bg-border" />
                ))}
            </div>
            <div className="grid grid-cols-6 text-center text-muted-foreground text-xs">
                <span>BB</span>
                <span>BBB</span>
                <span>ABB</span>
                <span>ABA</span>
                <span>A</span>
                <span>AA</span>
            </div>
        </div>
    )
}

export function RatePlayerClient({
    players,
    tryout1Sessions,
    tryout2Divisions,
    tryout3Divisions,
    initialRatings,
    playerPicUrl
}: RatePlayerClientProps) {
    const [lookupType, setLookupType] = useState<LookupType>("direct")
    const [tryoutSessionValue, setTryoutSessionValue] = useState<string>(
        tryout1Sessions.length > 0
            ? String(tryout1Sessions[0].sessionNumber)
            : "none"
    )
    const [search, setSearch] = useState("")
    const [selectedPlayer, setSelectedPlayer] =
        useState<RatePlayerEntry | null>(null)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [ratingsByPlayer, setRatingsByPlayer] =
        useState<Record<string, PlayerRatingValues>>(initialRatings)
    const [overall, setOverall] = useState(0)
    const [passing, setPassing] = useState(0)
    const [setting, setSetting] = useState(0)
    const [hitting, setHitting] = useState(0)
    const [serving, setServing] = useState(0)
    const [sharedNotes, setSharedNotes] = useState("")
    const [privateNotes, setPrivateNotes] = useState("")
    const [hasPendingSkillSave, setHasPendingSkillSave] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [modalMessage, setModalMessage] = useState<{
        type: "success" | "error"
        text: string
    } | null>(null)
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const latestSaveRequestIdRef = useRef(0)

    useEffect(() => {
        if (!selectedPlayer || !hasPendingSkillSave) {
            return
        }

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
        }

        const selectedPlayerId = selectedPlayer.id

        saveTimeoutRef.current = setTimeout(async () => {
            const requestId = latestSaveRequestIdRef.current + 1
            latestSaveRequestIdRef.current = requestId
            setIsSaving(true)

            const result = await savePlayerSkillRatings(selectedPlayerId, {
                overall,
                passing,
                setting,
                hitting,
                serving
            })

            if (latestSaveRequestIdRef.current !== requestId) {
                return
            }

            setIsSaving(false)
            setHasPendingSkillSave(false)
            setModalMessage({
                type: result.status ? "success" : "error",
                text: result.message
            })
        }, 3000)

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
                saveTimeoutRef.current = null
            }
        }
    }, [
        selectedPlayer,
        hasPendingSkillSave,
        overall,
        passing,
        setting,
        hitting,
        serving
    ])

    useEffect(
        () => () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
            }
        },
        []
    )

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
        return []
    }, [lookupType, tryout1Sessions, tryout2Divisions, tryout3Divisions])

    useEffect(() => {
        if (lookupType === "direct") return
        const validValues = new Set(activeGroupOptions.map((o) => o.value))
        if (!validValues.has(tryoutSessionValue)) {
            setTryoutSessionValue(
                activeGroupOptions.length > 0 ? activeGroupOptions[0].value : "none"
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
            const nameText =
                `${player.preferredName || player.firstName} ${player.lastName}`.toLowerCase()
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

    const openRateDialog = (player: RatePlayerEntry) => {
        const rating = ratingsByPlayer[player.id] || getEmptyRating()
        setHasPendingSkillSave(false)
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
            saveTimeoutRef.current = null
        }
        setOverall(rating.overall ?? 0)
        setPassing(rating.passing ?? 0)
        setSetting(rating.setting ?? 0)
        setHitting(rating.hitting ?? 0)
        setServing(rating.serving ?? 0)
        setSharedNotes(rating.sharedNotes || "")
        setPrivateNotes(rating.privateNotes || "")
        setSelectedPlayer(player)
        setModalMessage(null)
        setIsDialogOpen(true)
    }

    const closeDialog = () => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
            saveTimeoutRef.current = null
        }
        setHasPendingSkillSave(false)
        setIsSaving(false)
        setIsDialogOpen(false)
        setSelectedPlayer(null)
        setModalMessage(null)
    }

    const updateRatingStateForPlayer = (
        playerId: string,
        update: Partial<PlayerRatingValues>
    ) => {
        setRatingsByPlayer((prev) => {
            const current = prev[playerId] || getEmptyRating()
            return {
                ...prev,
                [playerId]: {
                    ...current,
                    ...update
                }
            }
        })
    }

    const handleSkillChange = (skill: RatingSkill, value: number) => {
        if (!selectedPlayer) {
            return
        }

        setModalMessage(null)

        if (skill === "overall") {
            setOverall(value)
        } else if (skill === "passing") {
            setPassing(value)
        } else if (skill === "setting") {
            setSetting(value)
        } else if (skill === "hitting") {
            setHitting(value)
        } else {
            setServing(value)
        }

        updateRatingStateForPlayer(selectedPlayer.id, { [skill]: value })
        setHasPendingSkillSave(true)
    }

    const handleSaveAll = async () => {
        if (!selectedPlayer) {
            return
        }

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
            saveTimeoutRef.current = null
        }

        setHasPendingSkillSave(false)
        setIsSaving(true)
        setModalMessage(null)

        const [skillResult, sharedNoteResult, privateNoteResult] =
            await Promise.all([
                savePlayerSkillRatings(selectedPlayer.id, {
                    overall,
                    passing,
                    setting,
                    hitting,
                    serving
                }),
                savePlayerRatingNote(selectedPlayer.id, "shared", sharedNotes),
                savePlayerRatingNote(
                    selectedPlayer.id,
                    "private",
                    privateNotes
                )
            ])

        setIsSaving(false)

        if (skillResult.status) {
            updateRatingStateForPlayer(selectedPlayer.id, {
                overall,
                passing,
                setting,
                hitting,
                serving
            })
        }

        if (sharedNoteResult.status) {
            updateRatingStateForPlayer(selectedPlayer.id, {
                sharedNotes: sharedNotes.trim() || null
            })
        }

        if (privateNoteResult.status) {
            updateRatingStateForPlayer(selectedPlayer.id, {
                privateNotes: privateNotes.trim() || null
            })
        }

        if (skillResult.status && sharedNoteResult.status && privateNoteResult.status) {
            setModalMessage({ type: "success", text: "All ratings and notes saved." })
            return
        }

        const errors = [skillResult, sharedNoteResult, privateNoteResult]
            .filter((r) => !r.status)
            .map((r) => r.message)
            .join(" ")
        setModalMessage({ type: "error", text: errors })
    }

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
                            <SelectItem value="tryout3">Tryout 3</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {lookupType !== "direct" && (
                    <div className="space-y-2">
                        <Label htmlFor="session_number">
                            {lookupType === "tryout1" ? "Session" : "Division"}
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
                />
            )}

            {lookupType === "tryout1" && (
                <div className="space-y-3">
                    {!selectedTryoutSession ? (
                        <div className="rounded-md border bg-muted/50 p-5 text-muted-foreground text-sm">
                            No Tryout 1 session data found for the active
                            season.
                        </div>
                    ) : (
                        <Accordion type="multiple" className="w-full">
                            {selectedTryoutSession.courts.map((court) => {
                                const filteredCourtPlayers =
                                    court.players.filter((player) =>
                                        filteredPlayerIds.has(player.id)
                                    )

                                return (
                                    <AccordionItem
                                        key={court.courtNumber}
                                        value={`court-${court.courtNumber}`}
                                    >
                                        <AccordionTrigger>
                                            <span>
                                                Court {court.courtNumber} (
                                                {filteredCourtPlayers.length})
                                            </span>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <PlayerTable
                                                players={filteredCourtPlayers}
                                                onRate={openRateDialog}
                                            />
                                        </AccordionContent>
                                    </AccordionItem>
                                )
                            })}
                        </Accordion>
                    )}
                </div>
            )}

            {(lookupType === "tryout2" || lookupType === "tryout3") && (
                <div className="space-y-3">
                    {!selectedTryoutDivision ? (
                        <div className="rounded-md border bg-muted/50 p-5 text-muted-foreground text-sm">
                            No{" "}
                            {lookupType === "tryout2" ? "Tryout 2" : "Tryout 3"}{" "}
                            division data found for the active season.
                        </div>
                    ) : (
                        <Accordion type="multiple" className="w-full">
                            {selectedTryoutDivision.teams.map((team) => {
                                const filteredTeamPlayers =
                                    team.players.filter((player) =>
                                        filteredPlayerIds.has(player.id)
                                    )

                                return (
                                    <AccordionItem
                                        key={team.teamNumber}
                                        value={`team-${team.teamNumber}`}
                                    >
                                        <AccordionTrigger>
                                            <span>
                                                Team {team.teamNumber} (
                                                {filteredTeamPlayers.length})
                                            </span>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <PlayerTable
                                                players={filteredTeamPlayers}
                                                onRate={openRateDialog}
                                            />
                                        </AccordionContent>
                                    </AccordionItem>
                                )
                            })}
                        </Accordion>
                    )}
                </div>
            )}

            <Dialog
                open={isDialogOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        closeDialog()
                        return
                    }

                    setIsDialogOpen(true)
                }}
            >
                <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Rate Player</DialogTitle>
                        <DialogDescription>
                            Ratings and notes are unique to your account.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedPlayer && (
                        <div className="space-y-5">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                                {playerPicUrl && selectedPlayer.picture ? (
                                    <img
                                        src={`${playerPicUrl}${selectedPlayer.picture}`}
                                        alt={getDisplayName(selectedPlayer)}
                                        className="h-40 w-28 rounded-md object-cover"
                                    />
                                ) : (
                                    <div className="flex h-40 w-28 items-center justify-center rounded-md border bg-muted text-muted-foreground text-xs">
                                        No picture
                                    </div>
                                )}

                                <div className="space-y-1">
                                    <p className="font-bold text-3xl leading-tight">
                                        {getOldIdLabel(selectedPlayer)} -{" "}
                                        {getDisplayName(selectedPlayer)}
                                    </p>
                                    <p className="text-muted-foreground text-sm">
                                        {getGenderLabel(selectedPlayer.male)} •{" "}
                                        {formatHeight(selectedPlayer.height)}
                                    </p>
                                </div>
                            </div>

                            {modalMessage && (
                                <div
                                    className={`rounded-md p-3 text-sm ${
                                        modalMessage.type === "success"
                                            ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                                            : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                                    }`}
                                >
                                    {modalMessage.text}
                                </div>
                            )}

                            <section className="space-y-4 rounded-md border p-4">
                                <h3 className="font-semibold text-lg">
                                    Shared with other captains
                                </h3>

                                <SkillSlider
                                    label="Overall"
                                    value={overall}
                                    disabled={false}
                                    onChange={(value) =>
                                        handleSkillChange("overall", value)
                                    }
                                />
                                <div className="border-t" />
                                <SkillSlider
                                    label="Passing"
                                    value={passing}
                                    disabled={false}
                                    onChange={(value) =>
                                        handleSkillChange("passing", value)
                                    }
                                />
                                <SkillSlider
                                    label="Setting"
                                    value={setting}
                                    disabled={false}
                                    onChange={(value) =>
                                        handleSkillChange("setting", value)
                                    }
                                />
                                <SkillSlider
                                    label="Hitting"
                                    value={hitting}
                                    disabled={false}
                                    onChange={(value) =>
                                        handleSkillChange("hitting", value)
                                    }
                                />
                                <SkillSlider
                                    label="Serving"
                                    value={serving}
                                    disabled={false}
                                    onChange={(value) =>
                                        handleSkillChange("serving", value)
                                    }
                                />

                                {isSaving && (
                                    <p className="text-muted-foreground text-sm">
                                        Saving ratings...
                                    </p>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="shared_notes">
                                        Shared notes
                                    </Label>
                                    <Textarea
                                        id="shared_notes"
                                        value={sharedNotes}
                                        onChange={(event) =>
                                            setSharedNotes(event.target.value)
                                        }
                                        placeholder="Visible to other captains."
                                    />
                                    <div className="flex justify-end">
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={handleSaveAll}
                                            disabled={isSaving}
                                        >
                                            {isSaving
                                                ? "Saving..."
                                                : "Save All Ratings"}
                                        </Button>
                                    </div>
                                </div>
                            </section>

                            <section className="space-y-4 rounded-md border p-4">
                                <h3 className="font-semibold text-lg">
                                    Private notes
                                </h3>

                                <div className="space-y-2">
                                    <Label htmlFor="private_notes">
                                        Private notes
                                    </Label>
                                    <Textarea
                                        id="private_notes"
                                        value={privateNotes}
                                        onChange={(event) =>
                                            setPrivateNotes(event.target.value)
                                        }
                                        placeholder="Visible only to you."
                                    />
                                    <div className="flex justify-end">
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={handleSaveAll}
                                            disabled={isSaving}
                                        >
                                            {isSaving
                                                ? "Saving..."
                                                : "Save All Ratings"}
                                        </Button>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
