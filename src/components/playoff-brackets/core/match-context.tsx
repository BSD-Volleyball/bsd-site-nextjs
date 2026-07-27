import { createContext, useReducer } from "react"
import type { ReactNode } from "react"
import type {
    HoveredPartyPayload,
    MatchContextAction,
    MatchContextValue,
    MatchHighlightState
} from "../types"

const initialState: MatchHighlightState = {
    hoveredMatchId: null,
    hoveredPartyId: null,
    hoveredColumnIndex: null,
    hoveredRowIndex: null
}

// The default value is only observable when a consumer renders outside
// MatchContextProvider, which never happens inside the bracket tree.
const store = createContext<MatchContextValue>({
    state: initialState,
    dispatch: () => undefined
})
const { Provider } = store

const reducer = (
    previousState: MatchHighlightState,
    action: MatchContextAction
): MatchHighlightState => {
    switch (action.type) {
        case "SET_HOVERED_PARTYID": {
            const {
                partyId,
                columnIndex,
                rowIndex,
                matchId
            }: Partial<HoveredPartyPayload> = action.payload ?? {}
            return {
                ...previousState,
                hoveredPartyId: partyId,
                hoveredColumnIndex: columnIndex,
                hoveredRowIndex: rowIndex,
                hoveredMatchId: matchId
            }
        }
        default: {
            const unknownAction: { type: string } = action
            throw new Error(`Unknown action type: ${unknownAction.type}`)
        }
    }
}

const MatchContextProvider = ({ children }: { children?: ReactNode }) => {
    const [state, dispatch] = useReducer(reducer, initialState)
    return <Provider value={{ state, dispatch }}>{children}</Provider>
}

export { store as matchContext, MatchContextProvider }
