"use client"

import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import { RiArrowDownSLine, RiCloseLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import { useStorage, useMutation, useSelf, useEventListener } from "@/lib/liveblocks.config"
import { PresenceBar } from "./presence-bar"
import { toast } from "sonner"
import type { TeamOption, UserOption, DivisionSplitConfig } from "./actions"

const ROUNDS = 8

type GenderSplit = "5-3" | "6-2" | "4-4"

interface DraftBoardProps {
    teams: TeamOption[]
    users: UserOption[]
    playerPicUrl: string
    divisionSplits: DivisionSplitConfig[]
    divisionId: string
    role: "commissioner" | "captain"
    captainTeamIds: number[]
    onPicksChange: (picks: Record<string, string | null>) => void
}

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
        () => users.find((u) => u.id === value),
        [users, value]
    )

    const filteredUsers = useMemo(() => {
        const filtered = users.filter(
            (u) => !excludeIds.includes(u.id) || u.id === value
        )
        if (!search) return filtered
        const lowerSearch = search.toLowerCase()
        return filtered.filter((u) => {
            const fullName = `${u.first_name} ${u.last_name}`.toLowerCase()
            const preferredName = u.preffered_name?.toLowerCase() || ""
            const oldIdStr = u.old_id?.toString() || ""
            return (
                fullName.includes(lowerSearch) ||
                preferredName.includes(lowerSearch) ||
                oldIdStr.includes(lowerSearch)
            )
        })
    }, [users, search, excludeIds, value])

    const getDisplayName = (user: UserOption) => {
        const oldIdPart = user.old_id ? `[${user.old_id}] ` : ""
        const preferredPart = user.preffered_name
            ? ` (${user.preffered_name})`
            : ""
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
                    className="h-8 w-full justify-between border-0 bg-transparent font-normal text-xs shadow-none hover:bg-black/5 dark:hover:bg-white/5"
                >
                    <span
                        className={cn(
                            "truncate",
                            !selectedUser && "text-muted-foreground"
                        )}
                    >
                        {selectedUser
                            ? getDisplayName(selectedUser)
                            : placeholder}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                        {selectedUser && (
                            <span
                                role="button"
                                tabIndex={0}
                                className="rounded-sm p-0.5 hover:bg-accent"
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
                        <p className="py-2 text-center text-muted-foreground text-sm">
                            No players found
                        </p>
                    ) : (
                        filteredUsers.map((user) => (
                            <button
                                key={user.id}
                                type="button"
                                className={cn(
                                    "w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
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

export function DraftBoard({
    teams,
    users,
    playerPicUrl,
    divisionSplits,
    divisionId,
    role,
    captainTeamIds,
    onPicksChange
}: DraftBoardProps) {
    const [enlargedPlayer, setEnlargedPlayer] = useState<UserOption | null>(null)

    // Shared Liveblocks state
    const picks = useStorage((root) => root.picks)

    const updatePick = useMutation(
        ({ storage }, round: number, teamId: number, userId: string | null) => {
            const p = storage.get("picks")
            p.set(`${round}-${teamId}`, userId)
        },
        []
    )

    const self = useSelf()

    // Listen for draft submitted event from commissioners
    useEventListener(({ event }) => {
        if (event.type === "DRAFT_SUBMITTED" && role === "captain") {
            toast.success("The draft has been submitted!")
        }
    })

    // Notify parent of pick changes for submit
    useMemo(() => {
        if (picks) {
            const plainPicks: Record<string, string | null> = {}
            for (const [k, v] of picks) {
                plainPicks[k] = v
            }
            onPicksChange(plainPicks)
        }
    }, [picks, onPicksChange])

    const divisionSplitsMap = useMemo(
        () =>
            new Map(
                divisionSplits.map((d) => [
                    d.divisionId,
                    d.genderSplit as GenderSplit
                ])
            ),
        [divisionSplits]
    )

    const genderSplit: GenderSplit | null = divisionId
        ? (divisionSplitsMap.get(parseInt(divisionId)) ?? null)
        : null

    const maxMales = !genderSplit
        ? 999
        : genderSplit === "4-4"
          ? 4
          : genderSplit === "5-3"
            ? 5
            : 6
    const maxFemales = !genderSplit
        ? 999
        : genderSplit === "4-4"
          ? 4
          : genderSplit === "5-3"
            ? 3
            : 2

    const usersMap = useMemo(
        () => new Map(users.map((u) => [u.id, u])),
        [users]
    )

    // Convert LiveMap to plain object for derived state
    const picksObj = useMemo((): Record<string, string | null> => {
        if (!picks) return {}
        const obj: Record<string, string | null> = {}
        for (const [k, v] of picks) {
            obj[k] = v
        }
        return obj
    }, [picks])

    const selectedUserIds = useMemo(
        () =>
            Object.values(picksObj).filter((id): id is string => id !== null),
        [picksObj]
    )

    const duplicateUserIds = useMemo(() => {
        const counts: Record<string, number> = {}
        for (const userId of Object.values(picksObj)) {
            if (userId) {
                counts[userId] = (counts[userId] || 0) + 1
            }
        }
        return new Set(
            Object.entries(counts)
                .filter(([, count]) => count > 1)
                .map(([id]) => id)
        )
    }, [picksObj])

    const teamGenderCounts = useMemo(() => {
        const counts: Record<number, { males: number; females: number }> = {}
        for (const team of teams) {
            counts[team.id] = { males: 0, females: 0 }
        }
        for (const [key, userId] of Object.entries(picksObj)) {
            if (!userId) continue
            const teamId = parseInt(key.split("-")[1])
            const user = usersMap.get(userId)
            if (user && counts[teamId]) {
                if (user.male === true) {
                    counts[teamId].males++
                } else {
                    counts[teamId].females++
                }
            }
        }
        return counts
    }, [picksObj, teams, usersMap])

    const playersByTeam = useMemo(() => {
        const grouped: Record<number, UserOption[]> = {}
        for (const team of teams) {
            grouped[team.id] = []
        }
        for (const [key, userId] of Object.entries(picksObj)) {
            if (!userId) continue
            const teamId = parseInt(key.split("-")[1])
            const user = usersMap.get(userId)
            if (user && grouped[teamId]) {
                grouped[teamId].push(user)
            }
        }
        return grouped
    }, [picksObj, teams, usersMap])

    const getCellViolation = (teamId: number, userId: string | null): boolean => {
        if (!userId) return false
        const user = usersMap.get(userId)
        if (!user) return false
        const counts = teamGenderCounts[teamId]
        if (!counts) return false
        if (user.male === true && counts.males > maxMales) return true
        if (user.male !== true && counts.females > maxFemales) return true
        return false
    }

    const getCellStyle = (teamId: number, userId: string | null): string => {
        if (!userId) return ""
        const user = usersMap.get(userId)
        if (!user) return ""
        if (duplicateUserIds.has(userId)) return "bg-red-200 dark:bg-red-900"
        if (getCellViolation(teamId, userId)) return "bg-red-200 dark:bg-red-900"
        if (user.male === true) return "bg-blue-100 dark:bg-blue-900/50"
        return "bg-pink-100 dark:bg-pink-900/50"
    }

    // Determine whose turn it is (snake draft order)
    // Teams are sorted by team.number; snake: odd rounds ascending, even rounds descending
    const sortedTeams = useMemo(
        () => [...teams].sort((a, b) => (a.number ?? 0) - (b.number ?? 0)),
        [teams]
    )

    const currentTurn = useMemo(() => {
        for (let round = 1; round <= ROUNDS; round++) {
            const isOddRound = round % 2 === 1
            const orderedTeams = isOddRound
                ? sortedTeams
                : [...sortedTeams].reverse()
            for (const team of orderedTeams) {
                const key = `${round}-${team.id}`
                if (!picksObj[key]) {
                    return { team, round }
                }
            }
        }
        return null // all picks complete
    }, [picksObj, sortedTeams])

    const canEditCell = (teamId: number): boolean => {
        if (role === "commissioner") return true
        return captainTeamIds.includes(teamId)
    }

    if (picks === null) {
        return (
            <p className="text-muted-foreground text-sm">
                Loading draft board...
            </p>
        )
    }

    return (
        <div>
            <PresenceBar />

            {/* Turn indicator */}
            <div
                className={cn(
                    "mb-4 rounded-lg border px-4 py-3 text-sm font-medium",
                    currentTurn
                        ? "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100"
                        : "border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100"
                )}
            >
                {currentTurn ? (
                    <>
                        <span className="font-semibold">
                            {currentTurn.team.name}
                        </span>{" "}
                        is up to pick — Round {currentTurn.round}
                        {self?.info && captainTeamIds.includes(currentTurn.team.id) && (
                            <span className="ml-2 rounded-full bg-blue-200 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-800 dark:text-blue-100">
                                Your pick!
                            </span>
                        )}
                    </>
                ) : (
                    "All picks complete — ready to submit"
                )}
            </div>

            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr>
                            <th className="w-24 border bg-muted p-2 text-left font-semibold text-sm">
                                Round
                            </th>
                            {teams.map((team) => (
                                <th
                                    key={team.id}
                                    className={cn(
                                        "min-w-48 border p-2 text-center font-semibold text-sm",
                                        currentTurn?.team.id === team.id
                                            ? "bg-blue-100 dark:bg-blue-900/40"
                                            : "bg-muted"
                                    )}
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
                                    <td className="border bg-muted/50 p-2 font-medium text-sm">
                                        Round {round}
                                    </td>
                                    {teams.map((team) => {
                                        const userId =
                                            picksObj[`${round}-${team.id}`] ||
                                            null
                                        const cellStyle = getCellStyle(
                                            team.id,
                                            userId
                                        )
                                        const editable = canEditCell(team.id)
                                        return (
                                            <td
                                                key={team.id}
                                                className={cn(
                                                    "border p-1",
                                                    cellStyle
                                                )}
                                            >
                                                {editable ? (
                                                    <UserCombobox
                                                        users={users}
                                                        value={userId}
                                                        onChange={(newUserId) =>
                                                            updatePick(
                                                                round,
                                                                team.id,
                                                                newUserId
                                                            )
                                                        }
                                                        placeholder="Select player..."
                                                        excludeIds={
                                                            selectedUserIds
                                                        }
                                                    />
                                                ) : (
                                                    <div className="h-8 px-2 flex items-center text-xs truncate">
                                                        {userId
                                                            ? (() => {
                                                                  const u =
                                                                      usersMap.get(
                                                                          userId
                                                                      )
                                                                  if (!u)
                                                                      return userId
                                                                  return u.preffered_name
                                                                      ? `${u.first_name} (${u.preffered_name}) ${u.last_name}`
                                                                      : `${u.first_name} ${u.last_name}`
                                                              })()
                                                            : ""}
                                                    </div>
                                                )}
                                            </td>
                                        )
                                    })}
                                </tr>
                            )
                        })}
                        {/* Gender count row */}
                        <tr>
                            <td className="border bg-muted p-2 font-medium text-sm">
                                Count
                            </td>
                            {teams.map((team) => {
                                const counts = teamGenderCounts[team.id] || {
                                    males: 0,
                                    females: 0
                                }
                                const maleOverLimit = counts.males > maxMales
                                const femaleOverLimit =
                                    counts.females > maxFemales
                                return (
                                    <td
                                        key={team.id}
                                        className="border p-2 text-center text-sm"
                                    >
                                        <span
                                            className={cn(
                                                "mr-1 inline-block rounded px-2 py-0.5",
                                                maleOverLimit
                                                    ? "bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200"
                                                    : "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200"
                                            )}
                                        >
                                            M: {counts.males}
                                        </span>
                                        <span
                                            className={cn(
                                                "inline-block rounded px-2 py-0.5",
                                                femaleOverLimit
                                                    ? "bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200"
                                                    : "bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-200"
                                            )}
                                        >
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
                <div className="mt-6 border-t pt-6">
                    <h3 className="mb-4 font-semibold">Team Rosters</h3>
                    <div className="space-y-3">
                        {teams.map((team) => {
                            const players = playersByTeam[team.id] || []
                            if (players.length === 0) return null
                            return (
                                <div
                                    key={team.id}
                                    className="flex items-start gap-3"
                                >
                                    <div className="w-24 shrink-0 pt-2">
                                        <span className="font-medium text-muted-foreground text-sm">
                                            {team.name}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {players.map((player) => (
                                            <button
                                                type="button"
                                                key={player.id}
                                                onClick={() =>
                                                    setEnlargedPlayer(player)
                                                }
                                                className={cn(
                                                    "flex cursor-pointer flex-col items-center rounded-lg border p-1.5 transition-opacity hover:opacity-80",
                                                    player.male === true
                                                        ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
                                                        : "border-pink-200 bg-pink-50 dark:border-pink-800 dark:bg-pink-900/20"
                                                )}
                                            >
                                                {player.picture ? (
                                                    <img
                                                        src={`${playerPicUrl}${player.picture}`}
                                                        alt={`${player.first_name} ${player.last_name}`}
                                                        className="h-18 w-12 rounded object-cover"
                                                    />
                                                ) : (
                                                    <div className="flex h-18 w-12 items-center justify-center rounded bg-muted text-muted-foreground text-xs">
                                                        No photo
                                                    </div>
                                                )}
                                                <span className="mt-1 max-w-14 truncate text-center text-xs">
                                                    {player.preffered_name ||
                                                        player.first_name}
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

            {/* Enlarged Player Image Modal */}
            {enlargedPlayer && playerPicUrl && (
                <div
                    className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 p-4"
                    onClick={() => setEnlargedPlayer(null)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") setEnlargedPlayer(null)
                    }}
                    role="button"
                    tabIndex={0}
                >
                    <div
                        className={cn(
                            "relative rounded-xl p-4",
                            enlargedPlayer.male === true
                                ? "bg-blue-50 dark:bg-blue-900/40"
                                : "bg-pink-50 dark:bg-pink-900/40"
                        )}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        role="dialog"
                    >
                        <button
                            type="button"
                            className="-top-2 -right-2 absolute rounded-full bg-background p-1 shadow-lg hover:bg-accent"
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
                            <div className="flex h-[80vh] w-[53vh] items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                No photo
                            </div>
                        )}
                        <p className="mt-3 text-center font-medium">
                            {enlargedPlayer.preffered_name
                                ? `${enlargedPlayer.first_name} (${enlargedPlayer.preffered_name}) ${enlargedPlayer.last_name}`
                                : `${enlargedPlayer.first_name} ${enlargedPlayer.last_name}`}
                        </p>
                        {enlargedPlayer.old_id && (
                            <p className="text-center text-muted-foreground text-sm">
                                ID: {enlargedPlayer.old_id}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
