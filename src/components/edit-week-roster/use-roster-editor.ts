"use client"

// Slot state + save→diff→notify orchestration shared by the week-1/2/3
// roster editors. The layouts own grouping/rendering and the week-specific
// diff and notification-payload shapes.

import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import type { RosterChangeEntry } from "@/components/roster-notification"

export interface RosterEditorSlot {
    localKey: string
    userId: string
}

export interface RosterEditorOptions<TSlot extends RosterEditorSlot> {
    initialSlots: TSlot[]
    /** Returns an error message to toast, or null to proceed with saving. */
    validate?: (filledSlots: TSlot[]) => string | null
    save: (
        filledSlots: TSlot[]
    ) => Promise<{ status: boolean; message?: string }>
    defaultSuccessMessage: string
    computeDiff: (oldSlots: TSlot[], newSlots: TSlot[]) => RosterChangeEntry[]
    /** Sends notifications for the confirmed subset of changes. */
    sendChanges: (toNotify: RosterChangeEntry[]) => Promise<unknown>
}

export function useRosterEditor<TSlot extends RosterEditorSlot>({
    initialSlots,
    validate,
    save,
    defaultSuccessMessage,
    computeDiff,
    sendChanges
}: RosterEditorOptions<TSlot>) {
    const [slotAssignments, setSlotAssignments] =
        useState<TSlot[]>(initialSlots)
    const [isSaving, setIsSaving] = useState(false)
    const [notifyDialogOpen, setNotifyDialogOpen] = useState(false)
    const [pendingChanges, setPendingChanges] = useState<RosterChangeEntry[]>(
        []
    )
    const [isSendingNotifications, setIsSendingNotifications] = useState(false)
    const nextKey = useRef(0)

    // Tracks the last successfully saved state for diff computation
    const lastSavedSlots = useRef<TSlot[]>(initialSlots)

    const filledUserIds = useMemo(
        () => slotAssignments.map((slot) => slot.userId).filter(Boolean),
        [slotAssignments]
    )

    const addSlot = (fields: Omit<TSlot, "localKey" | "userId">) => {
        const key = `new-${nextKey.current++}`
        setSlotAssignments((prev) => [
            ...prev,
            { ...fields, localKey: key, userId: "" } as TSlot
        ])
    }

    const removeSlot = (localKey: string) => {
        setSlotAssignments((prev) =>
            prev.filter((slot) => slot.localKey !== localKey)
        )
    }

    const changeSlotUser = (localKey: string, userId: string) => {
        setSlotAssignments((prev) =>
            prev.map((slot) =>
                slot.localKey === localKey ? { ...slot, userId } : slot
            )
        )
    }

    const updateSlot = (localKey: string, patch: Partial<TSlot>) => {
        setSlotAssignments((prev) =>
            prev.map((slot) =>
                slot.localKey === localKey ? { ...slot, ...patch } : slot
            )
        )
    }

    const handleSubmit = async () => {
        const filledSlots = slotAssignments.filter((slot) => slot.userId)

        const validationError = validate?.(filledSlots) ?? null
        if (validationError) {
            toast.error(validationError)
            return
        }

        setIsSaving(true)

        const result = await save(filledSlots)

        if (result.status) {
            toast.success(result.message ?? defaultSuccessMessage)
            const changes = computeDiff(
                lastSavedSlots.current.filter((s) => s.userId),
                filledSlots
            )
            lastSavedSlots.current = filledSlots
            if (changes.length > 0) {
                setPendingChanges(changes)
                setNotifyDialogOpen(true)
            }
        } else {
            toast.error(result.message ?? "Failed to save rosters.")
        }

        setIsSaving(false)
    }

    const handleSendNotifications = async (selectedUserIds: string[]) => {
        setIsSendingNotifications(true)
        const toNotify = pendingChanges.filter((c) =>
            selectedUserIds.includes(c.userId)
        )
        await sendChanges(toNotify)
        setIsSendingNotifications(false)
        setNotifyDialogOpen(false)
    }

    return {
        slotAssignments,
        filledUserIds,
        addSlot,
        removeSlot,
        changeSlotUser,
        updateSlot,
        isSaving,
        handleSubmit,
        notifyDialog: {
            open: notifyDialogOpen,
            changes: pendingChanges,
            isSending: isSendingNotifications,
            onConfirm: handleSendNotifications,
            onClose: () => setNotifyDialogOpen(false)
        }
    }
}
