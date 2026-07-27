"use client"

import { useState, useMemo, type Dispatch, type SetStateAction } from "react"
import { RiDeleteBin2Line } from "@remixicon/react"
import { PlayerCombobox } from "./player-combobox"
import { PlayerPic } from "./player-pic"
import type { DraftHomeworkPlayer } from "./actions"
import type { Selections } from "./homework-selections"

interface RoundGroupProps {
    label: string
    round: number
    numTeams: number
    tabKey: "m" | "f"
    players: DraftHomeworkPlayer[]
    selections: Selections
    excludeIds: string[]
    draftedIds: string[]
    playerPicUrl: string
    onChange: (key: string, userId: string | null) => void
    onOpenPlayer: (userId: string) => void
    isDynamic?: boolean
    controlledDynamicCount?: number
    onControlledDynamicCountChange?: Dispatch<SetStateAction<number>>
}

export function RoundGroup({
    label,
    round,
    numTeams,
    tabKey,
    players,
    selections,
    excludeIds,
    draftedIds,
    playerPicUrl,
    onChange,
    onOpenPlayer,
    isDynamic = false,
    controlledDynamicCount,
    onControlledDynamicCountChange
}: RoundGroupProps) {
    const [internalDynamicCount, setInternalDynamicCount] = useState(() => {
        if (!isDynamic) return numTeams
        const existing = Object.keys(selections).filter((k) =>
            k.startsWith(`${tabKey}-${round}-`)
        ).length
        return Math.max(1, existing)
    })

    const dynamicCount =
        isDynamic && controlledDynamicCount !== undefined
            ? controlledDynamicCount
            : internalDynamicCount
    const setDynamicCount: Dispatch<SetStateAction<number>> =
        isDynamic && onControlledDynamicCountChange !== undefined
            ? onControlledDynamicCountChange
            : setInternalDynamicCount

    const slotCount = isDynamic ? dynamicCount : numTeams
    const slots = Array.from({ length: slotCount }, (_, i) => i)
    const draftedSet = useMemo(() => new Set(draftedIds), [draftedIds])

    const handleRemoveSlot = (slotToRemove: number) => {
        for (let j = slotToRemove; j < dynamicCount - 1; j++) {
            onChange(
                `${tabKey}-${round}-${j}`,
                selections[`${tabKey}-${round}-${j + 1}`] ?? null
            )
        }
        onChange(`${tabKey}-${round}-${dynamicCount - 1}`, null)
        setDynamicCount((c) => c - 1)
    }

    const selectedPlayers = slots
        .map((slot) => {
            const key = `${tabKey}-${round}-${slot}`
            const userId = selections[key] ?? null
            return userId
                ? (players.find((p) => p.userId === userId) ?? null)
                : null
        })
        .filter((p): p is DraftHomeworkPlayer => p !== null)

    // Each combobox is h-8 = 32px, gap-1 = 4px
    const totalHeightPx = slotCount * 32 + (slotCount - 1) * 4
    // Reference height matches a full round (numTeams slots) — used for consistent photo sizing in the dynamic section
    const referenceHeightPx = numTeams * 32 + (numTeams - 1) * 4

    // Chunk selected players into rows of numTeams for the dynamic (Considering) section
    const photoRows: DraftHomeworkPlayer[][] = []
    if (isDynamic) {
        for (let i = 0; i < selectedPlayers.length; i += numTeams) {
            photoRows.push(selectedPlayers.slice(i, i + numTeams))
        }
    }

    return (
        <div className="mb-4">
            <p className="mb-1 font-medium text-sm">{label}</p>
            <div className="overflow-x-auto">
                <div
                    className="flex items-start gap-3"
                    style={{ minWidth: "max-content" }}
                >
                    {/* Player selectors */}
                    <div
                        className="flex min-w-48 flex-col gap-1 rounded-md border bg-muted/30"
                        style={{ width: "220px" }}
                    >
                        {slots.map((slot) => {
                            const key = `${tabKey}-${round}-${slot}`
                            const uid = selections[key] ?? null
                            const isInvalid = !!uid && draftedSet.has(uid)
                            return (
                                <div key={key} className="flex items-center">
                                    <div className="min-w-0 flex-1">
                                        <PlayerCombobox
                                            players={players}
                                            value={uid}
                                            onChange={(userId) =>
                                                onChange(key, userId)
                                            }
                                            excludeIds={excludeIds}
                                            draftedIds={draftedIds}
                                            isInvalid={isInvalid}
                                        />
                                    </div>
                                    {isDynamic && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleRemoveSlot(slot)
                                            }
                                            className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                                            title="Remove"
                                        >
                                            <RiDeleteBin2Line className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            )
                        })}
                        {isDynamic && (
                            <button
                                type="button"
                                onClick={() => setDynamicCount((c) => c + 1)}
                                className="px-2 py-1 text-left text-muted-foreground text-xs hover:text-foreground"
                            >
                                + Add player
                            </button>
                        )}
                    </div>

                    {/* Player pictures */}
                    {isDynamic ? (
                        <div className="flex flex-col gap-2">
                            {photoRows.map((row, rowIdx) => (
                                <div
                                    key={rowIdx}
                                    className="flex items-stretch gap-1"
                                    style={{ height: `${referenceHeightPx}px` }}
                                >
                                    {row.map((player) => (
                                        <PlayerPic
                                            key={player.userId}
                                            player={player}
                                            playerPicUrl={playerPicUrl}
                                            height="100%"
                                            onOpen={onOpenPlayer}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div
                            className="flex items-stretch gap-1"
                            style={{ height: `${totalHeightPx}px` }}
                        >
                            {selectedPlayers.map((player) => (
                                <PlayerPic
                                    key={player.userId}
                                    player={player}
                                    playerPicUrl={playerPicUrl}
                                    height="100%"
                                    onOpen={onOpenPlayer}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
