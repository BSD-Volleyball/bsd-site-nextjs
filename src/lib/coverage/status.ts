/**
 * status.ts — the one definition of green / yellow / red, shared by the page
 * pill, the email subject and the tests.
 */

import { formatSlotLabel } from "./format"
import type { CoverageSlot, CoverageStatus } from "./types"

function isCovered(slot: CoverageSlot): boolean {
    return slot.people.some((p) => p.counts)
}

function joinLabels(labels: string[]): string {
    if (labels.length <= 1) return labels[0] ?? ""
    return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`
}

export function computeStatus(slots: CoverageSlot[]): {
    status: CoverageStatus
    reason: string
} {
    const timed = slots.filter((s) => s.startTime !== null)
    if (timed.length === 0) return { status: "red", reason: "no timed slots" }

    const first = timed[0]
    const last = timed[timed.length - 1]
    if (!isCovered(first)) {
        return {
            status: "red",
            reason: `first slot (${formatSlotLabel(first.startTime)}) uncovered`
        }
    }
    if (!isCovered(last)) {
        return {
            status: "red",
            reason: `last slot (${formatSlotLabel(last.startTime)}) uncovered`
        }
    }
    const gaps = timed
        .slice(1, -1)
        .filter((s) => !isCovered(s))
        .map((s) => formatSlotLabel(s.startTime))
    if (gaps.length > 0) {
        return {
            status: "yellow",
            reason: `${joinLabels(gaps)} slot${gaps.length > 1 ? "s" : ""} uncovered`
        }
    }
    return {
        status: "green",
        reason: `all ${timed.length} slot${timed.length === 1 ? "" : "s"} covered`
    }
}
