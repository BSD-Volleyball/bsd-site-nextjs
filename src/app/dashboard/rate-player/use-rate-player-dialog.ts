"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
    savePlayerRatingNote,
    savePlayerSkillRatings,
    type PlayerRatingValues,
    type RatePlayerEntry,
    type RatingSkill
} from "./actions"
import { getEmptyRating } from "./rate-player-helpers"

export type RatePlayerDialogController = ReturnType<typeof useRatePlayerDialog>

export function useRatePlayerDialog(
    initialRatings: Record<string, PlayerRatingValues>
) {
    const [selectedPlayer, setSelectedPlayer] =
        useState<RatePlayerEntry | null>(null)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [ratingsByPlayer, setRatingsByPlayer] =
        useState<Record<string, PlayerRatingValues>>(initialRatings)
    const [overall, setOverall] = useState(0)
    const [passing, setPassing] = useState(0)
    const [setting, setSetting] = useState(0)
    const [hitting, setHitting] = useState(0)
    const [serving, setServing] = useState(0)
    const [sharedNotes, setSharedNotes] = useState("")
    const [privateNotes, setPrivateNotes] = useState("")
    const [hasPendingSkillSave, setHasPendingSkillSave] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const latestSaveRequestIdRef = useRef(0)

    useEffect(() => {
        if (!selectedPlayer || !hasPendingSkillSave) {
            return
        }

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
        }

        const selectedPlayerId = selectedPlayer.id

        saveTimeoutRef.current = setTimeout(async () => {
            const requestId = latestSaveRequestIdRef.current + 1
            latestSaveRequestIdRef.current = requestId
            setIsSaving(true)

            const result = await savePlayerSkillRatings(selectedPlayerId, {
                overall,
                passing,
                setting,
                hitting,
                serving
            })

            if (latestSaveRequestIdRef.current !== requestId) {
                return
            }

            setIsSaving(false)
            setHasPendingSkillSave(false)
            if (result.status) {
                toast.success(result.message)
            } else {
                toast.error(result.message)
            }
        }, 3000)

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
                saveTimeoutRef.current = null
            }
        }
    }, [
        selectedPlayer,
        hasPendingSkillSave,
        overall,
        passing,
        setting,
        hitting,
        serving
    ])

    useEffect(
        () => () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
            }
        },
        []
    )

    const openRateDialog = (player: RatePlayerEntry) => {
        const rating = ratingsByPlayer[player.id] || getEmptyRating()
        setHasPendingSkillSave(false)
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
            saveTimeoutRef.current = null
        }
        setOverall(rating.overall ?? 0)
        setPassing(rating.passing ?? 0)
        setSetting(rating.setting ?? 0)
        setHitting(rating.hitting ?? 0)
        setServing(rating.serving ?? 0)
        setSharedNotes(rating.sharedNotes || "")
        setPrivateNotes(rating.privateNotes || "")
        setSelectedPlayer(player)
        setIsDialogOpen(true)
    }

    const closeDialog = () => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
            saveTimeoutRef.current = null
        }
        setHasPendingSkillSave(false)
        setIsSaving(false)
        setIsDialogOpen(false)
        setSelectedPlayer(null)
    }

    const updateRatingStateForPlayer = (
        playerId: string,
        update: Partial<PlayerRatingValues>
    ) => {
        setRatingsByPlayer((prev) => {
            const current = prev[playerId] || getEmptyRating()
            return {
                ...prev,
                [playerId]: {
                    ...current,
                    ...update
                }
            }
        })
    }

    const handleSkillChange = (skill: RatingSkill, value: number) => {
        if (!selectedPlayer) {
            return
        }

        if (skill === "overall") {
            setOverall(value)
        } else if (skill === "passing") {
            setPassing(value)
        } else if (skill === "setting") {
            setSetting(value)
        } else if (skill === "hitting") {
            setHitting(value)
        } else {
            setServing(value)
        }

        updateRatingStateForPlayer(selectedPlayer.id, { [skill]: value })
        setHasPendingSkillSave(true)
    }

    const handleSaveAll = async () => {
        if (!selectedPlayer) {
            return
        }

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
            saveTimeoutRef.current = null
        }

        setHasPendingSkillSave(false)
        setIsSaving(true)

        const [skillResult, sharedNoteResult, privateNoteResult] =
            await Promise.all([
                savePlayerSkillRatings(selectedPlayer.id, {
                    overall,
                    passing,
                    setting,
                    hitting,
                    serving
                }),
                savePlayerRatingNote(selectedPlayer.id, "shared", sharedNotes),
                savePlayerRatingNote(selectedPlayer.id, "private", privateNotes)
            ])

        setIsSaving(false)

        if (skillResult.status) {
            updateRatingStateForPlayer(selectedPlayer.id, {
                overall,
                passing,
                setting,
                hitting,
                serving
            })
        }

        if (sharedNoteResult.status) {
            updateRatingStateForPlayer(selectedPlayer.id, {
                sharedNotes: sharedNotes.trim() || null
            })
        }

        if (privateNoteResult.status) {
            updateRatingStateForPlayer(selectedPlayer.id, {
                privateNotes: privateNotes.trim() || null
            })
        }

        if (
            skillResult.status &&
            sharedNoteResult.status &&
            privateNoteResult.status
        ) {
            toast.success("All ratings and notes saved.")
            return
        }

        const errors = [skillResult, sharedNoteResult, privateNoteResult]
            .filter((r) => !r.status)
            .map((r) => r.message)
            .join(" ")
        toast.error(errors)
    }

    return {
        selectedPlayer,
        isDialogOpen,
        setIsDialogOpen,
        overall,
        passing,
        setting,
        hitting,
        serving,
        sharedNotes,
        setSharedNotes,
        privateNotes,
        setPrivateNotes,
        isSaving,
        openRateDialog,
        closeDialog,
        handleSkillChange,
        handleSaveAll
    }
}
