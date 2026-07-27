import type { Match, MatchParticipant } from "../types"
import { sortAlphanumerically } from "../utils/string"

export const generatePreviousRound = <M extends Match>(
    matchesColumn: M[],
    listOfMatches: M[]
): M[] => {
    const result: M[] = []
    for (const match of matchesColumn) {
        const previousMatches = listOfMatches
            .filter((m) => m.nextMatchId === match.id)
            .sort((a, b) => sortAlphanumerically(a.name, b.name))
        result.push(...previousMatches)
    }
    return result
}

export function getPreviousMatches<M extends Match>(
    columnIndex: number,
    columns: M[][],
    previousBottomPosition: number
): { previousTopMatch: M | false; previousBottomMatch: M | false } {
    const previousTopMatch =
        columnIndex !== 0 &&
        columns[columnIndex - 1][previousBottomPosition - 1]
    const previousBottomMatch =
        columnIndex !== 0 && columns[columnIndex - 1][previousBottomPosition]
    return { previousTopMatch, previousBottomMatch }
}

export function sortTeamsSeedOrder(
    previousBottomMatch: Match | false | null | undefined
) {
    return (partyA: MatchParticipant, partyB: MatchParticipant): number => {
        const previousParticipants = previousBottomMatch
            ? previousBottomMatch.participants
            : undefined
        const partyAInBottomMatch = previousParticipants?.find(
            (p) => p.id === partyA.id
        )
        const partyBInBottomMatch = previousParticipants?.find(
            (p) => p.id === partyB.id
        )
        if (partyAInBottomMatch) {
            return 1
        }
        if (partyBInBottomMatch) {
            return -1
        }
        return 0
    }
}
