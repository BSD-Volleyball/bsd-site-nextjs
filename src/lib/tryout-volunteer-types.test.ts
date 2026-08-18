import { describe, expect, it } from "vitest"

import { parseCourtNumbers } from "./tryout-volunteer-types"

describe("parseCourtNumbers", () => {
    it("accepts comma / space separated lists and sorts + dedupes", () => {
        expect(parseCourtNumbers("1, 2, 3, 4")).toEqual([1, 2, 3, 4])
        expect(parseCourtNumbers("8 7 4 3 2 1 1")).toEqual([1, 2, 3, 4, 7, 8])
        expect(parseCourtNumbers("  ")).toEqual([])
    })

    it("rejects non-numeric, zero, and out-of-range courts", () => {
        expect(parseCourtNumbers("1, two")).toBeNull()
        expect(parseCourtNumbers("0, 1")).toBeNull()
        expect(parseCourtNumbers("1, 100")).toBeNull()
        expect(parseCourtNumbers("1.5")).toBeNull()
    })
})
