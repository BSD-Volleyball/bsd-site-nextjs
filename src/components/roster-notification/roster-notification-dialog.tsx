"use client"

import { useEffect, useState } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { RosterChangeEntry } from "./types"

interface RosterNotificationDialogProps {
    open: boolean
    weekNumber: 1 | 2 | 3
    seasonLabel: string
    changes: RosterChangeEntry[]
    isSending: boolean
    onConfirm: (selectedUserIds: string[]) => void
    onClose: () => void
}

function getChangeSummary(
    entry: RosterChangeEntry,
    weekNumber: 1 | 2 | 3
): string {
    if (entry.changeKind === "removed") {
        return "Removed from roster"
    }
    if (weekNumber === 1 && entry.week1Assignment) {
        return `Session ${entry.week1Assignment.sessionNumber}, Court ${entry.week1Assignment.courtNumber}`
    }
    if (entry.divisionAssignments && entry.divisionAssignments.length > 0) {
        return entry.divisionAssignments
            .map((a) => `${a.divisionName} — Team ${a.teamNumber}`)
            .join("; ")
    }
    return ""
}

export function RosterNotificationDialog({
    open,
    weekNumber,
    seasonLabel,
    changes,
    isSending,
    onConfirm,
    onClose
}: RosterNotificationDialogProps) {
    const [checked, setChecked] = useState<Set<string>>(new Set())

    useEffect(() => {
        if (open) {
            setChecked(new Set(changes.map((c) => c.userId)))
        }
    }, [open, changes])

    const toggleOne = (userId: string) => {
        setChecked((prev) => {
            const next = new Set(prev)
            if (next.has(userId)) {
                next.delete(userId)
            } else {
                next.add(userId)
            }
            return next
        })
    }

    const selectedCount = checked.size

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v) onClose()
            }}
        >
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Notify Impacted Players</DialogTitle>
                    <DialogDescription>
                        The following players were added, removed, or moved in
                        Week {weekNumber} ({seasonLabel}). Select who should
                        receive an email notification.
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-72 space-y-2 overflow-y-auto py-1">
                    {changes.map((entry) => (
                        <label
                            key={entry.userId}
                            className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
                        >
                            <Checkbox
                                checked={checked.has(entry.userId)}
                                onCheckedChange={() => toggleOne(entry.userId)}
                                className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                                <p className="font-medium text-sm leading-tight">
                                    {entry.displayName}
                                </p>
                                <p className="text-muted-foreground text-xs">
                                    {getChangeSummary(entry, weekNumber)}
                                </p>
                            </div>
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground text-xs capitalize">
                                {entry.changeKind}
                            </span>
                        </label>
                    ))}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={isSending}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={() => onConfirm([...checked])}
                        disabled={selectedCount === 0 || isSending}
                    >
                        {isSending
                            ? "Sending..."
                            : `Send Notifications (${selectedCount})`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
