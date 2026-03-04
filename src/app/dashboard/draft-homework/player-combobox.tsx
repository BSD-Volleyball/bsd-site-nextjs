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
import type { DraftHomeworkPlayer } from "./actions"

interface PlayerComboboxProps {
    players: DraftHomeworkPlayer[]
    value: string | null
    onChange: (userId: string | null) => void
    placeholder?: string
    excludeIds?: string[]
}

export function PlayerCombobox({
    players,
    value,
    onChange,
    placeholder = "Select a player...",
    excludeIds = []
}: PlayerComboboxProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")

    const selectedPlayer = useMemo(
        () => players.find((p) => p.userId === value),
        [players, value]
    )

    const filteredPlayers = useMemo(() => {
        const filtered = players.filter(
            (p) => !excludeIds.includes(p.userId) || p.userId === value
        )
        if (!search) return filtered
        const lowerSearch = search.toLowerCase()
        return filtered.filter((p) => {
            const fullName = `${p.firstName} ${p.lastName}`.toLowerCase()
            const preferredName = p.preferredName?.toLowerCase() || ""
            const oldIdStr = p.oldId?.toString() || ""
            return (
                fullName.includes(lowerSearch) ||
                preferredName.includes(lowerSearch) ||
                oldIdStr.includes(lowerSearch)
            )
        })
    }, [players, search, excludeIds, value])

    const getDisplayName = (p: DraftHomeworkPlayer) => {
        const oldIdPart = p.oldId ? `[${p.oldId}] ` : ""
        const preferredPart = p.preferredName ? ` (${p.preferredName})` : ""
        return `${oldIdPart}${p.firstName}${preferredPart} ${p.lastName}`
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
    )
}
