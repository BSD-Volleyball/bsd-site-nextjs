"use client"

import { useId } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { RiAlertLine, RiPhoneLine, RiMailLine } from "@remixicon/react"
import type { SubContactDetails } from "./find-sub-actions"
import { formatDate } from "./find-sub-helpers"
import type {
    RegularLockTarget,
    PermanentLockTarget,
    SubRequestTarget
} from "./find-sub-helpers"

export function RequestSubModal({
    target,
    message,
    onMessageChange,
    requestError,
    isSending,
    onCancel,
    onConfirm
}: {
    target: SubRequestTarget
    message: string
    onMessageChange: (value: string) => void
    requestError: string | null
    isSending: boolean
    onCancel: () => void
    onConfirm: () => void
}) {
    const messageId = useId()
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open && !isSending) onCancel()
            }}
        >
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Request a sub</DialogTitle>
                    <DialogDescription>
                        This sends an email to {target.subName}&apos;s captain (
                        {target.subTeamName}) asking them to approve the sub.
                    </DialogDescription>
                </DialogHeader>
                <div>
                    <div className="mb-3 space-y-1 text-sm">
                        <p>
                            <span className="text-muted-foreground">
                                Match:{" "}
                            </span>
                            {formatDate(target.matchDate)}
                        </p>
                        <p>
                            <span className="text-muted-foreground">Out: </span>
                            {target.originalName}
                        </p>
                        <p>
                            <span className="text-muted-foreground">
                                Requested sub:{" "}
                            </span>
                            {target.subName}
                        </p>
                    </div>
                    <label
                        htmlFor={messageId}
                        className="mb-1 block font-medium text-sm"
                    >
                        Message to their captain (optional)
                    </label>
                    <textarea
                        id={messageId}
                        value={message}
                        onChange={(e) => onMessageChange(e.target.value)}
                        disabled={isSending}
                        rows={3}
                        className="mb-3 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        placeholder="e.g. We're down two players for the 7pm match"
                    />
                    {requestError && (
                        <p className="mb-3 text-destructive text-sm">
                            {requestError}
                        </p>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onCancel}
                            disabled={isSending}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={onConfirm}
                            disabled={isSending}
                        >
                            {isSending ? "Sending..." : "Send Request"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export function ContactWarningModal({
    onClose,
    onAcknowledge,
    isLoading
}: {
    onClose: () => void
    onAcknowledge: () => void
    isLoading: boolean
}) {
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) onClose()
            }}
        >
            <DialogContent className="max-w-md">
                <DialogHeader className="flex-row items-start gap-3 space-y-0">
                    <RiAlertLine className="mt-0.5 h-6 w-6 shrink-0 text-amber-500" />
                    <div className="space-y-2">
                        <DialogTitle>Contact Information Notice</DialogTitle>
                        <DialogDescription>
                            This contact information should only be used
                            exclusively for BSD Volleyball League purposes. If
                            you would like to contact someone for any other
                            purpose, please ask them for their contact details
                            directly in person.
                        </DialogDescription>
                    </div>
                </DialogHeader>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={onAcknowledge}
                        disabled={isLoading}
                    >
                        Acknowledge &amp; View Details
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export function RegularLockModal({
    target,
    lockNotes,
    onNotesChange,
    lockError,
    isLocking,
    onCancel,
    onConfirm
}: {
    target: RegularLockTarget
    lockNotes: string
    onNotesChange: (value: string) => void
    lockError: string | null
    isLocking: boolean
    onCancel: () => void
    onConfirm: () => void
}) {
    const notesId = useId()
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open && !isLocking) onCancel()
            }}
        >
            <DialogContent className="max-w-md" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>Lock in regular sub</DialogTitle>
                </DialogHeader>
                <div>
                    <div className="mb-3 space-y-1 text-sm">
                        <p>
                            <span className="text-muted-foreground">
                                Match:{" "}
                            </span>
                            {formatDate(target.matchDate)}
                        </p>
                        <p>
                            <span className="text-muted-foreground">Out: </span>
                            {target.originalName}
                        </p>
                        <p>
                            <span className="text-muted-foreground">Sub: </span>
                            {target.subName}
                        </p>
                    </div>
                    <label
                        htmlFor={notesId}
                        className="mb-1 block font-medium text-sm"
                    >
                        Notes (optional)
                    </label>
                    <textarea
                        id={notesId}
                        value={lockNotes}
                        onChange={(e) => onNotesChange(e.target.value)}
                        disabled={isLocking}
                        rows={3}
                        className="w-full rounded-md border border-input bg-background p-2 text-sm"
                    />
                    {lockError && (
                        <p className="mt-2 text-destructive text-sm">
                            {lockError}
                        </p>
                    )}
                    <div className="mt-4 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onCancel}
                            disabled={isLocking}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={onConfirm}
                            disabled={isLocking}
                        >
                            {isLocking ? "Recording…" : "Lock in"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export function PermanentLockModal({
    target,
    lockNotes,
    onNotesChange,
    lockReason,
    onReasonChange,
    lockError,
    isLocking,
    onCancel,
    onConfirm
}: {
    target: PermanentLockTarget
    lockNotes: string
    onNotesChange: (value: string) => void
    lockReason: string
    onReasonChange: (value: string) => void
    lockError: string | null
    isLocking: boolean
    onCancel: () => void
    onConfirm: () => void
}) {
    const uid = useId()
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open && !isLocking) onCancel()
            }}
        >
            <DialogContent className="max-w-md" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>Lock in permanent sub</DialogTitle>
                </DialogHeader>
                <div>
                    <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 text-xs dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                        <RiAlertLine className="mr-1 inline h-4 w-4 align-text-bottom" />
                        This permanently replaces the player for the rest of the
                        season and removes the sub-in player from the waitlist.
                        The original draft round is preserved for historical
                        records.
                    </div>
                    <div className="mb-3 space-y-1 text-sm">
                        <p>
                            <span className="text-muted-foreground">Out: </span>
                            {target.originalName}
                        </p>
                        <p>
                            <span className="text-muted-foreground">Sub: </span>
                            {target.subName}
                        </p>
                    </div>
                    <label
                        htmlFor={`${uid}-reason`}
                        className="mb-1 block font-medium text-sm"
                    >
                        Reason (optional)
                    </label>
                    <input
                        id={`${uid}-reason`}
                        type="text"
                        value={lockReason}
                        onChange={(e) => onReasonChange(e.target.value)}
                        disabled={isLocking}
                        className="mb-3 w-full rounded-md border border-input bg-background p-2 text-sm"
                        placeholder="injury, schedule conflict, drop-out…"
                    />
                    <label
                        htmlFor={`${uid}-notes`}
                        className="mb-1 block font-medium text-sm"
                    >
                        Notes (optional)
                    </label>
                    <textarea
                        id={`${uid}-notes`}
                        value={lockNotes}
                        onChange={(e) => onNotesChange(e.target.value)}
                        disabled={isLocking}
                        rows={3}
                        className="w-full rounded-md border border-input bg-background p-2 text-sm"
                    />
                    {lockError && (
                        <p className="mt-2 text-destructive text-sm">
                            {lockError}
                        </p>
                    )}
                    <div className="mt-4 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onCancel}
                            disabled={isLocking}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={onConfirm}
                            disabled={isLocking}
                        >
                            {isLocking ? "Recording…" : "Lock in"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export function ContactDetailsModal({
    name,
    contact,
    onClose
}: {
    name: string
    contact: SubContactDetails
    onClose: () => void
}) {
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) onClose()
            }}
        >
            <DialogContent className="max-w-sm" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>{name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                        <RiMailLine className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <a
                            href={`mailto:${contact.email}`}
                            className="hover:underline"
                        >
                            {contact.email}
                        </a>
                    </div>
                    {contact.phone && (
                        <div className="flex items-center gap-2 text-sm">
                            <RiPhoneLine className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <a
                                href={`tel:${contact.phone}`}
                                className="hover:underline"
                            >
                                {contact.phone}
                            </a>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
