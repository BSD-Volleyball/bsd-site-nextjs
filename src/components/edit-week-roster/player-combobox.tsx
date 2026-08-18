"use client"

// Searchable player picker shared by the week-1/2/3 roster editors.
// Week-specific metadata (rating score, last division) is optional and
// simply not rendered when the caller's player shape doesn't carry it.

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger
} from "@/components/ui/tooltip"
import { cn, formatDisplayName } from "@/lib/utils"
import { RiArrowDownSLine, RiCloseLine } from "@remixicon/react"

export interface ComboboxPlayer {
    id: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    hasPairPick: boolean
    placementScore: number
    seasonsPlayedCount: number
    ratingScore?: number | null
    lastDivisionName?: string | null
    /**
     * Why this player can no longer hold a slot (opted out of the night,
     * signup removed). A flagged player renders in red where already
     * selected and is hidden from the picker everywhere else.
     */
    unavailableReason?: string | null
}

export function getComboboxPlayerLabel(player: ComboboxPlayer) {
    const name = formatDisplayName(
        player.firstName,
        player.lastName,
        player.preferredName
    )
    return player.hasPairPick ? `${name} [PP]` : name
}

function getGenderClass(male: boolean | null) {
    if (male === true) return "bg-blue-50 dark:bg-blue-950/40"
    if (male === false) return "bg-pink-50 dark:bg-pink-950/40"
    return ""
}

function PlayerMeta({ player }: { player: ComboboxPlayer }) {
    return (
        <span className="shrink-0 text-muted-foreground text-sm">
            {player.seasonsPlayedCount === 0 ? (
                <span className="font-semibold text-green-600 dark:text-green-400">
                    NEW
                </span>
            ) : player.lastDivisionName ? (
                <span>{player.lastDivisionName}</span>
            ) : null}
            <span className="ml-1">{Math.round(player.placementScore)}</span>
            {player.seasonsPlayedCount > 0 &&
                typeof player.ratingScore === "number" && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400">
                        R{Math.round(player.ratingScore)}
                    </span>
                )}
        </span>
    )
}

export function PlayerCombobox({
    players,
    value,
    onChange,
    excludeIds = [],
    disabled = false
}: {
    players: ComboboxPlayer[]
    value: string
    onChange: (userId: string) => void
    excludeIds?: string[]
    disabled?: boolean
}) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")

    const selectedPlayer = useMemo(
        () => players.find((player) => player.id === value) || null,
        [players, value]
    )

    const filteredPlayers = useMemo(() => {
        const available = players.filter(
            (player) =>
                player.id === value ||
                (!excludeIds.includes(player.id) && !player.unavailableReason)
        )
        if (!search) {
            return available
        }

        const lower = search.toLowerCase()
        return available.filter((player) => {
            return getComboboxPlayerLabel(player).toLowerCase().includes(lower)
        })
    }, [players, search, excludeIds, value])

    const trigger = (
        <PopoverTrigger asChild>
            <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className={cn(
                    "h-9 w-full justify-between gap-1 px-2 font-normal",
                    selectedPlayer && getGenderClass(selectedPlayer.male),
                    selectedPlayer?.unavailableReason &&
                        "border-red-500 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-700 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60"
                )}
                disabled={disabled}
            >
                {selectedPlayer ? (
                    <span className="flex min-w-0 flex-1 items-baseline gap-1.5 truncate">
                        <span className="truncate">
                            {getComboboxPlayerLabel(selectedPlayer)}
                        </span>
                        {selectedPlayer.unavailableReason ? (
                            <span
                                className="shrink-0 font-semibold text-red-600 text-xs uppercase dark:text-red-400"
                                title={selectedPlayer.unavailableReason}
                            >
                                Unavailable
                            </span>
                        ) : (
                            <PlayerMeta player={selectedPlayer} />
                        )}
                    </span>
                ) : (
                    <span className="truncate text-muted-foreground">
                        Select player...
                    </span>
                )}
                <div className="flex shrink-0 items-center">
                    {selectedPlayer && !disabled && (
                        <span
                            role="button"
                            tabIndex={0}
                            aria-label="Clear player"
                            className="rounded-sm p-0.5 hover:bg-accent"
                            onClick={(e) => {
                                e.stopPropagation()
                                setOpen(false)
                                onChange("")
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation()
                                    setOpen(false)
                                    onChange("")
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
    )

    return (
        <Popover open={open} onOpenChange={setOpen}>
            {selectedPlayer ? (
                <Tooltip>
                    <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                    <TooltipContent side="top">
                        {getComboboxPlayerLabel(selectedPlayer)}
                        {selectedPlayer.unavailableReason
                            ? ` — ${selectedPlayer.unavailableReason}`
                            : ""}
                    </TooltipContent>
                </Tooltip>
            ) : (
                trigger
            )}
            <PopoverContent
                className="w-(--radix-popover-trigger-width) min-w-64 p-2"
                align="start"
            >
                <Input
                    placeholder="Search players..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
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
                                    "w-full rounded-sm px-2 py-1.5 text-left text-sm",
                                    value === player.id
                                        ? "bg-accent"
                                        : player.male === true
                                          ? "bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-950/60"
                                          : player.male === false
                                            ? "bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/40 dark:hover:bg-pink-950/60"
                                            : "hover:bg-accent"
                                )}
                                onClick={() => {
                                    onChange(player.id)
                                    setOpen(false)
                                    setSearch("")
                                }}
                            >
                                <span className="flex items-baseline justify-between gap-2">
                                    <span
                                        className="truncate"
                                        title={getComboboxPlayerLabel(player)}
                                    >
                                        {getComboboxPlayerLabel(player)}
                                    </span>
                                    <PlayerMeta player={player} />
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}
