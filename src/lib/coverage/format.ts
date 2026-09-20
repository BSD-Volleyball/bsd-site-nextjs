/**
 * format.ts — client-safe labels for the Coverage page and digest email.
 */

import { formatMatchTime, formatShortDate } from "@/lib/season-utils"
import type { CoverageDate, CoveragePerson, CoverageStatus } from "./types"

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

/**
 * How a person chip should be shaded, on the page and in the digest email.
 * Order matters: a leadership member who also counts (added present, or now
 * coaching) is "leadership_covering" rather than plain "leadership".
 */
export type PersonTone =
    | "admin"
    | "admin_unavailable"
    | "leadership"
    | "leadership_covering"
    | "other"

export function personTone(
    p: Pick<CoveragePerson, "counts" | "isLeadership" | "unavailable">
): PersonTone {
    if (!p.isLeadership && p.counts) return "admin"
    if (!p.isLeadership && p.unavailable) return "admin_unavailable"
    if (p.isLeadership && p.counts) return "leadership_covering"
    if (p.isLeadership) return "leadership"
    return "other"
}
