import { jsx as _jsx } from "react/jsx-runtime"
import { createContext, useReducer } from "react"
const initialState = {
    hoveredMatchId: null,
    hoveredPartyId: null,
    hoveredColumnIndex: null,
    hoveredRowIndex: null
}
const store = createContext(initialState)
const { Provider } = store
const reducer = (previousState, action) => {
    switch (action.type) {
        case "SET_HOVERED_PARTYID": {
            const { partyId, columnIndex, rowIndex, matchId } =
                action.payload ?? {}
            return {
                ...previousState,
                hoveredPartyId: partyId,
                hoveredColumnIndex: columnIndex,
                hoveredRowIndex: rowIndex,
                hoveredMatchId: matchId
            }
        }
        default:
            throw new Error(`Unknown action type: ${action.type}`)
    }
}
const MatchContextProvider = ({ children }) => {
    const [state, dispatch] = useReducer(reducer, initialState)
    return _jsx(Provider, { value: { state, dispatch }, children })
}
export { store as matchContext, MatchContextProvider }
//# sourceMappingURL=match-context.js.map
