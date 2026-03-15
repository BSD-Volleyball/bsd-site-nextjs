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
    submitCoachWeek2Homework,
    type Week2Player,
    type CoachExistingSubmission,
    type CoachTeamRoster,
    type SeasonInfo
} from "./actions"
import { getPlayerDetailsPublic } from "@/app/dashboard/view-signups/actions"

interface CoachWeek2HomeworkFormProps {
    seasonId: number
    divisionName: string
    coachUserId: string
    isTopDivision: boolean
    isBottomDivision: boolean
    divisionTeams: CoachTeamRoster[]
    allTryoutPlayers: Week2Player[]
    existingSubmissions: CoachExistingSubmission[]
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

interface PlayerSelectProps {
    id: string
    players: Week2Player[]
    value: string
    onValueChange: (val: string) => void
    placeholder: string
    onPlayerNameClick: (userId: string) => void
}

function PlayerSelect({
    id,
    players,
    value,
    onValueChange,
    placeholder,
    onPlayerNameClick
}: PlayerSelectProps) {
    const selectedPlayer = players.find((p) => p.userId === value)

    return (
        <div className="flex items-center gap-2">
            <Select value={value} onValueChange={onValueChange}>
                <SelectTrigger id={id} className="w-72">
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                    {players.map((p) => (
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
    onPlayerNameClick: (userId: string) => void
}

function PlayerCombobox({
    players,
    value,
    onValueChange,
    placeholder,
    onPlayerNameClick
}: PlayerComboboxProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")

    const selectedPlayer = useMemo(
        () => players.find((p) => p.userId === value) ?? null,
        [players, value]
    )

    const filteredPlayers = useMemo(() => {
        if (!search.trim()) return players
        const lower = search.toLowerCase()
        return players.filter((p) => {
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
    }, [players, search])

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

export function CoachWeek2HomeworkForm({
    divisionName,
    isTopDivision,
    divisionTeams,
    allTryoutPlayers,
    existingSubmissions,
    allSeasons,
    playerPicUrl
}: CoachWeek2HomeworkFormProps) {
    const router = useRouter()

    // Build initial forced move-up map from existing submissions.
    // The teamNumber is recovered by joining week2Rosters in the action.
    const initialForcedMoveUpByTeam: Record<number, string> = {}
    for (const sub of existingSubmissions) {
        if (sub.isForced && sub.direction === "up" && sub.teamNumber !== null) {
            initialForcedMoveUpByTeam[sub.teamNumber] = sub.playerId
        }
    }

    const initialRecommendedUp = existingSubmissions
        .filter((s) => s.direction === "up" && !s.isForced)
        .map((s) => s.playerId)

    const initialRecommendedDown = existingSubmissions
        .filter((s) => s.direction === "down" && !s.isForced)
        .map((s) => s.playerId)

    const [forcedMoveUpByTeam, setForcedMoveUpByTeam] = useState<
        Record<number, string>
    >(initialForcedMoveUpByTeam)
    const [recommendedMoveUp, setRecommendedMoveUp] = useState<string[]>(
        initialRecommendedUp.length > 0 ? initialRecommendedUp : []
    )
    const [recommendedMoveDown, setRecommendedMoveDown] = useState<string[]>(
        initialRecommendedDown.length > 0 ? initialRecommendedDown : []
    )
    const [submitting, setSubmitting] = useState(false)
    const [message, setMessage] = useState<{
        type: "success" | "error"
        text: string
    } | null>(null)

    const modal = usePlayerDetailModal({ fetchFn: getPlayerDetailsPublic })

    const hasExisting = existingSubmissions.length > 0

    const handleForcedMoveUpChange = (teamNumber: number, value: string) => {
        setForcedMoveUpByTeam((prev) => ({ ...prev, [teamNumber]: value }))
    }

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

        const forcedMoveUpByTeamInput = Object.entries(forcedMoveUpByTeam).map(
            ([teamNumber, playerId]) => ({
                teamNumber: Number(teamNumber),
                playerId
            })
        )

        const result = await submitCoachWeek2Homework({
            forcedMoveUpByTeam: forcedMoveUpByTeamInput,
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

    return (
        <div className="space-y-8">
            {/* Required move-up picks, one per team */}
            {!isTopDivision ? (
                <section className="space-y-4 rounded-lg border bg-card p-5">
                    <div>
                        <h2 className="font-semibold text-lg">
                            Required Selections — Move Up
                        </h2>
                        <p className="mt-1 text-muted-foreground text-sm">
                            Select one player from each team to move up to a
                            stronger division. These picks are required.
                        </p>
                    </div>

                    <div className="space-y-6">
                        {divisionTeams.map((team) => (
                            <div
                                key={team.teamNumber}
                                className="space-y-3 rounded-md border bg-muted/20 p-4"
                            >
                                <h3 className="font-medium text-base text-green-700 dark:text-green-400">
                                    Team {divisionName}-{team.teamNumber}
                                </h3>

                                <div className="overflow-x-auto rounded-lg border">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b bg-muted/50">
                                                <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                                                    ID
                                                </th>
                                                <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                                                    Name
                                                </th>
                                                <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                                                    Gender
                                                </th>
                                                <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                                                    Role
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {team.players.map((player) => (
                                                <tr
                                                    key={player.userId}
                                                    className={cn(
                                                        "border-b transition-colors last:border-0 hover:bg-accent/30",
                                                        forcedMoveUpByTeam[
                                                            team.teamNumber
                                                        ] === player.userId &&
                                                            "bg-green-50 dark:bg-green-950/30"
                                                    )}
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
                                                            : player.male ===
                                                                false
                                                              ? "Non-Male"
                                                              : "—"}
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

                                <div className="space-y-2">
                                    <Label
                                        htmlFor={`forced_up_${team.teamNumber}`}
                                    >
                                        Player to move up{" "}
                                        <span className="text-destructive">
                                            *
                                        </span>
                                    </Label>
                                    <PlayerSelect
                                        id={`forced_up_${team.teamNumber}`}
                                        players={team.players}
                                        value={
                                            forcedMoveUpByTeam[
                                                team.teamNumber
                                            ] ?? ""
                                        }
                                        onValueChange={(v) =>
                                            handleForcedMoveUpChange(
                                                team.teamNumber,
                                                v
                                            )
                                        }
                                        placeholder="Select player to move up..."
                                        onPlayerNameClick={
                                            modal.openPlayerDetail
                                        }
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            ) : (
                <div className="rounded-md border bg-muted/30 p-4 text-muted-foreground text-sm">
                    This is the top division ({divisionName}). No players can
                    move up from this division.
                </div>
            )}

            {/* Optional recommendations */}
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
                                    players={allTryoutPlayers}
                                    value={val}
                                    onValueChange={(v) =>
                                        handleRecommendedUpChange(index, v)
                                    }
                                    placeholder="Search player..."
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
                                    players={allTryoutPlayers}
                                    value={val}
                                    onValueChange={(v) =>
                                        handleRecommendedDownChange(index, v)
                                    }
                                    placeholder="Search player..."
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
