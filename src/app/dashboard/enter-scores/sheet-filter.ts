import type { DivisionMatchGroup, ScoreSheetData } from "./actions"

/**
 * The score sheets to show under one division's card.
 *
 * A sheet uploaded from the card itself carries the division id. A sheet
 * uploaded in bulk through the inbox carries only the court its tag named
 * (`division_id` is null, because on playoff week 2 one court hosts two
 * divisions), so it belongs to every division with a match on that court
 * that night. A bulk sheet whose court is still unknown is shown under every
 * division rather than hidden: someone has to be able to see and delete it.
 */
export function sheetsForDivision(
    sheets: ScoreSheetData[],
    division: Pick<DivisionMatchGroup, "divisionId" | "matches">
): ScoreSheetData[] {
    const courts = new Set(
        division.matches
            .map((m) => m.court)
            .filter((c): c is number => c !== null)
    )
    return sheets.filter((s) => {
        if (s.divisionId !== null) return s.divisionId === division.divisionId
        if (s.court === null) return true
        return courts.has(s.court)
    })
}
