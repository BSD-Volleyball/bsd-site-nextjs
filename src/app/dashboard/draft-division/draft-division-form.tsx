"use client"

import { useState, useMemo } from "react"
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
    CardDescription
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import { RiArrowDownSLine, RiCloseLine, RiFullscreenLine, RiFullscreenExitLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import {
    getTeamsForSeasonAndDivision,
    submitDraft,
    type SeasonOption,
    type DivisionOption,
    type TeamOption,
    type UserOption
} from "./actions"

interface DraftDivisionFormProps {
    seasons: SeasonOption[]
    divisions: DivisionOption[]
    users: UserOption[]
    playerPicUrl: string
}

const ROUNDS = 8

type GenderSplit = "5-3" | "6-2"

function UserCombobox({
    users,
    value,
    onChange,
    placeholder = "Select a player...",
    excludeIds = []
}: {
    users: UserOption[]
    value: string | null
    onChange: (userId: string | null) => void
    placeholder?: string
    excludeIds?: string[]
}) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")

    const selectedUser = useMemo(
        () => users.find(u => u.id === value),
        [users, value]
    )

    const filteredUsers = useMemo(() => {
        let filtered = users.filter(u => !excludeIds.includes(u.id) || u.id === value)
        if (!search) return filtered
        const lowerSearch = search.toLowerCase()
        return filtered.filter(u => {
            const fullName = `${u.first_name} ${u.last_name}`.toLowerCase()
            const preferredName = u.preffered_name?.toLowerCase() || ""
            const oldIdStr = u.old_id?.toString() || ""
            return fullName.includes(lowerSearch) || preferredName.includes(lowerSearch) || oldIdStr.includes(lowerSearch)
        })
    }, [users, search, excludeIds, value])

    const getDisplayName = (user: UserOption) => {
        const oldIdPart = user.old_id ? `[${user.old_id}] ` : ""
        const preferredPart = user.preffered_name ? ` (${user.preffered_name})` : ""
        return `${oldIdPart}${user.first_name}${preferredPart} ${user.last_name}`
    }

    const handleSelect = (userId: string) => {
        onChange(userId)
        setOpen(false)
        setSearch("")
    }

    const handleClear = () => {
        onChange(null)
        setSearch("")
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal text-xs h-8 border-0 shadow-none bg-transparent hover:bg-black/5 dark:hover:bg-white/5"
                >
                    <span className={cn("truncate", !selectedUser && "text-muted-foreground")}>
                        {selectedUser ? getDisplayName(selectedUser) : placeholder}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                        {selectedUser && (
                            <span
                                role="button"
                                tabIndex={0}
                                className="rounded-sm hover:bg-accent p-0.5"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleClear()
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.stopPropagation()
                                        handleClear()
                                    }
                                }}
                            >
                                <RiCloseLine className="h-3 w-3 text-muted-foreground" />
                            </span>
                        )}
                        <RiArrowDownSLine className="h-3 w-3 text-muted-foreground" />
                    </div>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
                <Input
                    placeholder="Search players..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoCorrect="off"
                    className="mb-2 h-8 text-sm"
                />
                <div className="max-h-60 overflow-y-auto">
                    {filteredUsers.length === 0 ? (
                        <p className="text-muted-foreground text-sm py-2 text-center">
                            No players found
                        </p>
                    ) : (
                        filteredUsers.map(user => (
                            <button
                                key={user.id}
                                type="button"
                                className={cn(
                                    "w-full text-left px-2 py-1.5 rounded-sm text-sm hover:bg-accent",
                                    value === user.id && "bg-accent"
                                )}
                                onClick={() => handleSelect(user.id)}
                            >
                                {getDisplayName(user)}
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}

export function DraftDivisionForm({ seasons, divisions, users, playerPicUrl }: DraftDivisionFormProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingTeams, setIsLoadingTeams] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [isExpanded, setIsExpanded] = useState(false)
    const [enlargedPlayer, setEnlargedPlayer] = useState<UserOption | null>(null)

    const [seasonId, setSeasonId] = useState<string>("")
    const [divisionId, setDivisionId] = useState<string>("")
    const [genderSplit, setGenderSplit] = useState<GenderSplit>("5-3")
    const [teamsList, setTeamsList] = useState<TeamOption[]>([])

    // Draft picks: keyed by "round-teamId"
    const [draftPicks, setDraftPicks] = useState<Record<string, string | null>>({})

    const selectedDivision = useMemo(
        () => divisions.find(d => d.id.toString() === divisionId),
        [divisions, divisionId]
    )

    // Get all selected user IDs to exclude from other pickers
    const selectedUserIds = useMemo(
        () => Object.values(draftPicks).filter((id): id is string => id !== null),
        [draftPicks]
    )

    // Track duplicate user IDs (users selected more than once)
    const duplicateUserIds = useMemo(() => {
        const counts: Record<string, number> = {}
        for (const userId of Object.values(draftPicks)) {
            if (userId) {
                counts[userId] = (counts[userId] || 0) + 1
            }
        }
        return new Set(Object.entries(counts).filter(([_, count]) => count > 1).map(([id]) => id))
    }, [draftPicks])

    // Create a map of userId to user for quick lookup
    const usersMap = useMemo(
        () => new Map(users.map(u => [u.id, u])),
        [users]
    )

    // Calculate gender counts per team
    const teamGenderCounts = useMemo(() => {
        const counts: Record<number, { males: number; females: number }> = {}
        for (const team of teamsList) {
            counts[team.id] = { males: 0, females: 0 }
        }
        for (const [key, userId] of Object.entries(draftPicks)) {
            if (!userId) continue
            const teamId = parseInt(key.split("-")[1])
            const user = usersMap.get(userId)
            if (user) {
                if (user.male === true) {
                    counts[teamId].males++
                } else {
                    counts[teamId].females++
                }
            }
        }
        return counts
    }, [draftPicks, teamsList, usersMap])

    // Get the max allowed for each gender based on split
    const maxMales = genderSplit === "5-3" ? 5 : 6
    const maxFemales = genderSplit === "5-3" ? 3 : 2

    // Group selected players by team for picture display
    const playersByTeam = useMemo(() => {
        const grouped: Record<number, UserOption[]> = {}
        for (const team of teamsList) {
            grouped[team.id] = []
        }
        for (const [key, userId] of Object.entries(draftPicks)) {
            if (!userId) continue
            const teamId = parseInt(key.split("-")[1])
            const user = usersMap.get(userId)
            if (user && grouped[teamId]) {
                grouped[teamId].push(user)
            }
        }
        return grouped
    }, [draftPicks, teamsList, usersMap])

    // Check if a cell violates the gender split
    const getCellViolation = (teamId: number, userId: string | null): boolean => {
        if (!userId) return false
        const user = usersMap.get(userId)
        if (!user) return false

        const counts = teamGenderCounts[teamId]
        if (!counts) return false

        if (user.male === true && counts.males > maxMales) {
            return true
        }
        if (user.male !== true && counts.females > maxFemales) {
            return true
        }
        return false
    }

    // Get cell background color based on gender and violation
    const getCellStyle = (teamId: number, userId: string | null): string => {
        if (!userId) return ""
        const user = usersMap.get(userId)
        if (!user) return ""

        // Check for duplicate selection first
        if (duplicateUserIds.has(userId)) {
            return "bg-red-200 dark:bg-red-900"
        }

        const isViolation = getCellViolation(teamId, userId)
        if (isViolation) {
            return "bg-red-200 dark:bg-red-900"
        }

        if (user.male === true) {
            return "bg-blue-100 dark:bg-blue-900/50"
        } else {
            return "bg-pink-100 dark:bg-pink-900/50"
        }
    }

    const handleSeasonChange = async (value: string) => {
        setSeasonId(value)
        setTeamsList([])
        setDraftPicks({})
        setError(null)
        setSuccess(null)

        if (value && divisionId) {
            await loadTeams(parseInt(value), parseInt(divisionId))
        }
    }

    const handleDivisionChange = async (value: string) => {
        setDivisionId(value)
        setTeamsList([])
        setDraftPicks({})
        setError(null)
        setSuccess(null)

        if (seasonId && value) {
            await loadTeams(parseInt(seasonId), parseInt(value))
        }
    }

    const loadTeams = async (season: number, division: number) => {
        setIsLoadingTeams(true)
        const result = await getTeamsForSeasonAndDivision(season, division)
        if (result.status) {
            setTeamsList(result.teams)
        } else {
            setError(result.message || "Failed to load teams.")
        }
        setIsLoadingTeams(false)
    }

    const handlePickChange = (round: number, teamId: number, userId: string | null) => {
        setDraftPicks(prev => ({
            ...prev,
            [`${round}-${teamId}`]: userId
        }))
    }

    const formatSeasonLabel = (season: SeasonOption) => {
        const seasonName = season.season.charAt(0).toUpperCase() + season.season.slice(1)
        return `${seasonName} ${season.year}`
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setSuccess(null)

        if (!seasonId) {
            setError("Please select a season.")
            return
        }

        if (!divisionId || !selectedDivision) {
            setError("Please select a division.")
            return
        }

        if (teamsList.length === 0) {
            setError("No teams found for the selected season and division.")
            return
        }

        // Build picks array
        const picks = []
        for (let round = 1; round <= ROUNDS; round++) {
            for (const team of teamsList) {
                const userId = draftPicks[`${round}-${team.id}`]
                if (userId) {
                    picks.push({
                        teamId: team.id,
                        teamNumber: team.number || 0,
                        userId,
                        round
                    })
                }
            }
        }

        if (picks.length === 0) {
            setError("Please select at least one player.")
            return
        }

        setIsLoading(true)

        const result = await submitDraft(selectedDivision.level, picks)

        if (result.status) {
            setSuccess(result.message)
            // Reset draft picks
            setDraftPicks({})
        } else {
            setError(result.message)
        }

        setIsLoading(false)
    }

    return (
        <div className={cn(
            isExpanded && "fixed inset-0 z-50 bg-background p-4 overflow-auto flex items-start justify-center"
        )}>
            <form onSubmit={handleSubmit} className={cn(isExpanded && "w-[95vw]")}>
                <Card>
                    <CardHeader className="flex flex-row items-start justify-between space-y-0">
                        <div>
                            <CardTitle>Draft Configuration</CardTitle>
                            <CardDescription>
                                Select the season and division to load the teams for drafting.
                            </CardDescription>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setIsExpanded(!isExpanded)}
                            title={isExpanded ? "Exit fullscreen" : "Expand to fullscreen"}
                        >
                            {isExpanded ? (
                                <RiFullscreenExitLine className="h-4 w-4" />
                            ) : (
                                <RiFullscreenLine className="h-4 w-4" />
                            )}
                        </Button>
                    </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-3 gap-4 max-w-2xl">
                        <div className="space-y-2">
                            <Label htmlFor="season">
                                Season <span className="text-destructive">*</span>
                            </Label>
                            <Select value={seasonId} onValueChange={handleSeasonChange}>
                                <SelectTrigger id="season">
                                    <SelectValue placeholder="Select a season" />
                                </SelectTrigger>
                                <SelectContent>
                                    {seasons.map((season) => (
                                        <SelectItem key={season.id} value={season.id.toString()}>
                                            {formatSeasonLabel(season)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="division">
                                Division <span className="text-destructive">*</span>
                            </Label>
                            <Select value={divisionId} onValueChange={handleDivisionChange}>
                                <SelectTrigger id="division">
                                    <SelectValue placeholder="Select a division" />
                                </SelectTrigger>
                                <SelectContent>
                                    {divisions.map((division) => (
                                        <SelectItem key={division.id} value={division.id.toString()}>
                                            {division.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>
                                Split <span className="text-destructive">*</span>
                            </Label>
                            <RadioGroup
                                value={genderSplit}
                                onValueChange={(value) => setGenderSplit(value as GenderSplit)}
                                className="flex gap-4 h-9 items-center"
                            >
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="5-3" id="split-5-3" />
                                    <Label htmlFor="split-5-3" className="font-normal cursor-pointer">
                                        5-3
                                    </Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="6-2" id="split-6-2" />
                                    <Label htmlFor="split-6-2" className="font-normal cursor-pointer">
                                        6-2
                                    </Label>
                                </div>
                            </RadioGroup>
                        </div>
                    </div>

                    {isLoadingTeams && (
                        <p className="text-muted-foreground">Loading teams...</p>
                    )}

                    {teamsList.length > 0 && (
                        <div className="border-t pt-6">
                            <h3 className="font-semibold mb-4">Draft Board</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr>
                                            <th className="border p-2 bg-muted text-left font-semibold text-sm w-24">
                                                Round
                                            </th>
                                            {teamsList.map((team) => (
                                                <th
                                                    key={team.id}
                                                    className="border p-2 bg-muted text-center font-semibold text-sm min-w-48"
                                                >
                                                    {team.name}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({ length: ROUNDS }).map((_, roundIndex) => {
                                            const round = roundIndex + 1
                                            return (
                                                <tr key={round}>
                                                    <td className="border p-2 bg-muted/50 font-medium text-sm">
                                                        Round {round}
                                                    </td>
                                                    {teamsList.map((team) => {
                                                        const userId = draftPicks[`${round}-${team.id}`] || null
                                                        const cellStyle = getCellStyle(team.id, userId)
                                                        return (
                                                            <td
                                                                key={team.id}
                                                                className={cn("border p-1", cellStyle)}
                                                            >
                                                                <UserCombobox
                                                                    users={users}
                                                                    value={userId}
                                                                    onChange={(newUserId) => handlePickChange(round, team.id, newUserId)}
                                                                    placeholder="Select player..."
                                                                    excludeIds={selectedUserIds}
                                                                />
                                                            </td>
                                                        )
                                                    })}
                                                </tr>
                                            )
                                        })}
                                        {/* Gender count row */}
                                        <tr>
                                            <td className="border p-2 bg-muted font-medium text-sm">
                                                Count
                                            </td>
                                            {teamsList.map((team) => {
                                                const counts = teamGenderCounts[team.id] || { males: 0, females: 0 }
                                                const maleOverLimit = counts.males > maxMales
                                                const femaleOverLimit = counts.females > maxFemales
                                                return (
                                                    <td
                                                        key={team.id}
                                                        className="border p-2 text-center text-sm"
                                                    >
                                                        <span className={cn(
                                                            "inline-block px-2 py-0.5 rounded mr-1",
                                                            maleOverLimit
                                                                ? "bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200"
                                                                : "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200"
                                                        )}>
                                                            M: {counts.males}
                                                        </span>
                                                        <span className={cn(
                                                            "inline-block px-2 py-0.5 rounded",
                                                            femaleOverLimit
                                                                ? "bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200"
                                                                : "bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-200"
                                                        )}>
                                                            F: {counts.females}
                                                        </span>
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                        {/* Player Pictures by Team */}
                        {playerPicUrl && (
                            <div className="border-t pt-6 mt-6">
                                <h3 className="font-semibold mb-4">Team Rosters</h3>
                                <div className="space-y-3">
                                    {teamsList.map((team) => {
                                        const players = playersByTeam[team.id] || []
                                        if (players.length === 0) return null
                                        return (
                                            <div key={team.id} className="flex items-start gap-3">
                                                <div className="w-24 shrink-0 pt-2">
                                                    <span className="font-medium text-sm text-muted-foreground">{team.name}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {players.map((player) => (
                                                        <button
                                                            type="button"
                                                            key={player.id}
                                                            onClick={() => setEnlargedPlayer(player)}
                                                            className={cn(
                                                                "flex flex-col items-center p-1.5 rounded-lg border cursor-pointer hover:opacity-80 transition-opacity",
                                                                player.male === true
                                                                    ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800"
                                                                    : "bg-pink-50 border-pink-200 dark:bg-pink-900/20 dark:border-pink-800"
                                                            )}
                                                        >
                                                            {player.picture ? (
                                                                <img
                                                                    src={`${playerPicUrl}${player.picture}`}
                                                                    alt={`${player.first_name} ${player.last_name}`}
                                                                    className="w-12 h-18 rounded object-cover"
                                                                />
                                                            ) : (
                                                                <div className="w-12 h-18 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs">
                                                                    No photo
                                                                </div>
                                                            )}
                                                            <span className="text-xs mt-1 text-center max-w-14 truncate">
                                                                {player.preffered_name || player.first_name}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                        </div>
                    )}

                    {seasonId && divisionId && !isLoadingTeams && teamsList.length === 0 && (
                        <p className="text-muted-foreground">
                            No teams found for the selected season and division.
                        </p>
                    )}

                    {error && (
                        <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm dark:bg-red-950 dark:text-red-200">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="rounded-md bg-green-50 p-3 text-green-800 text-sm dark:bg-green-950 dark:text-green-200">
                            {success}
                        </div>
                    )}
                </CardContent>
                <CardFooter className="border-t pt-6">
                    <Button
                        type="submit"
                        disabled={isLoading || teamsList.length === 0}
                        className="ml-auto"
                    >
                        {isLoading ? "Submitting..." : "Submit Draft"}
                    </Button>
                </CardFooter>
            </Card>
        </form>

            {/* Enlarged Player Image Modal */}
            {enlargedPlayer && playerPicUrl && (
                <div
                    className="fixed inset-0 z-100 bg-black/70 flex items-center justify-center p-4"
                    onClick={() => setEnlargedPlayer(null)}
                >
                    <div
                        className={cn(
                            "relative rounded-xl p-4",
                            enlargedPlayer.male === true
                                ? "bg-blue-50 dark:bg-blue-900/40"
                                : "bg-pink-50 dark:bg-pink-900/40"
                        )}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            className="absolute -top-2 -right-2 bg-background rounded-full p-1 shadow-lg hover:bg-accent"
                            onClick={() => setEnlargedPlayer(null)}
                        >
                            <RiCloseLine className="h-5 w-5" />
                        </button>
                        {enlargedPlayer.picture ? (
                            <img
                                src={`${playerPicUrl}${enlargedPlayer.picture}`}
                                alt={`${enlargedPlayer.first_name} ${enlargedPlayer.last_name}`}
                                className="max-h-[80vh] w-auto rounded-lg object-contain"
                            />
                        ) : (
                            <div className="h-[80vh] w-[53vh] rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                                No photo
                            </div>
                        )}
                        <p className="text-center mt-3 font-medium">
                            {enlargedPlayer.preffered_name
                                ? `${enlargedPlayer.first_name} (${enlargedPlayer.preffered_name}) ${enlargedPlayer.last_name}`
                                : `${enlargedPlayer.first_name} ${enlargedPlayer.last_name}`
                            }
                        </p>
                        {enlargedPlayer.old_id && (
                            <p className="text-center text-sm text-muted-foreground">
                                ID: {enlargedPlayer.old_id}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
