"use client"

// Under-combobox note for a placed player's tryout slot request: a muted
// "Requested: …" line, escalating to bold red when the slot they hold is
// not one they asked for. Shared by the week-1/2/3 roster editors.

import { formatSlotList, slotFitsRequest } from "@/lib/preseason/slots"

export function SlotRequestNote({
    placedSlot,
    requestedSlots,
    comment,
    slotLabels
}: {
    /** 1-based time slot the roster spot plays in. */
    placedSlot: number
    requestedSlots: number[] | null | undefined
    comment?: string | null
    slotLabels: string[]
}) {
    if (!requestedSlots || requestedSlots.length === 0) {
        return null
    }
    const fits = slotFitsRequest(placedSlot, requestedSlots)
    const requested = formatSlotList(requestedSlots, slotLabels)
    return (
        <p
            className={
                fits
                    ? "text-muted-foreground text-sm"
                    : "font-semibold text-red-600 text-sm dark:text-red-500"
            }
            title={comment ?? undefined}
        >
            {fits
                ? `Requested: ${requested}`
                : `Slot mismatch: requested ${requested}, placed in ${formatSlotList([placedSlot], slotLabels)}`}
            {comment ? ` — ${comment}` : ""}
        </p>
    )
}
