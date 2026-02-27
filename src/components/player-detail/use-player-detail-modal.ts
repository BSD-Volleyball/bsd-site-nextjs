"use client"

import { useState, useCallback, useEffect } from "react"
import type {
    PlayerDetails,
    PlayerDraftHistory,
    PlayerSignup
} from "@/app/dashboard/player-lookup/actions"
import { getPlayerDetails } from "@/app/dashboard/player-lookup/actions"

interface FetchResult {
    status: boolean
    player: PlayerDetails | null
    draftHistory: PlayerDraftHistory[]
    signupHistory: PlayerSignup[]
    pairPickName?: string | null
    pairReason?: string | null
}

interface UsePlayerDetailModalOptions {
    fetchFn?: (playerId: string) => Promise<FetchResult>
}

export interface PlayerDetailModalState {
    selectedUserId: string | null
    playerDetails: PlayerDetails | null
    draftHistory: PlayerDraftHistory[]
    signupHistory: PlayerSignup[]
    pairPickName: string | null
    pairReason: string | null
    isLoading: boolean
    showImageModal: boolean
    setShowImageModal: (v: boolean) => void
    openPlayerDetail: (playerId: string) => void
    closePlayerDetail: () => void
}

const defaultFetchFn = async (playerId: string): Promise<FetchResult> => {
    const result = await getPlayerDetails(playerId)
    let pairPickName: string | null = null
    let pairReason: string | null = null

    if (result.status && result.signupHistory.length > 0) {
        const mostRecentSignup = result.signupHistory[0]
        pairPickName = mostRecentSignup.pairPickName
        pairReason = mostRecentSignup.pairReason
    }

    return {
        status: result.status,
        player: result.player,
        draftHistory: result.draftHistory,
        signupHistory: result.signupHistory,
        pairPickName,
        pairReason
    }
}

export function usePlayerDetailModal(
    options?: UsePlayerDetailModalOptions
): PlayerDetailModalState {
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const [playerDetails, setPlayerDetails] = useState<PlayerDetails | null>(
        null
    )
    const [draftHistory, setDraftHistory] = useState<PlayerDraftHistory[]>([])
    const [signupHistory, setSignupHistory] = useState<PlayerSignup[]>([])
    const [pairPickName, setPairPickName] = useState<string | null>(null)
    const [pairReason, setPairReason] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [showImageModal, setShowImageModal] = useState(false)

    const fetchFn = options?.fetchFn ?? defaultFetchFn

    const openPlayerDetail = useCallback(
        async (playerId: string) => {
            setSelectedUserId(playerId)
            setIsLoading(true)
            setPlayerDetails(null)
            setDraftHistory([])
            setSignupHistory([])
            setPairPickName(null)
            setPairReason(null)

            const result = await fetchFn(playerId)

            if (result.status && result.player) {
                setPlayerDetails(result.player)
                setDraftHistory(result.draftHistory)
                setSignupHistory(result.signupHistory)
                setPairPickName(result.pairPickName ?? null)
                setPairReason(result.pairReason ?? null)
            }

            setIsLoading(false)
        },
        [fetchFn]
    )

    const closePlayerDetail = useCallback(() => {
        setSelectedUserId(null)
        setPlayerDetails(null)
        setDraftHistory([])
        setSignupHistory([])
        setPairPickName(null)
        setPairReason(null)
    }, [])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (showImageModal) {
                    setShowImageModal(false)
                } else if (selectedUserId) {
                    closePlayerDetail()
                }
            }
        }
        document.addEventListener("keydown", handleKeyDown)
        return () => document.removeEventListener("keydown", handleKeyDown)
    }, [selectedUserId, showImageModal, closePlayerDetail])

    return {
        selectedUserId,
        playerDetails,
        draftHistory,
        signupHistory,
        pairPickName,
        pairReason,
        isLoading,
        showImageModal,
        setShowImageModal,
        openPlayerDetail,
        closePlayerDetail
    }
}
