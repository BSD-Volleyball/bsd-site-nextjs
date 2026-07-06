"use client"

import { useMemo } from "react"
import { Combobox } from "@/components/ui/combobox"
import { cn } from "@/lib/utils"
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
    const preferredPart = p.preferredName ? ` (${p.preferredName})` : ""
    return `${oldIdPart}${p.firstName}${preferredPart} ${p.lastName}`
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
            players.filter(
                (p) =>
                    (!excludeIds.includes(p.userId) || p.userId === value) &&
                    !draftedIds.includes(p.userId)
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
