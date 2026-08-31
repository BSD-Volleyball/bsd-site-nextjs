import { describe, expect, it } from "vitest"

import { buildHomeworkRoundMaps } from "./draft-round-maps"

describe("buildHomeworkRoundMaps", () => {
    it("maps 5-3 homework rounds identically to the legacy hardcoded maps", () => {
        expect(buildHomeworkRoundMaps("5-3")).toEqual({
            male: { 1: 1, 2: 2, 3: 4, 4: 6, 5: 7 },
            nonMale: { 1: 3, 2: 5, 3: 8 }
        })
    })

    it("maps 6-2 homework rounds with females in draft rounds 3 and 8", () => {
        expect(buildHomeworkRoundMaps("6-2")).toEqual({
            male: { 1: 1, 2: 2, 3: 4, 4: 5, 5: 6, 6: 7 },
            nonMale: { 1: 3, 2: 8 }
        })
    })

    it("falls back to the 5-3 maps for unknown or missing splits", () => {
        const legacy = buildHomeworkRoundMaps("5-3")
        expect(buildHomeworkRoundMaps("garbage")).toEqual(legacy)
        expect(buildHomeworkRoundMaps("")).toEqual(legacy)
        expect(buildHomeworkRoundMaps("4-4")).toEqual(legacy)
    })
})
