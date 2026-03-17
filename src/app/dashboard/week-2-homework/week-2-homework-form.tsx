"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
    RiAddLine,
    RiArrowDownSLine,
    RiCloseLine,
    RiDeleteBinLine
} from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
    usePlayerDetailModal,
    PlayerDetailPopup
} from "@/components/player-detail"
import {
    submitWeek2Homework,
    type Week2Player,
    type ExistingSubmission,
    type SeasonInfo
} from "./actions"
import { getPlayerDetailsPublic } from "@/app/dashboard/view-signups/actions"

interface Week2HomeworkFormProps {
    seasonId: number
    divisionName: string
    teamNumber: number
    captainUserId: string
    teamRoster: Week2Player[]
    allTryoutPlayers: Week2Player[]
    isTopDivision: boolean
    isBottomDivision: boolean
    existingSubmissions: ExistingSubmission[]
    allSeasons: SeasonInfo[]
    playerPicUrl: string
}

function getDisplayName(player: Week2Player): string {
    const name = player.preferredName
        ? `${player.preferredName} ${player.lastName}`
        : `${player.firstName} ${player.lastName}`
    return `#${player.oldId} – ${name}`
}

function getShortName(player: Week2Player): string {
    return player.preferredName
        ? `${player.preferredName} ${player.lastName}`
        : `${player.firstName} ${player.lastName}`
}

function buildInitialValues(
    existingSubmissions: ExistingSubmission[],
    isTopDivision: boolean,
    isBottomDivision: boolean
) {
    const forcedUp = existingSubmissions.filter(
        (s) => s.direction === "up" && s.isForced
    )
    const forcedDown = existingSubmissions.filter(
        (s) => s.direction === "down" && s.isForced
    )
    const recommendedUp = existingSubmissions
        .filter((s) => s.direction === "up" && !s.isForced)
        .map((s) => s.playerId)
    const recommendedDown = existingSubmissions
        .filter((s) => s.direction === "down" && !s.isForced)
        .map((s) => s.playerId)

    return {
        forcedMoveUpMale: isTopDivision ? "" : (forcedUp[0]?.playerId ?? ""),
        forcedMoveUpNonMale: isTopDivision ? "" : (forcedUp[1]?.playerId ?? ""),
        forcedMoveDownMale: isBottomDivision
            ? ""
            : (forcedDown[0]?.playerId ?? ""),
        forcedMoveDownNonMale: isBottomDivision
            ? ""
            : (forcedDown[1]?.playerId ?? ""),
        recommendedMoveUp:
            recommendedUp.length > 0 ? recommendedUp : ([] as string[]),
        recommendedMoveDown:
            recommendedDown.length > 0 ? recommendedDown : ([] as string[])
    }
}

interface PlayerSelectProps {
    id: string
    players: Week2Player[]
    value: string
    onValueChange: (val: string) => void
    placeholder: string
    exclude?: string[]
    onPlayerNameClick: (userId: string) => void
}

function PlayerSelect({
    id,
    players,
    value,
    onValueChange,
    placeholder,
    exclude = [],
    onPlayerNameClick
}: PlayerSelectProps) {
    const availablePlayers = players.filter((p) => !exclude.includes(p.userId))
    const selectedPlayer = players.find((p) => p.userId === value)

    return (
        <div className="flex items-center gap-2">
            <Select value={value} onValueChange={onValueChange}>
                <SelectTrigger id={id} className="w-72">
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                    {availablePlayers.map((p) => (
                        <SelectItem key={p.userId} value={p.userId}>
                            {getDisplayName(p)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {selectedPlayer && (
                <button
                    type="button"
                    onClick={() => onPlayerNameClick(selectedPlayer.userId)}
                    className="text-primary text-sm underline underline-offset-2 hover:opacity-80"
                >
                    {getShortName(selectedPlayer)}
                </button>
            )}
        </div>
    )
}

interface PlayerComboboxProps {
    id: string
    players: Week2Player[]
    value: string
    onValueChange: (val: string) => void
    placeholder: string
    exclude?: string[]
    onPlayerNameClick: (userId: string) => void
}

function PlayerCombobox({
    players,
    value,
    onValueChange,
    placeholder,
    exclude = [],
    onPlayerNameClick
}: PlayerComboboxProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")

    const availablePlayers = useMemo(
        () => players.filter((p) => !exclude.includes(p.userId)),
        [players, exclude]
    )

    const selectedPlayer = useMemo(
        () => players.find((p) => p.userId === value) ?? null,
        [players, value]
    )

    const filteredPlayers = useMemo(() => {
        if (!search.trim()) return availablePlayers
        const lower = search.toLowerCase()
        return availablePlayers.filter((p) => {
            const name =
                `${p.preferredName ?? p.firstName} ${p.lastName}`.toLowerCase()
            const fullName = `${p.firstName} ${p.lastName}`.toLowerCase()
            const oldId = String(p.oldId)
            return (
                name.includes(lower) ||
                fullName.includes(lower) ||
                oldId.includes(lower)
            )
        })
    }, [availablePlayers, search])

    const handleSelect = (userId: string) => {
        onValueChange(userId)
        setOpen(false)
        setSearch("")
    }

    const handleClear = () => {
        onValueChange("")
        setSearch("")
    }

    return (
        <div className="flex items-center gap-2">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-72 justify-between font-normal"
                    >
                        <span
                            className={cn(
                                "truncate",
                                !selectedPlayer && "text-muted-foreground"
                            )}
                        >
                            {selectedPlayer
                                ? getDisplayName(selectedPlayer)
                                : placeholder}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                            {selectedPlayer && (
                                <span
                                    role="button"
                                    tabIndex={0}
                                    className="rounded-sm p-0.5 hover:bg-accent"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleClear()
                                    }}
                                    onKeyDown={(e) => {
                                        if (
                                            e.key === "Enter" ||
                                            e.key === " "
                                        ) {
                                            e.stopPropagation()
                                            handleClear()
                                        }
                                    }}
                                >
                                    <RiCloseLine className="h-4 w-4 text-muted-foreground" />
                                </span>
                            )}
                            <RiArrowDownSLine className="h-4 w-4 text-muted-foreground" />
                        </div>
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    className="w-(--radix-popover-trigger-width) p-2"
                    align="start"
                >
                    <Input
                        placeholder="Search by name or #ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="mb-2"
                    />
                    <div className="max-h-60 overflow-y-auto">
                        {filteredPlayers.length === 0 ? (
                            <p className="py-2 text-center text-muted-foreground text-sm">
                                No players found
                            </p>
                        ) : (
                            filteredPlayers.map((p) => (
                                <button
                                    key={p.userId}
                                    type="button"
                                    className={cn(
                                        "w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                                        value === p.userId && "bg-accent"
                                    )}
                                    onClick={() => handleSelect(p.userId)}
                                >
                                    {getDisplayName(p)}
                                </button>
                            ))
                        )}
                    </div>
                </PopoverContent>
            </Popover>
            {selectedPlayer && (
                <button
                    type="button"
                    onClick={() => onPlayerNameClick(selectedPlayer.userId)}
                    className="text-primary text-sm underline underline-offset-2 hover:opacity-80"
                >
                    {getShortName(selectedPlayer)}
                </button>
            )}
        </div>
    )
}

export function Week2HomeworkForm({
    divisionName,
    teamNumber,
    captainUserId,
    teamRoster,
    allTryoutPlayers,
    isTopDivision,
    isBottomDivision,
    existingSubmissions,
    allSeasons,
    playerPicUrl
}: Week2HomeworkFormProps) {
    const router = useRouter()
    const initial = buildInitialValues(
        existingSubmissions,
        isTopDivision,
        isBottomDivision
    )

    const [forcedMoveUpMale, setForcedMoveUpMale] = useState(
        initial.forcedMoveUpMale
    )
    const [forcedMoveUpNonMale, setForcedMoveUpNonMale] = useState(
        initial.forcedMoveUpNonMale
    )
    const [forcedMoveDownMale, setForcedMoveDownMale] = useState(
        initial.forcedMoveDownMale
    )
    const [forcedMoveDownNonMale, setForcedMoveDownNonMale] = useState(
        initial.forcedMoveDownNonMale
    )
    const [recommendedMoveUp, setRecommendedMoveUp] = useState<string[]>(
        initial.recommendedMoveUp
    )
    const [recommendedMoveDown, setRecommendedMoveDown] = useState<string[]>(
        initial.recommendedMoveDown
    )
    const [submitting, setSubmitting] = useState(false)
    const [message, setMessage] = useState<{
        type: "success" | "error"
        text: string
    } | null>(null)

    const modal = usePlayerDetailModal({ fetchFn: getPlayerDetailsPublic })

    const nonCaptainTeamRoster = teamRoster.filter(
        (p) => p.userId !== captainUserId
    )
    const maleTeamPlayers = nonCaptainTeamRoster.filter((p) => p.male === true)
    const nonMaleTeamPlayers = nonCaptainTeamRoster.filter(
        (p) => p.male !== true
    )
    const nonCaptainAllTryoutPlayers = allTryoutPlayers.filter(
        (p) => p.userId !== captainUserId
    )

    const forcedSelections = [
        forcedMoveUpMale,
        forcedMoveUpNonMale,
        forcedMoveDownMale,
        forcedMoveDownNonMale
    ].filter(Boolean)

    const getExcludeForRecUp = (index: number): string[] => [
        ...forcedSelections,
        ...recommendedMoveUp.filter((v, i) => i !== index && Boolean(v)),
        ...recommendedMoveDown.filter(Boolean)
    ]

    const getExcludeForRecDown = (index: number): string[] => [
        ...forcedSelections,
        ...recommendedMoveDown.filter((v, i) => i !== index && Boolean(v)),
        ...recommendedMoveUp.filter(Boolean)
    ]

    const handleAddRecommendedUp = () => {
        setRecommendedMoveUp((prev) => [...prev, ""])
    }

    const handleAddRecommendedDown = () => {
        setRecommendedMoveDown((prev) => [...prev, ""])
    }

    const handleRecommendedUpChange = (index: number, value: string) => {
        setRecommendedMoveUp((prev) => {
            const next = [...prev]
            next[index] = value
            return next
        })
    }

    const handleRecommendedDownChange = (index: number, value: string) => {
        setRecommendedMoveDown((prev) => {
            const next = [...prev]
            next[index] = value
            return next
        })
    }

    const handleRemoveRecommendedUp = (index: number) => {
        setRecommendedMoveUp((prev) => prev.filter((_, i) => i !== index))
    }

    const handleRemoveRecommendedDown = (index: number) => {
        setRecommendedMoveDown((prev) => prev.filter((_, i) => i !== index))
    }

    const handleSubmit = async () => {
        setSubmitting(true)
        setMessage(null)

        const result = await submitWeek2Homework({
            forcedMoveUpMale,
            forcedMoveUpNonMale,
            forcedMoveDownMale,
            forcedMoveDownNonMale,
            recommendedMoveUp: recommendedMoveUp.filter(Boolean),
            recommendedMoveDown: recommendedMoveDown.filter(Boolean)
        })

        setMessage({
            type: result.status ? "success" : "error",
            text: result.message
        })
        setSubmitting(false)

        if (result.status) {
            router.refresh()
        }
    }

    const hasExisting = existingSubmissions.length > 0

    return (
        <div className="space-y-8">
            {/* Roster table */}
            <section className="space-y-4 rounded-lg border bg-card p-5">
                <h2 className="font-semibold text-lg">
                    Your Week 2 Roster — {divisionName}-{teamNumber}
                </h2>
                <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50">
                                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                    ID
                                </th>
                                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                    Name
                                </th>
                                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                    Gender
                                </th>
                                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                    Pair Pick
                                </th>
                                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                    Role
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {teamRoster.map((player) => (
                                <tr
                                    key={player.userId}
                                    className="border-b transition-colors last:border-0 hover:bg-accent/30"
                                >
                                    <td className="px-4 py-2 font-mono text-muted-foreground">
                                        #{player.oldId}
                                    </td>
                                    <td className="px-4 py-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                modal.openPlayerDetail(
                                                    player.userId
                                                )
                                            }
                                            className="text-primary underline underline-offset-2 hover:opacity-80"
                                        >
                                            {player.preferredName
                                                ? `${player.preferredName} ${player.lastName}`
                                                : `${player.firstName} ${player.lastName}`}
                                        </button>
                                    </td>
                                    <td className="px-4 py-2">
                                        {player.male === true
                                            ? "Male"
                                            : player.male === false
                                              ? "Non-Male"
                                              : "—"}
                                    </td>
                                    <td className="px-4 py-2 text-muted-foreground">
                                        {player.pairPickUserId ? (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    modal.openPlayerDetail(
                                                        player.pairPickUserId!
                                                    )
                                                }
                                                className="text-primary underline underline-offset-2 hover:opacity-80"
                                            >
                                                {player.pairPickName ?? "—"}
                                            </button>
                                        ) : (
                                            (player.pairPickName ?? "—")
                                        )}
                                    </td>
                                    <td className="px-4 py-2">
                                        {player.isCaptain ? (
                                            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
                                                Captain
                                            </span>
                                        ) : (
                                            "Player"
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Mandatory picks */}
            {(!isTopDivision || !isBottomDivision) && (
                <section className="space-y-5 rounded-lg border bg-card p-5">
                    <div>
                        <h2 className="font-semibold text-lg">
                            Required Selections
                        </h2>
                        <p className="mt-1 text-muted-foreground text-sm">
                            You must select one male and one non-male player
                            from your team to move in each applicable direction.
                            These picks are mandatory.
                        </p>
                    </div>

                    {!isTopDivision && (
                        <div className="space-y-4 rounded-md border bg-muted/20 p-4">
                            <h3 className="font-medium text-base text-green-700 dark:text-green-400">
                                Move Up (to a stronger division)
                            </h3>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="forced_up_male">
                                        Male player to move up{" "}
                                        <span className="text-destructive">
                                            *
                                        </span>
                                    </Label>
                                    <PlayerSelect
                                        id="forced_up_male"
                                        players={maleTeamPlayers}
                                        value={forcedMoveUpMale}
                                        onValueChange={setForcedMoveUpMale}
                                        placeholder="Select male player..."
                                        exclude={[
                                            forcedMoveUpNonMale,
                                            forcedMoveDownMale,
                                            forcedMoveDownNonMale
                                        ]}
                                        onPlayerNameClick={
                                            modal.openPlayerDetail
                                        }
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="forced_up_nonmale">
                                        Non-male player to move up{" "}
                                        <span className="text-destructive">
                                            *
                                        </span>
                                    </Label>
                                    <PlayerSelect
                                        id="forced_up_nonmale"
                                        players={nonMaleTeamPlayers}
                                        value={forcedMoveUpNonMale}
                                        onValueChange={setForcedMoveUpNonMale}
                                        placeholder="Select non-male player..."
                                        exclude={[
                                            forcedMoveUpMale,
                                            forcedMoveDownMale,
                                            forcedMoveDownNonMale
                                        ]}
                                        onPlayerNameClick={
                                            modal.openPlayerDetail
                                        }
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {!isBottomDivision && (
                        <div className="space-y-4 rounded-md border bg-muted/20 p-4">
                            <h3 className="font-medium text-base text-orange-700 dark:text-orange-400">
                                Move Down (to a weaker division)
                            </h3>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="forced_down_male">
                                        Male player to move down{" "}
                                        <span className="text-destructive">
                                            *
                                        </span>
                                    </Label>
                                    <PlayerSelect
                                        id="forced_down_male"
                                        players={maleTeamPlayers}
                                        value={forcedMoveDownMale}
                                        onValueChange={setForcedMoveDownMale}
                                        placeholder="Select male player..."
                                        exclude={[
                                            forcedMoveDownNonMale,
                                            forcedMoveUpMale,
                                            forcedMoveUpNonMale
                                        ]}
                                        onPlayerNameClick={
                                            modal.openPlayerDetail
                                        }
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="forced_down_nonmale">
                                        Non-male player to move down{" "}
                                        <span className="text-destructive">
                                            *
                                        </span>
                                    </Label>
                                    <PlayerSelect
                                        id="forced_down_nonmale"
                                        players={nonMaleTeamPlayers}
                                        value={forcedMoveDownNonMale}
                                        onValueChange={setForcedMoveDownNonMale}
                                        placeholder="Select non-male player..."
                                        exclude={[
                                            forcedMoveDownMale,
                                            forcedMoveUpMale,
                                            forcedMoveUpNonMale
                                        ]}
                                        onPlayerNameClick={
                                            modal.openPlayerDetail
                                        }
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </section>
            )}

            {/* Recommended picks */}
            <section className="space-y-5 rounded-lg border bg-card p-5">
                <div>
                    <h2 className="font-semibold text-lg">
                        Recommended Moves (Optional)
                    </h2>
                    <p className="mt-1 text-muted-foreground text-sm">
                        Recommend any players from across the entire Week 2
                        tryout to move up or down. These are suggestions only
                        and may not be acted on.
                    </p>
                </div>

                <div className="space-y-3 rounded-md border bg-muted/20 p-4">
                    <h3 className="font-medium text-base text-green-700 dark:text-green-400">
                        Recommend to Move Up
                    </h3>
                    {recommendedMoveUp.length === 0 && (
                        <p className="text-muted-foreground text-sm italic">
                            No recommendations added yet.
                        </p>
                    )}
                    <div className="space-y-2">
                        {recommendedMoveUp.map((val, index) => (
                            <div
                                key={`rec-up-${index}`}
                                className="flex items-center gap-2"
                            >
                                <PlayerCombobox
                                    id={`rec_up_${index}`}
                                    players={nonCaptainAllTryoutPlayers}
                                    value={val}
                                    onValueChange={(v) =>
                                        handleRecommendedUpChange(index, v)
                                    }
                                    placeholder="Search player..."
                                    exclude={getExcludeForRecUp(index)}
                                    onPlayerNameClick={modal.openPlayerDetail}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                        handleRemoveRecommendedUp(index)
                                    }
                                    className="shrink-0 text-muted-foreground hover:text-destructive"
                                >
                                    <RiDeleteBinLine className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddRecommendedUp}
                    >
                        <RiAddLine className="mr-1.5 h-4 w-4" />
                        Add Player
                    </Button>
                </div>

                <div className="space-y-3 rounded-md border bg-muted/20 p-4">
                    <h3 className="font-medium text-base text-orange-700 dark:text-orange-400">
                        Recommend to Move Down
                    </h3>
                    {recommendedMoveDown.length === 0 && (
                        <p className="text-muted-foreground text-sm italic">
                            No recommendations added yet.
                        </p>
                    )}
                    <div className="space-y-2">
                        {recommendedMoveDown.map((val, index) => (
                            <div
                                key={`rec-down-${index}`}
                                className="flex items-center gap-2"
                            >
                                <PlayerCombobox
                                    id={`rec_down_${index}`}
                                    players={nonCaptainAllTryoutPlayers}
                                    value={val}
                                    onValueChange={(v) =>
                                        handleRecommendedDownChange(index, v)
                                    }
                                    placeholder="Search player..."
                                    exclude={getExcludeForRecDown(index)}
                                    onPlayerNameClick={modal.openPlayerDetail}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                        handleRemoveRecommendedDown(index)
                                    }
                                    className="shrink-0 text-muted-foreground hover:text-destructive"
                                >
                                    <RiDeleteBinLine className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddRecommendedDown}
                    >
                        <RiAddLine className="mr-1.5 h-4 w-4" />
                        Add Player
                    </Button>
                </div>
            </section>

            {/* Submit */}
            <div className="space-y-3">
                {message && (
                    <div
                        className={`rounded-md p-3 text-sm ${
                            message.type === "success"
                                ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                                : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                        }`}
                    >
                        {message.text}
                    </div>
                )}
                <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="w-full sm:w-auto"
                >
                    {submitting
                        ? "Submitting..."
                        : hasExisting
                          ? "Update Submission"
                          : "Submit Homework"}
                </Button>
                {hasExisting && (
                    <p className="text-muted-foreground text-sm">
                        You have already submitted this homework. Submitting
                        again will replace your previous selections.
                    </p>
                )}
            </div>

            {/* Player detail popup */}
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
                datesMissing={modal.datesMissing}
                playoffDates={modal.playoffDates}
                ratingAverages={modal.ratingAverages}
                sharedRatingNotes={modal.sharedRatingNotes}
                viewerRating={modal.viewerRating}
            />
        </div>
    )
}
