"use client"

import { useState, useMemo, useCallback, useRef } from "react"
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
    CardDescription
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { RiFullscreenLine, RiFullscreenExitLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import {
    getDraftInitData,
    getDraftWatchlistData,
    submitDraft,
    type DivisionOption,
    type TeamOption,
    type UserOption,
    type DivisionSplitConfig,
    type PairEntry,
    type WatchlistData
} from "./actions"
import { DraftRoomProvider } from "./draft-room-provider"
import { DraftBoard } from "./draft-board"
import { DraftWatchlist } from "./draft-watchlist"

interface DraftDivisionFormProps {
    currentSeasonId: number
    divisionSplits: DivisionSplitConfig[]
    divisions: DivisionOption[]
    users: UserOption[]
    playerPicUrl: string
    divisionRoleById: Record<number, "commissioner" | "captain">
    captainTeamIdsByDivision: Record<number, number[]>
    hasLeagueWideCommissionerAccess: boolean
    defaultDivisionId?: number
}

const ROUNDS = 8

export function DraftDivisionForm({
    currentSeasonId,
    divisionSplits,
    divisions,
    users,
    playerPicUrl,
    divisionRoleById,
    captainTeamIdsByDivision,
    hasLeagueWideCommissionerAccess,
    defaultDivisionId
}: DraftDivisionFormProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingTeams, setIsLoadingTeams] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [isExpanded, setIsExpanded] = useState(false)

    const [divisionId, setDivisionId] = useState<string>(
        defaultDivisionId ? defaultDivisionId.toString() : ""
    )
    const [teamsList, setTeamsList] = useState<TeamOption[]>([])
    const [initialPicks, setInitialPicks] = useState<Record<string, string>>({})
    const [pairMap, setPairMap] = useState<PairEntry[]>([])
    const [watchlistData, setWatchlistData] = useState<WatchlistData | null>(
        null
    )

    // Picks snapshot maintained by DraftBoard via onPicksChange callback
    const picksRef = useRef<Record<string, string | null>>({})

    const selectedDivision = useMemo(
        () => divisions.find((d) => d.id.toString() === divisionId),
        [divisions, divisionId]
    )
    const selectedDivisionId = divisionId ? parseInt(divisionId, 10) : null
    const currentRole: "commissioner" | "captain" =
        selectedDivisionId !== null &&
        (hasLeagueWideCommissionerAccess ||
            divisionRoleById[selectedDivisionId] === "commissioner")
            ? "commissioner"
            : "captain"
    const currentCaptainTeamIds =
        selectedDivisionId !== null
            ? (captainTeamIdsByDivision[selectedDivisionId] ?? [])
            : []

    const divisionSplitsMap = useMemo(
        () => new Map(divisionSplits.map((d) => [d.divisionId, d.genderSplit])),
        [divisionSplits]
    )

    const genderSplit = divisionId
        ? (divisionSplitsMap.get(parseInt(divisionId)) ?? null)
        : null

    const handlePicksChange = useCallback(
        (picks: Record<string, string | null>) => {
            picksRef.current = picks
        },
        []
    )

    const handleDivisionChange = async (value: string) => {
        setDivisionId(value)
        setTeamsList([])
        setInitialPicks({})
        setPairMap([])
        setWatchlistData(null)
        setError(null)
        setSuccess(null)
        picksRef.current = {}

        if (value) {
            await loadDraftInitData(currentSeasonId, parseInt(value))
        }
    }

    const loadDraftInitData = async (season: number, division: number) => {
        setIsLoadingTeams(true)
        const [result, watchlistResult] = await Promise.all([
            getDraftInitData(season, division),
            getDraftWatchlistData(season, division)
        ])
        if (result.status) {
            setTeamsList(result.teams)
            setInitialPicks(result.initialPicks)
            setPairMap(result.pairMap)
        } else {
            setError(result.message || "Failed to load teams.")
        }
        if (watchlistResult.status && watchlistResult.data) {
            setWatchlistData(watchlistResult.data)
        }
        setIsLoadingTeams(false)
    }

    // Load default division teams on mount if captain has a pre-selected division
    useState(() => {
        if (defaultDivisionId && divisionId) {
            loadDraftInitData(currentSeasonId, defaultDivisionId)
        }
    })

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setSuccess(null)

        if (!divisionId || !selectedDivision) {
            setError("Please select a division.")
            return
        }

        if (teamsList.length === 0) {
            setError("No teams found for the selected division.")
            return
        }

        const picks = []
        for (let round = 1; round <= ROUNDS; round++) {
            for (const team of teamsList) {
                const userId = picksRef.current[`${round}-${team.id}`]
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
        } else {
            setError(result.message)
        }

        setIsLoading(false)
    }

    return (
        <div
            className={cn(
                isExpanded &&
                    "fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-background p-4"
            )}
        >
            <form
                onSubmit={handleSubmit}
                className={cn(isExpanded && "w-[95vw]")}
            >
                <Card>
                    <CardHeader className="flex flex-row items-start justify-between space-y-0">
                        <div>
                            <CardTitle>Draft Configuration</CardTitle>
                            <CardDescription>
                                {currentRole === "commissioner"
                                    ? "Select a division to load the teams for the current season."
                                    : "Your division is pre-selected. Edit your team's picks in the draft board below."}
                            </CardDescription>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setIsExpanded(!isExpanded)}
                            title={
                                isExpanded
                                    ? "Exit fullscreen"
                                    : "Expand to fullscreen"
                            }
                        >
                            {isExpanded ? (
                                <RiFullscreenExitLine className="h-4 w-4" />
                            ) : (
                                <RiFullscreenLine className="h-4 w-4" />
                            )}
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex max-w-2xl gap-6">
                            <div className="flex-1 space-y-2">
                                <Label htmlFor="division">
                                    Division{" "}
                                    {currentRole === "commissioner" && (
                                        <span className="text-destructive">
                                            *
                                        </span>
                                    )}
                                </Label>
                                <Select
                                    value={divisionId}
                                    onValueChange={handleDivisionChange}
                                    disabled={divisions.length <= 1}
                                >
                                    <SelectTrigger id="division">
                                        <SelectValue placeholder="Select a division" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {divisions.map((division) => (
                                            <SelectItem
                                                key={division.id}
                                                value={division.id.toString()}
                                            >
                                                {division.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Gender Split</Label>
                                <div className="flex h-9 items-center">
                                    {divisionId ? (
                                        genderSplit ? (
                                            <span className="font-medium">
                                                {genderSplit}
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground text-sm">
                                                Not configured
                                            </span>
                                        )
                                    ) : (
                                        <span className="text-muted-foreground text-sm">
                                            —
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {isLoadingTeams && (
                            <p className="text-muted-foreground">
                                Loading teams...
                            </p>
                        )}

                        {teamsList.length > 0 && divisionId && (
                            <div className="border-t pt-6">
                                <h3 className="mb-4 font-semibold">
                                    Draft Board
                                </h3>
                                <DraftRoomProvider
                                    seasonId={currentSeasonId}
                                    divisionId={parseInt(divisionId)}
                                    initialPicks={initialPicks}
                                >
                                    <DraftBoardWithBroadcast
                                        teams={teamsList}
                                        users={users}
                                        playerPicUrl={playerPicUrl}
                                        divisionSplits={divisionSplits}
                                        divisionId={divisionId}
                                        role={currentRole}
                                        captainTeamIds={currentCaptainTeamIds}
                                        onPicksChange={handlePicksChange}
                                        initialPicks={initialPicks}
                                        pairMap={pairMap}
                                    />
                                    {watchlistData && (
                                        <div className="mt-6 border-t pt-6">
                                            <div className="mb-4">
                                                <h3 className="font-semibold">
                                                    Your Watchlist{" "}
                                                    <span className="font-normal text-muted-foreground">
                                                        {watchlistData.view ===
                                                        "captain"
                                                            ? "(Individual Captains View)"
                                                            : "(Commissioners View)"}
                                                    </span>
                                                </h3>
                                                <p className="text-muted-foreground text-sm">
                                                    Only visible to you — not
                                                    shared with other
                                                    participants.
                                                </p>
                                            </div>
                                            <DraftWatchlist
                                                malePlayers={
                                                    watchlistData.malePlayers
                                                }
                                                nonMalePlayers={
                                                    watchlistData.nonMalePlayers
                                                }
                                                draftedUserIds={
                                                    watchlistData.draftedUserIds
                                                }
                                                users={users}
                                                playerPicUrl={playerPicUrl}
                                            />
                                        </div>
                                    )}
                                </DraftRoomProvider>
                            </div>
                        )}

                        {divisionId &&
                            !isLoadingTeams &&
                            teamsList.length === 0 && (
                                <p className="text-muted-foreground">
                                    No teams found for the selected division.
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
                    {currentRole === "commissioner" && (
                        <CardFooter className="border-t pt-6">
                            <Button
                                type="submit"
                                disabled={isLoading || teamsList.length === 0}
                                className="ml-auto"
                            >
                                {isLoading ? "Submitting..." : "Submit Draft"}
                            </Button>
                        </CardFooter>
                    )}
                </Card>
            </form>
        </div>
    )
}

// Inner wrapper that has access to Liveblocks context (inside RoomProvider)
// Broadcasts DRAFT_SUBMITTED when submit succeeds
function DraftBoardWithBroadcast(props: {
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
}) {
    return <DraftBoard {...props} />
}
