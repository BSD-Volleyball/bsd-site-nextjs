import { sortAlphanumerically } from "../utils/string"
export const generatePreviousRound = (matchesColumn, listOfMatches) => {
    const result = []
    for (const match of matchesColumn) {
        const previousMatches = listOfMatches
            .filter((m) => m.nextMatchId === match.id)
            .sort((a, b) => sortAlphanumerically(a.name, b.name))
        result.push(...previousMatches)
    }
    return result
}
export function getPreviousMatches(
    columnIndex,
    columns,
    previousBottomPosition
) {
    const previousTopMatch =
        columnIndex !== 0 &&
        columns[columnIndex - 1][previousBottomPosition - 1]
    const previousBottomMatch =
        columnIndex !== 0 && columns[columnIndex - 1][previousBottomPosition]
    return { previousTopMatch, previousBottomMatch }
}
export function sortTeamsSeedOrder(previousBottomMatch) {
    return (partyA, partyB) => {
        const previousParticipants = previousBottomMatch?.participants
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
//# sourceMappingURL=match-functions.js.map
