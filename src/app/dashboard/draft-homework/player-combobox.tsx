"use client"

import { useMemo } from "react"
import { Combobox } from "@/components/ui/combobox"
import { cn, formatPlayerName } from "@/lib/utils"
import type { DraftHomeworkPlayer } from "./actions"

interface PlayerComboboxProps {
    players: DraftHomeworkPlayer[]
    value: string | null
    onChange: (userId: string | null) => void
    placeholder?: string
    excludeIds?: string[]
    draftedIds?: string[]
    isInvalid?: boolean
}

function getDisplayName(p: DraftHomeworkPlayer) {
    const oldIdPart = p.oldId ? `[${p.oldId}] ` : ""
    return `${oldIdPart}${formatPlayerName(p.firstName, p.lastName, p.preferredName)}`
}

export function PlayerCombobox({
    players,
    value,
    onChange,
    placeholder = "Select a player...",
    excludeIds = [],
    draftedIds = [],
    isInvalid = false
}: PlayerComboboxProps) {
    const selectablePlayers = useMemo(
        () =>
            // The current value always stays visible (even once drafted, so
            // the red slot still shows who it was); everyone else must be
            // unselected elsewhere and not yet drafted.
            players.filter(
                (p) =>
                    p.userId === value ||
                    (!excludeIds.includes(p.userId) &&
                        !draftedIds.includes(p.userId))
            ),
        [players, excludeIds, draftedIds, value]
    )

    return (
        <Combobox
            items={selectablePlayers}
            value={value}
            onChange={onChange}
            getKey={(p) => p.userId}
            getLabel={getDisplayName}
            matchesSearch={(p, lowerSearch) => {
                const fullName = `${p.firstName} ${p.lastName}`.toLowerCase()
                const preferredName = p.preferredName?.toLowerCase() || ""
                const oldIdStr = p.oldId?.toString() || ""
                return (
                    fullName.includes(lowerSearch) ||
                    preferredName.includes(lowerSearch) ||
                    oldIdStr.includes(lowerSearch)
                )
            }}
            placeholder={placeholder}
            searchPlaceholder="Search players..."
            emptyText="No players found"
            size="sm"
            triggerClassName={cn(
                "h-8 border-0 text-xs shadow-none",
                isInvalid
                    ? "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
                    : "bg-transparent hover:bg-black/5 dark:hover:bg-white/5"
            )}
            popoverClassName="w-64"
        />
    )
}
