import { useReducer } from "react"
import {
    getEmptyPlayerRatingAverages,
    type PlayerRatingAverages,
    type PlayerRatingPrivateNote,
    type PlayerRatingSharedNote,
    type PlayerViewerRating
} from "@/lib/player-ratings-shared"
import type { PlayerDetails, PlayerDraftHistory, PlayerSignup } from "./actions"

let slotCounter = 0

export interface PlayerSlot {
    id: string
    open: boolean
    search: string
    selectedPlayerId: string | null
    playerDetails: PlayerDetails | null
    signupHistory: PlayerSignup[]
    draftHistory: PlayerDraftHistory[]
    ratingAverages: PlayerRatingAverages
    sharedRatingNotes: PlayerRatingSharedNote[]
    privateRatingNotes: PlayerRatingPrivateNote[]
    viewerRating: PlayerViewerRating | null
    isLoading: boolean
    error: string | null
}

export type SlotAction =
    | { type: "ADD_SLOT" }
    | { type: "REMOVE_SLOT"; slotId: string }
    | { type: "SET_OPEN"; slotId: string; open: boolean }
    | { type: "SET_SEARCH"; slotId: string; search: string }
    | { type: "SELECT_PLAYER"; slotId: string; playerId: string }
    | {
          type: "LOAD_SUCCESS"
          slotId: string
          playerDetails: PlayerDetails
          signupHistory: PlayerSignup[]
          draftHistory: PlayerDraftHistory[]
          ratingAverages: PlayerRatingAverages
          sharedRatingNotes: PlayerRatingSharedNote[]
          privateRatingNotes: PlayerRatingPrivateNote[]
          viewerRating: PlayerViewerRating | null
      }
    | { type: "LOAD_ERROR"; slotId: string; error: string }
    | { type: "CLEAR_PLAYER"; slotId: string }

function createEmptySlot(): PlayerSlot {
    return {
        id: `slot-${++slotCounter}`,
        open: false,
        search: "",
        selectedPlayerId: null,
        playerDetails: null,
        signupHistory: [],
        draftHistory: [],
        ratingAverages: getEmptyPlayerRatingAverages(),
        sharedRatingNotes: [],
        privateRatingNotes: [],
        viewerRating: null,
        isLoading: false,
        error: null
    }
}

function slotsReducer(state: PlayerSlot[], action: SlotAction): PlayerSlot[] {
    switch (action.type) {
        case "ADD_SLOT":
            return [...state, createEmptySlot()]

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
                          playerDetails: null,
                          signupHistory: [],
                          draftHistory: [],
                          ratingAverages: getEmptyPlayerRatingAverages(),
                          sharedRatingNotes: [],
                          privateRatingNotes: [],
                          viewerRating: null
                      }
                    : s
            )

        case "LOAD_SUCCESS":
            return state.map((s) =>
                s.id === action.slotId
                    ? {
                          ...s,
                          isLoading: false,
                          playerDetails: action.playerDetails,
                          signupHistory: action.signupHistory,
                          draftHistory: action.draftHistory,
                          ratingAverages: action.ratingAverages,
                          sharedRatingNotes: action.sharedRatingNotes,
                          privateRatingNotes: action.privateRatingNotes,
                          viewerRating: action.viewerRating
                      }
                    : s
            )

        case "LOAD_ERROR":
            return state.map((s) =>
                s.id === action.slotId
                    ? {
                          ...s,
                          isLoading: false,
                          error: action.error,
                          playerDetails: null,
                          signupHistory: [],
                          draftHistory: [],
                          ratingAverages: getEmptyPlayerRatingAverages(),
                          sharedRatingNotes: [],
                          privateRatingNotes: [],
                          viewerRating: null
                      }
                    : s
            )

        case "CLEAR_PLAYER":
            return state.map((s) =>
                s.id === action.slotId
                    ? {
                          ...s,
                          selectedPlayerId: null,
                          playerDetails: null,
                          signupHistory: [],
                          draftHistory: [],
                          ratingAverages: getEmptyPlayerRatingAverages(),
                          sharedRatingNotes: [],
                          privateRatingNotes: [],
                          viewerRating: null,
                          search: "",
                          error: null
                      }
                    : s
            )

        default:
            return state
    }
}

export function usePlayerSlots() {
    const [slots, dispatch] = useReducer(slotsReducer, undefined, () => [
        createEmptySlot()
    ])
    return { slots, dispatch }
}
