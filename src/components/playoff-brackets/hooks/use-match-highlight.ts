import { useContext } from "react"
import { matchContext } from "../core/match-context"
import type { BracketSnippet } from "../types"

const useMatchHighlightContext = ({
    bracketSnippet = null
}: {
    bracketSnippet?: BracketSnippet | null
}): { topHighlighted: boolean; bottomHighlighted: boolean } => {
    const {
        state: { hoveredPartyId }
    } = useContext(matchContext)
    const previousTopMatch = bracketSnippet?.previousTopMatch
    const previousBottomMatch = bracketSnippet?.previousBottomMatch
    const currentMatch = bracketSnippet?.currentMatch

    const currentParticipants = currentMatch?.participants ?? []
    const previousTopParticipants = previousTopMatch
        ? previousTopMatch.participants
        : []
    const previousBottomParticipants = previousBottomMatch
        ? previousBottomMatch.participants
        : []

    const topHighlighted =
        currentParticipants.some((p) => p.id === hoveredPartyId) &&
        previousTopParticipants.some((p) => p.id === hoveredPartyId)
    const bottomHighlighted =
        currentParticipants.some((p) => p.id === hoveredPartyId) &&
        previousBottomParticipants.some((p) => p.id === hoveredPartyId)
    return { topHighlighted, bottomHighlighted }
}
export default useMatchHighlightContext
