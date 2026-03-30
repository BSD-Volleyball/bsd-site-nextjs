"use client"

import { useState, useCallback, useEffect } from "react"
import type {
    PlayerDetails,
    PlayerDraftHistory,
    PlayerSignup
} from "@/app/dashboard/player-lookup/actions"
import { getPlayerDetails } from "@/app/dashboard/player-lookup/actions"
import {
    getEmptyPlayerRatingAverages,
    type PlayerRatingAverages,
    type PlayerRatingPrivateNote,
    type PlayerRatingSharedNote,
    type PlayerViewerRating
} from "@/lib/player-ratings-shared"

interface FetchResult {
    status: boolean
    player: PlayerDetails | null
    draftHistory: PlayerDraftHistory[]
    signupHistory: PlayerSignup[]
    ratingAverages: PlayerRatingAverages
    sharedRatingNotes: PlayerRatingSharedNote[]
    privateRatingNotes: PlayerRatingPrivateNote[]
    viewerRating?: PlayerViewerRating | null
    pairPickName?: string | null
    pairReason?: string | null
    unavailableDates?: string | null
    playoffDates?: string[]
}

interface UsePlayerDetailModalOptions {
    fetchFn?: (playerId: string) => Promise<FetchResult>
}

export interface PlayerDetailModalState {
    selectedUserId: string | null
    playerDetails: PlayerDetails | null
    draftHistory: PlayerDraftHistory[]
    signupHistory: PlayerSignup[]
    ratingAverages: PlayerRatingAverages
    sharedRatingNotes: PlayerRatingSharedNote[]
    privateRatingNotes: PlayerRatingPrivateNote[]
    viewerRating: PlayerViewerRating | null
    pairPickName: string | null
    pairReason: string | null
    unavailableDates: string | null
    playoffDates: string[]
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

    let unavailableDates: string | null = null
    if (result.status && result.signupHistory.length > 0) {
        const mostRecentSignup = result.signupHistory[0]
        pairPickName = mostRecentSignup.pairPickName
        pairReason = mostRecentSignup.pairReason
        unavailableDates = mostRecentSignup.unavailableDates
    }

    return {
        status: result.status,
        player: result.player,
        draftHistory: result.draftHistory,
        signupHistory: result.signupHistory,
        ratingAverages: result.ratingAverages,
        sharedRatingNotes: result.sharedRatingNotes,
        privateRatingNotes: result.privateRatingNotes,
        pairPickName,
        pairReason,
        unavailableDates,
        playoffDates: result.playoffDates ?? []
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
    const [ratingAverages, setRatingAverages] = useState<PlayerRatingAverages>(
        getEmptyPlayerRatingAverages()
    )
    const [sharedRatingNotes, setSharedRatingNotes] = useState<
        PlayerRatingSharedNote[]
    >([])
    const [privateRatingNotes, setPrivateRatingNotes] = useState<
        PlayerRatingPrivateNote[]
    >([])
    const [viewerRating, setViewerRating] = useState<PlayerViewerRating | null>(
        null
    )
    const [pairPickName, setPairPickName] = useState<string | null>(null)
    const [pairReason, setPairReason] = useState<string | null>(null)
    const [unavailableDates, setUnavailableDates] = useState<string | null>(
        null
    )
    const [playoffDates, setPlayoffDates] = useState<string[]>([])
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
            setRatingAverages(getEmptyPlayerRatingAverages())
            setSharedRatingNotes([])
            setPrivateRatingNotes([])
            setViewerRating(null)
            setPairPickName(null)
            setPairReason(null)
            setUnavailableDates(null)
            setPlayoffDates([])

            const result = await fetchFn(playerId)

            if (result.status && result.player) {
                setPlayerDetails(result.player)
                setDraftHistory(result.draftHistory)
                setSignupHistory(result.signupHistory)
                setRatingAverages(result.ratingAverages)
                setSharedRatingNotes(result.sharedRatingNotes)
                setPrivateRatingNotes(result.privateRatingNotes)
                setViewerRating(result.viewerRating ?? null)
                setPairPickName(result.pairPickName ?? null)
                setPairReason(result.pairReason ?? null)
                setUnavailableDates(result.unavailableDates ?? null)
                setPlayoffDates(result.playoffDates ?? [])
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
        setRatingAverages(getEmptyPlayerRatingAverages())
        setSharedRatingNotes([])
        setPrivateRatingNotes([])
        setViewerRating(null)
        setPairPickName(null)
        setPairReason(null)
        setUnavailableDates(null)
        setPlayoffDates([])
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
        ratingAverages,
        sharedRatingNotes,
        privateRatingNotes,
        viewerRating,
        pairPickName,
        pairReason,
        unavailableDates,
        playoffDates,
        isLoading,
        showImageModal,
        setShowImageModal,
        openPlayerDetail,
        closePlayerDetail
    }
}
