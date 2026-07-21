import { describe, expect, it } from "vitest"
import {
    describeSetsFormat,
    isDecisiveFormat,
    isMatchFinal,
    isValidSetsFormat,
    matchWinnerSide,
    tallySetWins,
    type SetsFormat
} from "@/lib/tournament-sets"

const exact = (count: number): SetsFormat => ({ mode: "exact", count })
const bestOf = (count: number): SetsFormat => ({ mode: "best_of", count })

describe("tallySetWins", () => {
    it("counts wins over entered sets and ignores unplayed/drawn sets", () => {
        expect(tallySetWins([25, 20, null], [23, 25, null])).toEqual({
            homeWins: 1,
            awayWins: 1,
            entered: 2
        })
        // A drawn set counts for neither side but still counts as entered.
        expect(tallySetWins([25], [25])).toEqual({
            homeWins: 0,
            awayWins: 0,
            entered: 1
        })
        // A set with only one side scored is not yet entered.
        expect(tallySetWins([25, 10], [23, null])).toEqual({
            homeWins: 1,
            awayWins: 0,
            entered: 1
        })
    })
})

describe("isMatchFinal", () => {
    it("exact: final once N sets are entered", () => {
        expect(isMatchFinal(exact(2), tallySetWins([25], [20]))).toBe(false)
        expect(isMatchFinal(exact(2), tallySetWins([25, 20], [20, 25]))).toBe(
            true
        )
        expect(isMatchFinal(exact(3), tallySetWins([25, 20], [20, 25]))).toBe(
            false
        )
    })

    it("best_of: final once a side reaches the clinching majority", () => {
        // Best of 3 → 2 set wins clinches, even before a 3rd set is played.
        expect(isMatchFinal(bestOf(3), tallySetWins([25, 25], [20, 20]))).toBe(
            true
        )
        expect(isMatchFinal(bestOf(3), tallySetWins([25, 20], [20, 25]))).toBe(
            false
        )
        // Best of 1 → a single set decides it.
        expect(isMatchFinal(bestOf(1), tallySetWins([25], [20]))).toBe(true)
    })
})

describe("matchWinnerSide", () => {
    it("exact: more set wins; tie yields null", () => {
        expect(
            matchWinnerSide(exact(2), tallySetWins([25, 25], [20, 20]))
        ).toBe("home")
        // 1-1 split in an exact-2 match — no winner.
        expect(
            matchWinnerSide(exact(2), tallySetWins([25, 20], [20, 25]))
        ).toBeNull()
        // Not yet final.
        expect(matchWinnerSide(exact(2), tallySetWins([25], [20]))).toBeNull()
        expect(matchWinnerSide(exact(1), tallySetWins([20], [25]))).toBe("away")
    })

    it("best_of: the side reaching majority wins as soon as clinched", () => {
        expect(
            matchWinnerSide(bestOf(3), tallySetWins([25, 25], [20, 20]))
        ).toBe("home")
        expect(
            matchWinnerSide(bestOf(3), tallySetWins([20, 25, 20], [25, 20, 25]))
        ).toBe("away")
        expect(
            matchWinnerSide(bestOf(3), tallySetWins([25, 20], [20, 25]))
        ).toBeNull()
    })
})

describe("isDecisiveFormat", () => {
    it("best_of is always decisive; exact only with an odd count", () => {
        expect(isDecisiveFormat(bestOf(3))).toBe(true)
        expect(isDecisiveFormat(exact(3))).toBe(true)
        expect(isDecisiveFormat(exact(1))).toBe(true)
        expect(isDecisiveFormat(exact(2))).toBe(false)
    })
})

describe("isValidSetsFormat", () => {
    it("bounds count to 1-3 and rejects even best_of", () => {
        expect(isValidSetsFormat(exact(2))).toBe(true)
        expect(isValidSetsFormat(bestOf(3))).toBe(true)
        expect(isValidSetsFormat(exact(0))).toBe(false)
        expect(isValidSetsFormat(exact(4))).toBe(false)
        expect(isValidSetsFormat(bestOf(2))).toBe(false)
    })

    it("requireDecisive rejects formats that can tie (playoffs)", () => {
        expect(isValidSetsFormat(exact(2), { requireDecisive: true })).toBe(
            false
        )
        expect(isValidSetsFormat(exact(3), { requireDecisive: true })).toBe(
            true
        )
        expect(isValidSetsFormat(bestOf(3), { requireDecisive: true })).toBe(
            true
        )
    })
})

describe("describeSetsFormat", () => {
    it("renders friendly labels", () => {
        expect(describeSetsFormat(bestOf(3))).toBe("Best of 3")
        expect(describeSetsFormat(exact(2))).toBe("2 sets")
        expect(describeSetsFormat(exact(1))).toBe("1 set")
    })
})
