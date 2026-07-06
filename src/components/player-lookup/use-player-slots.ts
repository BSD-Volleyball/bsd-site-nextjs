import { useReducer, type Dispatch } from "react"

let slotCounter = 0

export interface LookupPlayerItem {
    id: string
    old_id: number | null
    first_name: string
    last_name: string
    preferred_name: string | null
}

export interface PlayerSlot<TDetail> {
    id: string
    open: boolean
    search: string
    selectedPlayerId: string | null
    detail: TDetail | null
    isLoading: boolean
    error: string | null
}

export type SlotAction<TDetail> =
    | { type: "ADD_SLOT" }
    | { type: "REMOVE_SLOT"; slotId: string }
    | { type: "SET_OPEN"; slotId: string; open: boolean }
    | { type: "SET_SEARCH"; slotId: string; search: string }
    | { type: "SELECT_PLAYER"; slotId: string; playerId: string }
    | { type: "LOAD_SUCCESS"; slotId: string; detail: TDetail }
    | { type: "LOAD_ERROR"; slotId: string; error: string }
    | { type: "CLEAR_PLAYER"; slotId: string }

export type SlotDispatch<TDetail> = Dispatch<SlotAction<TDetail>>

function createEmptySlot<TDetail>(): PlayerSlot<TDetail> {
    return {
        id: `slot-${++slotCounter}`,
        open: false,
        search: "",
        selectedPlayerId: null,
        detail: null,
        isLoading: false,
        error: null
    }
}

function slotsReducer<TDetail>(
    state: PlayerSlot<TDetail>[],
    action: SlotAction<TDetail>
): PlayerSlot<TDetail>[] {
    switch (action.type) {
        case "ADD_SLOT":
            return [...state, createEmptySlot<TDetail>()]

        case "REMOVE_SLOT":
            return state.filter((s) => s.id !== action.slotId)

        case "SET_OPEN":
            return state.map((s) =>
                s.id === action.slotId ? { ...s, open: action.open } : s
            )

        case "SET_SEARCH":
            return state.map((s) =>
                s.id === action.slotId ? { ...s, search: action.search } : s
            )

        case "SELECT_PLAYER":
            return state.map((s) =>
                s.id === action.slotId
                    ? {
                          ...s,
                          selectedPlayerId: action.playerId,
                          open: false,
                          search: "",
                          isLoading: true,
                          error: null,
                          detail: null
                      }
                    : s
            )

        case "LOAD_SUCCESS":
            return state.map((s) =>
                s.id === action.slotId
                    ? { ...s, isLoading: false, detail: action.detail }
                    : s
            )

        case "LOAD_ERROR":
            return state.map((s) =>
                s.id === action.slotId
                    ? {
                          ...s,
                          isLoading: false,
                          error: action.error,
                          detail: null
                      }
                    : s
            )

        case "CLEAR_PLAYER":
            return state.map((s) =>
                s.id === action.slotId
                    ? {
                          ...s,
                          selectedPlayerId: null,
                          detail: null,
                          search: "",
                          error: null
                      }
                    : s
            )

        default:
            return state
    }
}

export function usePlayerSlots<TDetail>() {
    const [slots, dispatch] = useReducer(
        slotsReducer<TDetail>,
        undefined,
        () => [createEmptySlot<TDetail>()]
    )
    return { slots, dispatch }
}
