import { reorder } from "@/lib/utils"
import { CONSIDERING_ROUND, type Selections } from "./homework-selections"

/**
 * Describes one gender tab of the homework board as a single ranked list:
 * Round 1..numRounds (numTeams slots each) followed by the growable
 * Considering list. Every operation here works on that flat order.
 */
export interface TabShape {
    tabKey: "m" | "f"
    numRounds: number
    numTeams: number
    consideringCount: number
}

interface ShiftResult {
    selections: Selections
    consideringCount: number
}

export function tabSlotKeys(shape: TabShape): string[] {
    const keys: string[] = []
    for (let round = 1; round <= shape.numRounds; round++) {
        for (let slot = 0; slot < shape.numTeams; slot++) {
            keys.push(`${shape.tabKey}-${round}-${slot}`)
        }
    }
    for (let slot = 0; slot < shape.consideringCount; slot++) {
        keys.push(`${shape.tabKey}-${CONSIDERING_ROUND}-${slot}`)
    }
    return keys
}

function readValues(selections: Selections, keys: string[]) {
    return keys.map((key) => selections[key] ?? null)
}

/**
 * Write a (possibly shorter) ranked list back onto the tab. Round slots are
 * fixed, so the list is padded with nulls up to the round count; whatever
 * is left spills into Considering, which shrinks to fit (never below 1).
 * Considering keys that existed before but are now past the end are set
 * to null so stale entries can't survive.
 */
function writeValues(
    selections: Selections,
    shape: TabShape,
    values: (string | null)[]
): ShiftResult {
    const roundSlotCount = shape.numRounds * shape.numTeams
    const consideringCount = Math.max(1, values.length - roundSlotCount)
    const nextShape = { ...shape, consideringCount }
    const nextKeys = tabSlotKeys(nextShape)

    const next: Selections = { ...selections }
    for (const key of tabSlotKeys(shape)) {
        next[key] = null
    }
    nextKeys.forEach((key, i) => {
        next[key] = values[i] ?? null
    })
    return { selections: next, consideringCount }
}

function removeIndices(
    selections: Selections,
    shape: TabShape,
    shouldRemove: (value: string | null, index: number) => boolean
): ShiftResult {
    const keys = tabSlotKeys(shape)
    const values = readValues(selections, keys).filter(
        (value, index) => !shouldRemove(value, index)
    )
    if (values.length === keys.length) {
        return { selections, consideringCount: shape.consideringCount }
    }
    return writeValues(selections, shape, values)
}

/** Drop every slot holding one of `playerIds`; everything after moves up. */
export function removeAndShiftUp(
    selections: Selections,
    shape: TabShape,
    playerIds: ReadonlySet<string>
): ShiftResult {
    return removeIndices(
        selections,
        shape,
        (value) => value !== null && playerIds.has(value)
    )
}

/** Drop the slot at `key` (filled or empty); everything after moves up. */
export function removeKeyAndShiftUp(
    selections: Selections,
    shape: TabShape,
    key: string
): ShiftResult {
    const target = tabSlotKeys(shape).indexOf(key)
    if (target === -1) {
        return { selections, consideringCount: shape.consideringCount }
    }
    return removeIndices(selections, shape, (_, index) => index === target)
}

/** Move the entry at `fromKey` to `toKey`; slots in between shift by one. */
export function moveEntry(
    selections: Selections,
    shape: TabShape,
    fromKey: string,
    toKey: string
): Selections {
    const keys = tabSlotKeys(shape)
    const from = keys.indexOf(fromKey)
    const to = keys.indexOf(toKey)
    if (from === -1 || to === -1 || from === to) {
        return selections
    }
    const values = reorder(readValues(selections, keys), from, to)
    const next: Selections = { ...selections }
    keys.forEach((key, i) => {
        next[key] = values[i]
    })
    return next
}
