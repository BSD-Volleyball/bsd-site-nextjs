import { describe, expect, it } from "vitest"
import {
    moveEntry,
    removeAndShiftUp,
    removeKeyAndShiftUp,
    tabSlotKeys,
    type TabShape
} from "./homework-board"
import type { Selections } from "./homework-selections"

// 2 rounds x 3 teams, plus 2 Considering slots = 8 ranked slots
const shape: TabShape = {
    tabKey: "m",
    numRounds: 2,
    numTeams: 3,
    consideringCount: 2
}

function board(): Selections {
    return {
        "m-1-0": "a",
        "m-1-1": "b",
        "m-1-2": "c",
        "m-2-0": "d",
        "m-2-1": "e",
        "m-2-2": "f",
        "m-9-0": "g",
        "m-9-1": "h",
        // the other tab must never be touched
        "f-1-0": "z"
    }
}

describe("tabSlotKeys", () => {
    it("lists round slots in order, then Considering last", () => {
        expect(tabSlotKeys(shape)).toEqual([
            "m-1-0",
            "m-1-1",
            "m-1-2",
            "m-2-0",
            "m-2-1",
            "m-2-2",
            "m-9-0",
            "m-9-1"
        ])
    })
})

describe("removeAndShiftUp", () => {
    it("shifts later rounds and Considering up when a Round 1 player is removed", () => {
        const result = removeAndShiftUp(board(), shape, new Set(["b"]))

        expect(result.selections).toEqual({
            "m-1-0": "a",
            "m-1-1": "c",
            "m-1-2": "d",
            "m-2-0": "e",
            "m-2-1": "f",
            "m-2-2": "g",
            "m-9-0": "h",
            "m-9-1": null,
            "f-1-0": "z"
        })
        expect(result.consideringCount).toBe(1)
    })

    it("removes several players in one pass and keeps Considering at least one slot", () => {
        const result = removeAndShiftUp(
            board(),
            shape,
            new Set(["a", "g", "h"])
        )

        expect(result.selections).toEqual({
            "m-1-0": "b",
            "m-1-1": "c",
            "m-1-2": "d",
            "m-2-0": "e",
            "m-2-1": "f",
            "m-2-2": null,
            "m-9-0": null,
            "m-9-1": null,
            "f-1-0": "z"
        })
        expect(result.consideringCount).toBe(1)
    })

    it("keeps an empty slot in place relative to its neighbours", () => {
        const withHole = { ...board(), "m-1-1": null }
        const result = removeAndShiftUp(withHole, shape, new Set(["e"]))

        expect(result.selections["m-1-0"]).toBe("a")
        expect(result.selections["m-1-1"]).toBeNull()
        expect(result.selections["m-1-2"]).toBe("c")
        expect(result.selections["m-2-0"]).toBe("d")
        expect(result.selections["m-2-1"]).toBe("f")
        expect(result.selections["m-2-2"]).toBe("g")
        expect(result.selections["m-9-0"]).toBe("h")
        expect(result.consideringCount).toBe(1)
    })

    it("returns the board unchanged when nothing on this tab matches", () => {
        const result = removeAndShiftUp(board(), shape, new Set(["z", "nope"]))

        expect(result.selections).toEqual(board())
        expect(result.consideringCount).toBe(2)
    })

    it("does not mutate the input", () => {
        const input = board()
        removeAndShiftUp(input, shape, new Set(["a"]))
        expect(input).toEqual(board())
    })
})

describe("removeKeyAndShiftUp", () => {
    it("removes the entry at one key and shifts everything after it up", () => {
        const result = removeKeyAndShiftUp(board(), shape, "m-2-1")

        expect(result.selections["m-2-1"]).toBe("f")
        expect(result.selections["m-2-2"]).toBe("g")
        expect(result.selections["m-9-0"]).toBe("h")
        expect(result.selections["m-9-1"]).toBeNull()
        expect(result.consideringCount).toBe(1)
    })

    it("on a Considering key only shifts the Considering entries after it", () => {
        const result = removeKeyAndShiftUp(board(), shape, "m-9-0")

        expect(result.selections["m-2-2"]).toBe("f")
        expect(result.selections["m-9-0"]).toBe("h")
        expect(result.selections["m-9-1"]).toBeNull()
        expect(result.consideringCount).toBe(1)
    })

    it("removing an empty Considering slot still shrinks the list", () => {
        const withEmpty = { ...board(), "m-9-1": null }
        const result = removeKeyAndShiftUp(withEmpty, shape, "m-9-1")

        expect(result.selections["m-9-0"]).toBe("g")
        expect(result.consideringCount).toBe(1)
    })
})

describe("moveEntry", () => {
    it("moving forward shifts the entries in between up by one", () => {
        const result = moveEntry(board(), shape, "m-1-0", "m-2-1")

        expect(result).toEqual({
            "m-1-0": "b",
            "m-1-1": "c",
            "m-1-2": "d",
            "m-2-0": "e",
            "m-2-1": "a",
            "m-2-2": "f",
            "m-9-0": "g",
            "m-9-1": "h",
            "f-1-0": "z"
        })
    })

    it("moving backward shifts the entries in between down by one", () => {
        const result = moveEntry(board(), shape, "m-9-0", "m-1-0")

        expect(result).toEqual({
            "m-1-0": "g",
            "m-1-1": "a",
            "m-1-2": "b",
            "m-2-0": "c",
            "m-2-1": "d",
            "m-2-2": "e",
            "m-9-0": "f",
            "m-9-1": "h",
            "f-1-0": "z"
        })
    })

    it("moving onto the same key is a no-op", () => {
        expect(moveEntry(board(), shape, "m-1-1", "m-1-1")).toEqual(board())
    })

    it("ignores keys outside this tab's ranked slots", () => {
        expect(moveEntry(board(), shape, "f-1-0", "m-1-0")).toEqual(board())
        expect(moveEntry(board(), shape, "m-1-0", "m-3-0")).toEqual(board())
    })
})
