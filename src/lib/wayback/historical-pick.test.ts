import { describe, expect, it } from "vitest"
import {
    HISTORICAL_ROUND,
    divisionBand,
    historicalOverall
} from "./historical-pick"

describe("historicalOverall", () => {
    it("places the pick in its division's band", () => {
        // The bug this replaced: every division got the AA value, because the
        // level offset was missing. AA is the one case where that is correct.
        expect(historicalOverall(1, 8)).toBe(25) // AA, band 1-50
        expect(historicalOverall(2, 8)).toBe(75) // A,  band 51-100
        expect(historicalOverall(6, 8)).toBe(275) // BB, band 251-300
        expect(historicalOverall(8, 4)).toBe(363) // C,  band 351-400
    })

    it("agrees with submitDraft's formula at round 4, position 1", () => {
        // src/app/dashboard/draft-division/actions.ts:
        //   (level - 1) * 50 + (round - 1) * numTeams + position
        const live = (level: number, numTeams: number) =>
            (level - 1) * 50 + (HISTORICAL_ROUND - 1) * numTeams + 1
        for (const level of [1, 2, 5, 6, 7, 8]) {
            for (const teams of [4, 6, 8, 9]) {
                expect(historicalOverall(level, teams)).toBe(live(level, teams))
            }
        }
    })

    it("never leaves the division's own band for realistic team counts", () => {
        // A band is 50 wide and holds (round - 1) * teams + 1; round 4 with 16
        // teams is 49, so the band cannot overflow at any size the league runs.
        for (const level of [1, 2, 3, 4, 5, 6, 7, 8]) {
            const band = divisionBand(level)
            for (let teams = 2; teams <= 16; teams++) {
                const overall = historicalOverall(level, teams)
                expect(overall).toBeGreaterThanOrEqual(band.min)
                expect(overall).toBeLessThanOrEqual(band.max)
            }
        }
    })

    it("gives adjacent levels non-overlapping bands", () => {
        expect(divisionBand(1)).toEqual({ min: 1, max: 50 })
        expect(divisionBand(2).min).toBe(divisionBand(1).max + 1)
        expect(divisionBand(6)).toEqual({ min: 251, max: 300 })
    })
})
