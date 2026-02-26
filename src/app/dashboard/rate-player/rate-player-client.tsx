"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
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
    type RatingNoteType,
    type RatingSkill,
    type TryoutSessionGroup
} from "./actions"

interface RatePlayerClientProps {
    players: RatePlayerEntry[]
    tryout1Sessions: TryoutSessionGroup[]
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

function formatHeight(inches: number | null): string {
    if (!inches) {
        return "—"
    }

    const feet = Math.floor(inches / 12)
    const inchesRemainder = inches % 12

    return `${feet}'${inchesRemainder}"`
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
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label>{label}</Label>
                <span className="font-semibold text-sm">{value}</span>
            </div>
            <input
                type="range"
                min={0}
                max={6}
                step={1}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                disabled={disabled}
                className="h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed"
            />
            <div className="grid grid-cols-7 text-muted-foreground text-xs">
                <span className="text-left">0</span>
                <span className="text-center">1 (BB)</span>
                <span className="text-center">2 (BBB)</span>
                <span className="text-center">3 (ABB)</span>
                <span className="text-center">4 (ABA)</span>
                <span className="text-center">5 (A)</span>
                <span className="text-right">6 (AA)</span>
            </div>
        </div>
    )
}

export function RatePlayerClient({
    players,
    tryout1Sessions,
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
    const [passing, setPassing] = useState(0)
    const [setting, setSetting] = useState(0)
    const [hitting, setHitting] = useState(0)
    const [serving, setServing] = useState(0)
    const [sharedNotes, setSharedNotes] = useState("")
    const [privateNotes, setPrivateNotes] = useState("")
    const [hasPendingSkillSave, setHasPendingSkillSave] = useState(false)
    const [savingSkills, setSavingSkills] = useState(false)
    const [savingSharedNotes, setSavingSharedNotes] = useState(false)
    const [savingPrivateNotes, setSavingPrivateNotes] = useState(false)
    const [modalMessage, setModalMessage] = useState<{
        type: "success" | "error"
        text: string
    } | null>(null)
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const latestSaveRequestIdRef = useRef(0)

    useEffect(() => {
        if (!selectedPlayer) {
            return
        }

        const rating = ratingsByPlayer[selectedPlayer.id] || getEmptyRating()
        setHasPendingSkillSave(false)
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
            saveTimeoutRef.current = null
        }
        setPassing(rating.passing ?? 0)
        setSetting(rating.setting ?? 0)
        setHitting(rating.hitting ?? 0)
        setServing(rating.serving ?? 0)
        setSharedNotes(rating.sharedNotes || "")
        setPrivateNotes(rating.privateNotes || "")
    }, [selectedPlayer, ratingsByPlayer])

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
            setSavingSkills(true)

            const result = await savePlayerSkillRatings(selectedPlayerId, {
                passing,
                setting,
                hitting,
                serving
            })

            if (latestSaveRequestIdRef.current !== requestId) {
                return
            }

            setSavingSkills(false)
            setHasPendingSkillSave(false)
            setModalMessage({
                type: result.status ? "success" : "error",
                text: result.message
            })
        }, 2000)

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
                saveTimeoutRef.current = null
            }
        }
    }, [
        selectedPlayer,
        hasPendingSkillSave,
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

    useEffect(() => {
        if (
            lookupType === "tryout1" &&
            tryoutSessionValue === "none" &&
            tryout1Sessions.length > 0
        ) {
            setTryoutSessionValue(String(tryout1Sessions[0].sessionNumber))
        }
    }, [lookupType, tryoutSessionValue, tryout1Sessions])

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

    const openRateDialog = (player: RatePlayerEntry) => {
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
        setSavingSkills(false)
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

        if (skill === "passing") {
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

    const handleSaveNotes = async (noteType: RatingNoteType) => {
        if (!selectedPlayer) {
            return
        }

        const noteText = noteType === "shared" ? sharedNotes : privateNotes

        if (noteType === "shared") {
            setSavingSharedNotes(true)
        } else {
            setSavingPrivateNotes(true)
        }

        setModalMessage(null)

        const result = await savePlayerRatingNote(
            selectedPlayer.id,
            noteType,
            noteText
        )

        if (noteType === "shared") {
            setSavingSharedNotes(false)
            if (result.status) {
                updateRatingStateForPlayer(selectedPlayer.id, {
                    sharedNotes: noteText.trim() || null
                })
            }
        } else {
            setSavingPrivateNotes(false)
            if (result.status) {
                updateRatingStateForPlayer(selectedPlayer.id, {
                    privateNotes: noteText.trim() || null
                })
            }
        }

        setModalMessage({
            type: result.status ? "success" : "error",
            text: result.message
        })
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
                        <Label htmlFor="session_number">Session</Label>
                        <Select
                            value={tryoutSessionValue}
                            onValueChange={setTryoutSessionValue}
                        >
                            <SelectTrigger id="session_number">
                                <SelectValue placeholder="Select session" />
                            </SelectTrigger>
                            <SelectContent>
                                {tryout1Sessions.length === 0 ? (
                                    <SelectItem value="none" disabled>
                                        No sessions available
                                    </SelectItem>
                                ) : (
                                    tryout1Sessions.map((session) => (
                                        <SelectItem
                                            key={session.sessionNumber}
                                            value={String(
                                                session.sessionNumber
                                            )}
                                        >
                                            Session {session.sessionNumber}
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

            {lookupType === "tryout2" && (
                <div className="rounded-md border bg-muted/50 p-5 text-muted-foreground text-sm">
                    Tryout 2 lookup is a placeholder for now.
                </div>
            )}

            {lookupType === "tryout3" && (
                <div className="rounded-md border bg-muted/50 p-5 text-muted-foreground text-sm">
                    Tryout 3 lookup is a placeholder for now.
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

                                {savingSkills && (
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
                                            onClick={() =>
                                                handleSaveNotes("shared")
                                            }
                                            disabled={savingSharedNotes}
                                        >
                                            {savingSharedNotes
                                                ? "Saving..."
                                                : "Save Shared Note"}
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
                                            onClick={() =>
                                                handleSaveNotes("private")
                                            }
                                            disabled={savingPrivateNotes}
                                        >
                                            {savingPrivateNotes
                                                ? "Saving..."
                                                : "Save Private Note"}
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
