/**
 * format.ts — client-safe labels for the Coverage page and digest email.
 */

import { formatMatchTime, formatShortDate } from "@/lib/season-utils"
import type { CoverageDate, CoverageStatus } from "./types"

/**
 * Canonical "HH:MM:SS". Match times come back from pg as "HH:MM:SS" but
 * schedule items may carry "HH:MM"; presence rows must match either.
 */
export function normalizeTime(t: string | null): string | null {
    if (!t) return null
    const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
    if (!m) return null
    const hh = m[1].padStart(2, "0")
    return `${hh}:${m[2]}:${m[3] ?? "00"}`
}

export function formatSlotLabel(t: string | null): string {
    return t ? formatMatchTime(t) : "TBD"
}

export function formatCoverageDate(date: string): string {
    return formatShortDate(date)
}

export function coverageDateTitle(
    d: Pick<CoverageDate, "eventType" | "ordinal" | "label">
): string {
    if (d.label) return d.label
    return d.eventType === "playoff"
        ? `Playoffs Week ${d.ordinal}`
        : `Week ${d.ordinal}`
}

export const STATUS_LABELS: Record<CoverageStatus, string> = {
    green: "Covered",
    yellow: "Gaps mid-night",
    red: "Setup or cleanup uncovered"
}
