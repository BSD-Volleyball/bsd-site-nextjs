"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import { RiArrowDownSLine, RiCloseLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import {
    useStorage,
    useMutation,
    useSelf,
    useEventListener
} from "@/lib/liveblocks.config"
import { PresenceBar } from "./presence-bar"
import { toast } from "sonner"
import {
    usePlayerDetailModal,
    PlayerDetailPopup
} from "@/components/player-detail"
import { getPlayerDetailsPublic } from "@/app/dashboard/view-signups/actions"
import type {
    TeamOption,
    UserOption,
    DivisionSplitConfig,
    PairEntry
} from "./actions"

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
    initialPicks: Record<string, string>
    pairMap: PairEntry[]
}

function findAvailablePairSlot(
    targetRound: number,
    teamId: number,
    currentPicks: Record<string, string | null>,
    excludeRound: number
): number | null {
    // Try target first, then search outward: +1, -1, +2, -2, ...
    if (
        targetRound >= 1 &&
        targetRound <= ROUNDS &&
        targetRound !== excludeRound &&
        !currentPicks[`${targetRound}-${teamId}`]
    ) {
        return targetRound
    }
    for (let offset = 1; offset < ROUNDS; offset++) {
        const up = targetRound + offset
        if (
            up >= 1 &&
            up <= ROUNDS &&
            up !== excludeRound &&
            !currentPicks[`${up}-${teamId}`]
        )
            return up
        const down = targetRound - offset
        if (
            down >= 1 &&
            down <= ROUNDS &&
            down !== excludeRound &&
            !currentPicks[`${down}-${teamId}`]
        )
            return down
    }
    return null
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
            const preferredName = u.preferred_name?.toLowerCase() || ""
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
        const preferredPart = user.preferred_name
            ? ` (${user.preferred_name})`
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
    onPicksChange,
    initialPicks,
    pairMap
}: DraftBoardProps) {
    const [enlargedPlayer, setEnlargedPlayer] = useState<UserOption | null>(
        null
    )
    const modal = usePlayerDetailModal({ fetchFn: getPlayerDetailsPublic })

    // Shared Liveblocks state
    const picks = useStorage((root) => root.picks)

    const hasSeededRef = useRef(false)

    const seedPicks = useMutation(
        ({ storage }, seedData: Record<string, string>) => {
            const current =
                (storage.get("picks") as Record<string, string | null>) ?? {}
            const hasAnyPick = Object.values(current).some((v) => v !== null)
            if (hasAnyPick) return
            storage.set("picks", { ...current, ...seedData })
        },
        []
    )

    const updatePick = useMutation(
        (
            { storage },
            round: number,
            teamId: number,
            userId: string | null,
            pairId: string | null,
            pairRound: number | null
        ) => {
            const current =
                (storage.get("picks") as Record<string, string | null>) ?? {}
            const updated = { ...current, [`${round}-${teamId}`]: userId }
            if (pairId !== null && pairRound !== null) {
                updated[`${pairRound}-${teamId}`] = pairId
            }
            storage.set("picks", updated)
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

    // One-time seeding for existing-but-empty rooms
    useEffect(() => {
        if (
            hasSeededRef.current ||
            picks === null ||
            Object.keys(initialPicks).length === 0
        )
            return
        const hasAnyPick = Object.values(picks).some((v) => v !== null)
        if (hasAnyPick) {
            hasSeededRef.current = true
            return
        }
        hasSeededRef.current = true
        seedPicks(initialPicks)
    }, [picks, initialPicks, seedPicks])

    // Notify parent of pick changes for submit
    useEffect(() => {
        if (picks) {
            onPicksChange(picks as Record<string, string | null>)
        }
    }, [picks, onPicksChange])

    const handlePickChange = (
        round: number,
        teamId: number,
        userId: string | null
    ) => {
        if (userId !== null) {
            const entry = pairMap.find((e) => e.playerId === userId)
            if (entry) {
                // In both cases: if this pick lands before pinnedRound, place
                // the partner at pinnedRound; if at/after pinnedRound, place
                // the partner immediately after. This way captains don't need
                // to pick in a specific order to get the intended placement.
                const targetRound =
                    entry.pinnedRound === round
                        ? round < ROUNDS
                            ? round + 1
                            : round - 1
                        : entry.pinnedRound
                const availableRound = findAvailablePairSlot(
                    targetRound,
                    teamId,
                    picksObj,
                    round
                )
                if (availableRound === null) {
                    toast.warning(
                        "No available slot for this player's pair partner on your team. Clear a slot first."
                    )
                    return
                }
                updatePick(round, teamId, userId, entry.pairId, availableRound)
                return
            }
        }
        updatePick(round, teamId, userId, null, null)
    }

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

    // Readonly plain object from Liveblocks storage — use directly for derived state
    const picksObj = (picks ?? {}) as Record<string, string | null>

    const selectedUserIds = useMemo(
        () => Object.values(picksObj).filter((id): id is string => id !== null),
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

    const getCellViolation = (
        teamId: number,
        userId: string | null
    ): boolean => {
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
        if (getCellViolation(teamId, userId))
            return "bg-red-200 dark:bg-red-900"
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
            <PresenceBar
                teamIds={teams.map((t) => t.id)}
                selfEffectiveRole={role}
            />

            {/* Turn indicator */}
            <div
                className={cn(
                    "mb-4 rounded-lg border px-4 py-3 font-medium text-sm",
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
                        {self?.info &&
                            captainTeamIds.includes(currentTurn.team.id) && (
                                <span className="ml-2 rounded-full bg-blue-200 px-2 py-0.5 text-blue-800 text-xs dark:bg-blue-800 dark:text-blue-100">
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
                                        const isActivePick =
                                            currentTurn?.round === round &&
                                            currentTurn?.team.id === team.id
                                        return (
                                            <td
                                                key={team.id}
                                                className={cn(
                                                    "border p-1",
                                                    isActivePick
                                                        ? "bg-yellow-100 ring-2 ring-yellow-400 ring-inset dark:bg-yellow-900/30 dark:ring-yellow-500"
                                                        : cellStyle
                                                )}
                                            >
                                                {editable ? (
                                                    <UserCombobox
                                                        users={users}
                                                        value={userId}
                                                        onChange={(newUserId) =>
                                                            handlePickChange(
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
                                                    <div className="flex h-8 items-center truncate px-2 text-xs">
                                                        {userId
                                                            ? (() => {
                                                                  const u =
                                                                      usersMap.get(
                                                                          userId
                                                                      )
                                                                  if (!u)
                                                                      return userId
                                                                  return u.preferred_name
                                                                      ? `${u.first_name} (${u.preferred_name}) ${u.last_name}`
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
                                            <div
                                                key={player.id}
                                                className={cn(
                                                    "flex flex-col items-center rounded-lg border p-1.5",
                                                    player.male === true
                                                        ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
                                                        : "border-pink-200 bg-pink-50 dark:border-pink-800 dark:bg-pink-900/20"
                                                )}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setEnlargedPlayer(
                                                            player
                                                        )
                                                    }
                                                    className="transition-opacity hover:opacity-80"
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
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        modal.openPlayerDetail(
                                                            player.id
                                                        )
                                                    }
                                                    className="mt-1 max-w-14 truncate text-center text-xs hover:underline"
                                                >
                                                    {player.preferred_name ||
                                                        player.first_name}
                                                </button>
                                            </div>
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
                            {enlargedPlayer.preferred_name
                                ? `${enlargedPlayer.first_name} (${enlargedPlayer.preferred_name}) ${enlargedPlayer.last_name}`
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

            <PlayerDetailPopup
                open={!!modal.selectedUserId}
                onClose={modal.closePlayerDetail}
                playerDetails={modal.playerDetails}
                draftHistory={modal.draftHistory}
                allSeasons={[]}
                playerPicUrl={playerPicUrl}
                isLoading={modal.isLoading}
                pairPickName={modal.pairPickName}
                pairReason={modal.pairReason}
                datesMissing={modal.unavailableDates}
                playoffDates={modal.playoffDates}
                ratingAverages={modal.ratingAverages}
                sharedRatingNotes={modal.sharedRatingNotes}
                privateRatingNotes={modal.privateRatingNotes}
                viewerRating={modal.viewerRating}
            />
        </div>
    )
}
