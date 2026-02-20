"use client"

import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import { RiArrowDownSLine, RiCloseLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import {
    getPlayerDetailsForSignups,
    type PlayerListItem,
    type PlayerDetails,
    type PlayerDraftHistory,
    type SeasonInfo
} from "./actions"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell
} from "recharts"

interface PlayerLookupSignupsFormProps {
    players: PlayerListItem[]
    allSeasons: SeasonInfo[]
    playerPicUrl: string
}

function formatHeight(inches: number | null): string {
    if (!inches) return "—"
    const feet = Math.floor(inches / 12)
    const remainingInches = inches % 12
    return `${feet}'${remainingInches}"`
}

export function PlayerLookupSignupsForm({
    players,
    allSeasons,
    playerPicUrl
}: PlayerLookupSignupsFormProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")
    const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(
        null
    )
    const [playerDetails, setPlayerDetails] = useState<PlayerDetails | null>(
        null
    )
    const [draftHistory, setDraftHistory] = useState<PlayerDraftHistory[]>([])
    const [pairPickName, setPairPickName] = useState<string | null>(null)
    const [pairReason, setPairReason] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showImageModal, setShowImageModal] = useState(false)

    const selectedPlayer = useMemo(
        () => players.find((p) => p.id === selectedPlayerId),
        [players, selectedPlayerId]
    )

    const filteredPlayers = useMemo(() => {
        if (!search) return players
        const lowerSearch = search.toLowerCase()
        return players.filter((p) => {
            const fullName = `${p.first_name} ${p.last_name}`.toLowerCase()
            const preferredName = (p.preffered_name || "").toLowerCase()
            const oldIdStr = p.old_id?.toString() || ""
            return (
                fullName.includes(lowerSearch) ||
                preferredName.includes(lowerSearch) ||
                oldIdStr.includes(lowerSearch)
            )
        })
    }, [players, search])

    const handleSelect = async (playerId: string) => {
        setSelectedPlayerId(playerId)
        setOpen(false)
        setSearch("")
        setIsLoading(true)
        setError(null)

        const result = await getPlayerDetailsForSignups(playerId)

        if (result.status && result.player) {
            setPlayerDetails(result.player)
            setDraftHistory(result.draftHistory)
            setPairPickName(result.pairPickName)
            setPairReason(result.pairReason)
        } else {
            setError(result.message || "Failed to load player details")
            setPlayerDetails(null)
            setDraftHistory([])
            setPairPickName(null)
            setPairReason(null)
        }

        setIsLoading(false)
    }

    const handleClear = () => {
        setSelectedPlayerId(null)
        setPlayerDetails(null)
        setDraftHistory([])
        setPairPickName(null)
        setPairReason(null)
        setSearch("")
        setError(null)
    }

    const getDisplayName = (player: PlayerListItem) => {
        const oldIdPart = player.old_id ? `[${player.old_id}] ` : ""
        const preferredPart = player.preffered_name
            ? ` (${player.preffered_name})`
            : ""
        return `${oldIdPart}${player.first_name}${preferredPart} ${player.last_name}`
    }

    return (
        <div className="space-y-6">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full max-w-md justify-between font-normal"
                    >
                        <span
                            className={cn(
                                !selectedPlayer && "text-muted-foreground"
                            )}
                        >
                            {selectedPlayer
                                ? getDisplayName(selectedPlayer)
                                : "Search for a player..."}
                        </span>
                        <div className="flex items-center gap-1">
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
                        placeholder="Search by name or old ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        autoCorrect="off"
                        className="mb-2"
                    />
                    <div className="max-h-60 overflow-y-auto">
                        {filteredPlayers.length === 0 ? (
                            <p className="py-2 text-center text-muted-foreground text-sm">
                                No players found
                            </p>
                        ) : (
                            filteredPlayers.map((player) => (
                                <button
                                    key={player.id}
                                    type="button"
                                    className={cn(
                                        "w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                                        selectedPlayerId === player.id &&
                                            "bg-accent"
                                    )}
                                    onClick={() => handleSelect(player.id)}
                                >
                                    {getDisplayName(player)}
                                </button>
                            ))
                        )}
                    </div>
                </PopoverContent>
            </Popover>

            {error && (
                <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm dark:bg-red-950 dark:text-red-200">
                    {error}
                </div>
            )}

            {isLoading && (
                <p className="text-muted-foreground">
                    Loading player details...
                </p>
            )}

            {playerDetails && !isLoading && (
                <Card className="max-w-lg">
                    <CardHeader>
                        <div className="flex items-start gap-4">
                            {playerPicUrl && playerDetails.picture && (
                                <button
                                    type="button"
                                    onClick={() => setShowImageModal(true)}
                                    className="shrink-0 cursor-pointer transition-opacity hover:opacity-90"
                                >
                                    <img
                                        src={`${playerPicUrl}${playerDetails.picture}`}
                                        alt={`${playerDetails.first_name} ${playerDetails.last_name}`}
                                        className="h-48 w-32 rounded-md object-cover"
                                    />
                                </button>
                            )}
                            <CardTitle className="pt-1">
                                {playerDetails.first_name}{" "}
                                {playerDetails.last_name}
                                {playerDetails.preffered_name && (
                                    <span className="ml-2 font-normal text-base text-muted-foreground">
                                        ({playerDetails.preffered_name})
                                    </span>
                                )}
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Basic Info */}
                        <div>
                            <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                                Basic Information
                            </h3>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <span className="text-muted-foreground">
                                        Pronouns:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.pronouns || "—"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Gender:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.male === true
                                            ? "Male"
                                            : playerDetails.male === false
                                              ? "Non-Male"
                                              : "—"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Pair Request */}
                        {(pairPickName || pairReason) && (
                            <div>
                                <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                                    Pair Request
                                </h3>
                                <div className="grid grid-cols-1 gap-3 text-sm">
                                    {pairPickName && (
                                        <div>
                                            <span className="text-muted-foreground">
                                                Pair Pick:
                                            </span>
                                            <span className="ml-2 font-medium">
                                                {pairPickName}
                                            </span>
                                        </div>
                                    )}
                                    {pairReason && (
                                        <div>
                                            <span className="text-muted-foreground">
                                                Reason:
                                            </span>
                                            <span className="ml-2 font-medium">
                                                {pairReason}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Volleyball Profile */}
                        <div>
                            <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                                Volleyball Profile
                            </h3>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <span className="text-muted-foreground">
                                        Experience:
                                    </span>
                                    <span className="ml-2 font-medium capitalize">
                                        {playerDetails.experience || "—"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Assessment:
                                    </span>
                                    <span className="ml-2 font-medium capitalize">
                                        {playerDetails.assessment || "—"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Height:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {formatHeight(playerDetails.height)}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Skills:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {[
                                            playerDetails.skill_passer &&
                                                "Passer",
                                            playerDetails.skill_setter &&
                                                "Setter",
                                            playerDetails.skill_hitter &&
                                                "Hitter",
                                            playerDetails.skill_other && "Other"
                                        ]
                                            .filter(Boolean)
                                            .join(", ") || "—"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Division History Graph */}
                        {draftHistory.length > 0 && (
                            <div>
                                <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                                    Division History
                                </h3>
                                <ResponsiveContainer width="100%" height={250}>
                                    <BarChart
                                        data={(() => {
                                            const divisionValues: Record<
                                                string,
                                                number
                                            > = {
                                                AA: 6,
                                                A: 5,
                                                ABA: 4,
                                                AB: 4,
                                                ABB: 3,
                                                BBB: 2,
                                                BB: 1
                                            }
                                            const draftBySeasonId = new Map<
                                                number,
                                                PlayerDraftHistory
                                            >()
                                            for (const d of draftHistory) {
                                                draftBySeasonId.set(
                                                    d.seasonId,
                                                    d
                                                )
                                            }
                                            const firstSeasonId =
                                                draftHistory[0].seasonId
                                            const lastSeasonId =
                                                draftHistory[
                                                    draftHistory.length - 1
                                                ].seasonId
                                            const seasonsInRange = [
                                                ...allSeasons
                                            ]
                                                .reverse()
                                                .filter(
                                                    (s) =>
                                                        s.id >= firstSeasonId &&
                                                        s.id <= lastSeasonId
                                                )
                                            return seasonsInRange.map((s) => {
                                                const draft =
                                                    draftBySeasonId.get(s.id)
                                                const label = `${s.name.charAt(0).toUpperCase() + s.name.slice(1)} ${s.year}`
                                                if (draft) {
                                                    return {
                                                        ...draft,
                                                        label,
                                                        divisionValue:
                                                            divisionValues[
                                                                draft
                                                                    .divisionName
                                                            ] || 0
                                                    }
                                                }
                                                return {
                                                    seasonId: s.id,
                                                    seasonYear: s.year,
                                                    seasonName: s.name,
                                                    divisionName: "",
                                                    teamName: "",
                                                    round: 0,
                                                    overall: 0,
                                                    label,
                                                    divisionValue: 0
                                                }
                                            })
                                        })()}
                                        margin={{
                                            top: 5,
                                            right: 20,
                                            bottom: 5,
                                            left: 50
                                        }}
                                    >
                                        <XAxis
                                            dataKey="label"
                                            tick={{ fontSize: 12 }}
                                        />
                                        <YAxis
                                            domain={[0, 7]}
                                            ticks={[1, 2, 3, 4, 5, 6]}
                                            tickFormatter={(value: number) => {
                                                const labels: Record<
                                                    number,
                                                    string
                                                > = {
                                                    6: "AA",
                                                    5: "A",
                                                    4: "ABA",
                                                    3: "ABB",
                                                    2: "BBB",
                                                    1: "BB"
                                                }
                                                return labels[value] || ""
                                            }}
                                            tick={{ fontSize: 11 }}
                                            width={45}
                                        />
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (!active || !payload?.length)
                                                    return null
                                                const d = payload[0].payload
                                                if (!d.divisionName) {
                                                    return (
                                                        <div className="rounded-md border bg-background p-3 text-sm shadow-md">
                                                            <p className="font-medium">
                                                                {d.label}
                                                            </p>
                                                            <p className="text-muted-foreground italic">
                                                                Did not play
                                                            </p>
                                                        </div>
                                                    )
                                                }
                                                return (
                                                    <div className="rounded-md border bg-background p-3 text-sm shadow-md">
                                                        <p className="font-medium">
                                                            {d.label}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Division:{" "}
                                                            {d.divisionName}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Team: {d.teamName}
                                                        </p>
                                                    </div>
                                                )
                                            }}
                                        />
                                        <Bar
                                            dataKey="divisionValue"
                                            radius={[4, 4, 0, 0]}
                                        >
                                            {(() => {
                                                const firstSeasonId =
                                                    draftHistory[0].seasonId
                                                const lastSeasonId =
                                                    draftHistory[
                                                        draftHistory.length - 1
                                                    ].seasonId
                                                const seasonsInRange = [
                                                    ...allSeasons
                                                ]
                                                    .reverse()
                                                    .filter(
                                                        (s) =>
                                                            s.id >=
                                                                firstSeasonId &&
                                                            s.id <= lastSeasonId
                                                    )
                                                const draftBySeasonId = new Map<
                                                    number,
                                                    PlayerDraftHistory
                                                >()
                                                for (const d of draftHistory) {
                                                    draftBySeasonId.set(
                                                        d.seasonId,
                                                        d
                                                    )
                                                }
                                                const colors: Record<
                                                    string,
                                                    string
                                                > = {
                                                    AA: "#ef4444",
                                                    A: "#f97316",
                                                    ABA: "#eab308",
                                                    AB: "#eab308",
                                                    ABB: "#22c55e",
                                                    BBB: "#3b82f6",
                                                    BB: "#8b5cf6"
                                                }
                                                return seasonsInRange.map(
                                                    (s, index) => {
                                                        const draft =
                                                            draftBySeasonId.get(
                                                                s.id
                                                            )
                                                        return (
                                                            <Cell
                                                                key={index}
                                                                fill={
                                                                    draft
                                                                        ? colors[
                                                                              draft
                                                                                  .divisionName
                                                                          ] ||
                                                                          "hsl(var(--primary))"
                                                                        : "transparent"
                                                                }
                                                            />
                                                        )
                                                    }
                                                )
                                            })()}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Image Modal */}
            {showImageModal && playerDetails?.picture && playerPicUrl && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
                    onClick={() => setShowImageModal(false)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") setShowImageModal(false)
                    }}
                    role="dialog"
                    aria-modal="true"
                    tabIndex={-1}
                >
                    <div className="relative max-h-[90vh] max-w-[90vw]">
                        <img
                            src={`${playerPicUrl}${playerDetails.picture}`}
                            alt={`${playerDetails.first_name} ${playerDetails.last_name}`}
                            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
                        />
                        <button
                            type="button"
                            onClick={() => setShowImageModal(false)}
                            className="-top-3 -right-3 absolute rounded-full bg-white p-1 text-black hover:bg-gray-200"
                        >
                            <RiCloseLine className="h-6 w-6" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
