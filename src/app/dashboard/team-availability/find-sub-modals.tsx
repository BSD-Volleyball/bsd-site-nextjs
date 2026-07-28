"use client"

import { Button } from "@/components/ui/button"
import {
    RiAlertLine,
    RiCloseLine,
    RiPhoneLine,
    RiMailLine
} from "@remixicon/react"
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
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => !isSending && onCancel()}
            onKeyDown={(e) => {
                if (e.key === "Escape" && !isSending) onCancel()
            }}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
        >
            <div
                className="relative w-full max-w-md rounded-lg bg-background p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                role="document"
            >
                <h3 className="mb-1 font-semibold text-lg">Request a sub</h3>
                <p className="mb-3 text-muted-foreground text-sm">
                    This sends an email to {target.subName}&apos;s captain (
                    {target.subTeamName}) asking them to approve the sub.
                </p>
                <div className="mb-3 space-y-1 text-sm">
                    <p>
                        <span className="text-muted-foreground">Match: </span>
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
                    htmlFor="sub-request-message"
                    className="mb-1 block font-medium text-sm"
                >
                    Message to their captain (optional)
                </label>
                <textarea
                    id="sub-request-message"
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
        </div>
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
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={onClose}
            onKeyDown={(e) => {
                if (e.key === "Escape") onClose()
            }}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
        >
            <div
                className="relative w-full max-w-md rounded-lg bg-background p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                role="document"
            >
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-3 right-3 z-10 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                    <RiCloseLine className="h-5 w-5" />
                </button>
                <div className="mb-5 flex items-start gap-3">
                    <RiAlertLine className="mt-0.5 h-6 w-6 shrink-0 text-amber-500" />
                    <div>
                        <h3 className="mb-2 font-semibold text-lg">
                            Contact Information Notice
                        </h3>
                        <p className="text-muted-foreground text-sm">
                            This contact information should only be used
                            exclusively for BSD Volleyball League purposes. If
                            you would like to contact someone for any other
                            purpose, please ask them for their contact details
                            directly in person.
                        </p>
                    </div>
                </div>
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
            </div>
        </div>
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
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => !isLocking && onCancel()}
            onKeyDown={(e) => {
                if (e.key === "Escape" && !isLocking) onCancel()
            }}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
        >
            <div
                className="relative w-full max-w-md rounded-lg bg-background p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                role="document"
            >
                <h3 className="mb-3 font-semibold text-lg">
                    Lock in regular sub
                </h3>
                <div className="mb-3 space-y-1 text-sm">
                    <p>
                        <span className="text-muted-foreground">Match: </span>
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
                    htmlFor="regular-sub-notes"
                    className="mb-1 block font-medium text-sm"
                >
                    Notes (optional)
                </label>
                <textarea
                    id="regular-sub-notes"
                    value={lockNotes}
                    onChange={(e) => onNotesChange(e.target.value)}
                    disabled={isLocking}
                    rows={3}
                    className="w-full rounded-md border border-input bg-background p-2 text-sm"
                />
                {lockError && (
                    <p className="mt-2 text-destructive text-sm">{lockError}</p>
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
        </div>
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
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => !isLocking && onCancel()}
            onKeyDown={(e) => {
                if (e.key === "Escape" && !isLocking) onCancel()
            }}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
        >
            <div
                className="relative w-full max-w-md rounded-lg bg-background p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                role="document"
            >
                <h3 className="mb-3 font-semibold text-lg">
                    Lock in permanent sub
                </h3>
                <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 text-xs dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                    <RiAlertLine className="mr-1 inline h-4 w-4 align-text-bottom" />
                    This permanently replaces the player for the rest of the
                    season and removes the sub-in player from the waitlist. The
                    original draft round is preserved for historical records.
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
                    htmlFor="permanent-sub-reason"
                    className="mb-1 block font-medium text-sm"
                >
                    Reason (optional)
                </label>
                <input
                    id="permanent-sub-reason"
                    type="text"
                    value={lockReason}
                    onChange={(e) => onReasonChange(e.target.value)}
                    disabled={isLocking}
                    className="mb-3 w-full rounded-md border border-input bg-background p-2 text-sm"
                    placeholder="injury, schedule conflict, drop-out…"
                />
                <label
                    htmlFor="permanent-sub-notes"
                    className="mb-1 block font-medium text-sm"
                >
                    Notes (optional)
                </label>
                <textarea
                    id="permanent-sub-notes"
                    value={lockNotes}
                    onChange={(e) => onNotesChange(e.target.value)}
                    disabled={isLocking}
                    rows={3}
                    className="w-full rounded-md border border-input bg-background p-2 text-sm"
                />
                {lockError && (
                    <p className="mt-2 text-destructive text-sm">{lockError}</p>
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
        </div>
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
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={onClose}
            onKeyDown={(e) => {
                if (e.key === "Escape") onClose()
            }}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
        >
            <div
                className="relative w-full max-w-sm rounded-lg bg-background p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                role="document"
            >
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-3 right-3 z-10 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                    <RiCloseLine className="h-5 w-5" />
                </button>
                <h3 className="mb-4 font-semibold text-lg">{name}</h3>
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
            </div>
        </div>
    )
}
