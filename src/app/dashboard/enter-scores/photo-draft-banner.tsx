"use client"

import { Button } from "@/components/ui/button"
import type { ScoreDraft } from "@/lib/scoresheets/read/draft"
import { cn } from "@/lib/utils"

/**
 * Offers what a photograph said, without applying it.
 *
 * Deliberately a button rather than something that fills the form on load. A
 * reading is evidence, not a result: the admin decides to take it, checks what
 * is flagged, and presses Save as they always did, so every existing
 * validation and the playoff cascade behind it still run.
 */
export function PhotoDraftBanner({
    drafts,
    flaggedCount,
    applied,
    onApply,
    onDismiss
}: {
    drafts: ScoreDraft[]
    flaggedCount: number
    applied: boolean
    onApply: () => void
    onDismiss: () => void
}) {
    if (drafts.length === 0) return null

    const filled = drafts.filter((d) => !d.empty).length
    const courts = [...new Set(drafts.map((d) => d.matchId))].length

    return (
        <div
            className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-2 text-sm",
                applied
                    ? "border-green-500/40 bg-green-500/5"
                    : "border-primary/40 bg-primary/5"
            )}
        >
            <div className="space-y-0.5">
                <p className="font-medium">
                    {applied
                        ? "Filled in from the photo. Check it, then save as usual."
                        : `Read from a photo: ${filled} match${filled === 1 ? "" : "es"} of ${courts}.`}
                </p>
                {flaggedCount > 0 && (
                    <p className="text-muted-foreground">
                        {flaggedCount} field{flaggedCount === 1 ? "" : "s"} need
                        {flaggedCount === 1 ? "s" : ""} checking against the
                        photo.
                    </p>
                )}
                {flaggedCount === 0 && !applied && (
                    <p className="text-muted-foreground">
                        Everything read cleanly, but nothing is saved until you
                        say so.
                    </p>
                )}
            </div>
            <div className="flex gap-2">
                {!applied && (
                    <Button size="sm" onClick={onApply}>
                        Fill in
                    </Button>
                )}
                <Button size="sm" variant="ghost" onClick={onDismiss}>
                    {applied ? "Hide" : "Ignore"}
                </Button>
            </div>
        </div>
    )
}
