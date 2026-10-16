import { describe, expect, it } from "vitest"
import type { MatchScoreData, ScoreSheetData } from "./actions"
import { sheetsForDivision } from "./sheet-filter"

function match(court: number | null): MatchScoreData {
    return { matchId: court ?? 0, court } as MatchScoreData
}

const divA = { divisionId: 1, matches: [match(1), match(2)] }
const divB = { divisionId: 2, matches: [match(3), match(null)] }

const byDivision: ScoreSheetData = {
    id: 10,
    divisionId: 1,
    court: null,
    imagePath: "a",
    uploadedBy: "Pat Smith",
    uploadedAt: "2026-10-05T01:31:00.000Z"
}
const byCourt2: ScoreSheetData = {
    id: 11,
    divisionId: null,
    court: 2,
    imagePath: "b",
    uploadedBy: "Pat Smith",
    uploadedAt: "2026-10-05T01:31:00.000Z"
}
const byCourt3: ScoreSheetData = {
    id: 12,
    divisionId: null,
    court: 3,
    imagePath: "c",
    uploadedBy: "Pat Smith",
    uploadedAt: "2026-10-05T01:31:00.000Z"
}
const unidentified: ScoreSheetData = {
    id: 13,
    divisionId: null,
    court: null,
    imagePath: "d",
    uploadedBy: "Pat Smith",
    uploadedAt: "2026-10-05T01:31:00.000Z"
}
const all = [byDivision, byCourt2, byCourt3, unidentified]

describe("sheetsForDivision", () => {
    it("keeps sheets uploaded against the division itself", () => {
        expect(sheetsForDivision([byDivision], divA)).toEqual([byDivision])
        expect(sheetsForDivision([byDivision], divB)).toEqual([])
    })

    it("shows an inbox sheet under every division playing on its court", () => {
        expect(sheetsForDivision(all, divA).map((s) => s.id)).toEqual([
            10, 11, 13
        ])
        expect(sheetsForDivision(all, divB).map((s) => s.id)).toEqual([12, 13])
    })

    it("shows a court sheet under both divisions sharing that court", () => {
        const shared = { divisionId: 3, matches: [match(2)] }
        expect(sheetsForDivision([byCourt2], divA)).toEqual([byCourt2])
        expect(sheetsForDivision([byCourt2], shared)).toEqual([byCourt2])
    })

    it("never matches a TBD match (null court) against a court sheet", () => {
        expect(sheetsForDivision([byCourt2, byCourt3], divB)).toEqual([
            byCourt3
        ])
    })
})
