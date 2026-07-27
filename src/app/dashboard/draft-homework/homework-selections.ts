import type { DraftHomeworkData } from "./actions"

// Key format: `${m|f}-${round}-${slot}`
export type Selections = Record<string, string | null>

export const CONSIDERING_ROUND = 9

export function buildInitialSelections(data: DraftHomeworkData): Selections {
    const s: Selections = {}
    for (const sel of data.existingSelections) {
        const tabKey = sel.isMaleTab ? "m" : "f"
        s[`${tabKey}-${sel.round}-${sel.slot}`] = sel.playerId
    }
    return s
}

export function parseGenderSplit(genderSplit: string): [number, number] {
    const parts = genderSplit.split("-").map(Number)
    return [parts[0] ?? 0, parts[1] ?? 0]
}
