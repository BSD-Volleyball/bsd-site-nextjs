"use client"

// One bordered roster column ("Team N" / "Court N" / alternates court):
// titled list of slot rows — each with a searchable player combobox,
// optional extra content, detail and remove buttons — plus an Add Player
// button. Shared by the week-1/2/3 roster editors.

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger
} from "@/components/ui/tooltip"
import { RiAddLine, RiDeleteBinLine, RiUserLine } from "@remixicon/react"
import { PlayerCombobox, type ComboboxPlayer } from "./player-combobox"

export interface SlotBoxSlot {
    localKey: string
    userId: string
}

interface SlotBoxProps<TSlot extends SlotBoxSlot> {
    title: string
    slots: TSlot[]
    players: ComboboxPlayer[]
    onChangeSlot: (localKey: string, userId: string) => void
    onRemoveSlot: (localKey: string) => void
    onAddSlot: () => void
    onOpenDetail: (userId: string) => void
    /** Extra content appended to the "Slot N" label line. */
    slotLabelExtras?: (slot: TSlot) => ReactNode
    /** Content rendered under the combobox (warnings, captain toggle). */
    belowCombobox?: (slot: TSlot) => ReactNode
    comboboxDisabled?: (slot: TSlot) => boolean
    /** Outline the combobox in red (e.g. slot doesn't match the request). */
    comboboxWarn?: (slot: TSlot) => boolean
    excludeIdsFor?: (slot: TSlot) => string[]
}

export function SlotBox<TSlot extends SlotBoxSlot>({
    title,
    slots,
    players,
    onChangeSlot,
    onRemoveSlot,
    onAddSlot,
    onOpenDetail,
    slotLabelExtras,
    belowCombobox,
    comboboxDisabled,
    comboboxWarn,
    excludeIdsFor
}: SlotBoxProps<TSlot>) {
    return (
        <div className="space-y-2 rounded-md border p-2 sm:p-3">
            <h3 className="font-semibold text-sm">{title}</h3>
            <div className="space-y-2">
                {slots.map((slot, idx) => (
                    <div key={slot.localKey} className="flex items-end gap-0.5">
                        <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-muted-foreground text-sm">
                                Slot {idx + 1}
                                {slotLabelExtras?.(slot)}
                            </p>
                            <PlayerCombobox
                                players={players}
                                value={slot.userId}
                                onChange={(userId) =>
                                    onChangeSlot(slot.localKey, userId)
                                }
                                disabled={comboboxDisabled?.(slot) ?? false}
                                warn={comboboxWarn?.(slot) ?? false}
                                excludeIds={excludeIdsFor?.(slot)}
                            />
                            {belowCombobox?.(slot)}
                        </div>
                        {slot.userId && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-7 shrink-0"
                                        aria-label="View player details"
                                        onClick={() =>
                                            onOpenDetail(slot.userId)
                                        }
                                    >
                                        <RiUserLine className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                    View player details
                                </TooltipContent>
                            </Tooltip>
                        )}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-7 shrink-0"
                                    aria-label="Remove this slot"
                                    onClick={() => onRemoveSlot(slot.localKey)}
                                >
                                    <RiDeleteBinLine className="h-4 w-4 text-muted-foreground" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                                Remove this slot
                            </TooltipContent>
                        </Tooltip>
                    </div>
                ))}
            </div>
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={onAddSlot}
            >
                <RiAddLine className="mr-1 h-4 w-4" />
                Add Player
            </Button>
        </div>
    )
}
