import { useContext } from "react"
import { matchContext } from "../core/match-context"
const useMatchHighlightContext = ({ bracketSnippet = null }) => {
    const {
        state: { hoveredPartyId }
    } = useContext(matchContext)
    const previousTopMatch = bracketSnippet?.previousTopMatch
    const previousBottomMatch = bracketSnippet?.previousBottomMatch
    const currentMatch = bracketSnippet?.currentMatch

    const currentParticipants = currentMatch?.participants ?? []
    const previousTopParticipants = previousTopMatch?.participants ?? []
    const previousBottomParticipants = previousBottomMatch?.participants ?? []

    const topHighlighted =
        currentParticipants.some((p) => p.id === hoveredPartyId) &&
        previousTopParticipants.some((p) => p.id === hoveredPartyId)
    const bottomHighlighted =
        currentParticipants.some((p) => p.id === hoveredPartyId) &&
        previousBottomParticipants.some((p) => p.id === hoveredPartyId)
    return { topHighlighted, bottomHighlighted }
}
export default useMatchHighlightContext
//# sourceMappingURL=use-match-highlight.js.map
