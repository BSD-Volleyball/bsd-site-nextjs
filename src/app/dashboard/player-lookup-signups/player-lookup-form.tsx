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
import {
    getPlayerDetailsForSignups,
    type PlayerListItem,
    type PlayerDetails,
    type PlayerDraftHistory,
    type SeasonInfo
} from "./actions"
import { PlayerDetailPopup } from "@/components/player-detail"

interface PlayerLookupSignupsFormProps {
    players: PlayerListItem[]
    allSeasons: SeasonInfo[]
    playerPicUrl: string
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

            <PlayerDetailPopup
                open={!!selectedPlayerId}
                playerDetails={playerDetails}
                draftHistory={draftHistory}
                allSeasons={allSeasons}
                playerPicUrl={playerPicUrl}
                isLoading={isLoading}
                pairPickName={pairPickName}
                pairReason={pairReason}
                inline
            />
        </div>
    )
}
