"use client"

import type { ReactNode, Ref } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

/**
 * A reply box with two send actions. Used for both the Active-email
 * composer and the New-email quick reply; the text and pending state live
 * in the card so they survive the card collapsing.
 */
export function ReplyComposer({
    heading,
    description,
    textareaRef,
    value,
    onChange,
    error,
    isPending,
    primaryLabel,
    onPrimary,
    secondaryLabel,
    onSecondary
}: {
    heading: ReactNode
    description?: ReactNode
    textareaRef?: Ref<HTMLTextAreaElement>
    value: string
    onChange: (value: string) => void
    error: string | null
    isPending: boolean
    primaryLabel: string
    onPrimary: () => void
    secondaryLabel: string
    onSecondary: () => void
}) {
    return (
        <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-950/20">
            <p className="font-medium text-sm">{heading}</p>
            {description && (
                <p className="text-muted-foreground text-sm">{description}</p>
            )}
            <Textarea
                ref={textareaRef}
                rows={4}
                placeholder="Write your reply…"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
            <div className="flex flex-wrap gap-2">
                <Button
                    size="sm"
                    onClick={onPrimary}
                    disabled={isPending || !value.trim()}
                >
                    {isPending ? "Sending…" : primaryLabel}
                </Button>
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={onSecondary}
                    disabled={isPending || !value.trim()}
                >
                    {isPending ? "Sending…" : secondaryLabel}
                </Button>
            </div>
        </div>
    )
}

export function InternalNoteComposer({
    value,
    onChange,
    error,
    isPending,
    onSubmit
}: {
    value: string
    onChange: (value: string) => void
    error: string | null
    isPending: boolean
    onSubmit: () => void
}) {
    return (
        <div className="space-y-2">
            <p className="font-medium text-muted-foreground text-sm">
                Add Internal Note
            </p>
            <Textarea
                rows={3}
                placeholder="Internal note (not visible to sender)…"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button
                size="sm"
                variant="outline"
                onClick={onSubmit}
                disabled={isPending || !value.trim()}
            >
                {isPending ? "Saving…" : "Add Note"}
            </Button>
        </div>
    )
}
