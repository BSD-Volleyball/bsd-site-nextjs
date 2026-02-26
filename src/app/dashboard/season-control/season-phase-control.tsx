"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    SEASON_PHASES,
    PHASE_CONFIG,
    type SeasonPhase
} from "@/lib/season-phases"
import { advanceSeasonPhase, revertSeasonPhase } from "./actions"

interface SeasonPhaseControlProps {
    seasonId: number
    seasonLabel: string
    initialPhase: SeasonPhase
}

export function SeasonPhaseControl({
    seasonId,
    seasonLabel,
    initialPhase
}: SeasonPhaseControlProps) {
    const router = useRouter()
    const [phase, setPhase] = useState<SeasonPhase>(initialPhase)
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<{
        text: string
        isError: boolean
    } | null>(null)

    const currentConfig = PHASE_CONFIG[phase]
    const currentIndex = SEASON_PHASES.indexOf(phase)

    async function handleAdvance(targetPhase: SeasonPhase) {
        setLoading(true)
        setMessage(null)

        const result = await advanceSeasonPhase(seasonId, targetPhase)

        if (result.status) {
            setPhase(targetPhase)
            setMessage({ text: result.message, isError: false })
            router.refresh()
        } else {
            setMessage({ text: result.message, isError: true })
        }

        setLoading(false)
    }

    async function handleRevert(targetPhase: SeasonPhase) {
        setLoading(true)
        setMessage(null)

        const result = await revertSeasonPhase(seasonId, targetPhase)

        if (result.status) {
            setPhase(targetPhase)
            setMessage({ text: result.message, isError: false })
            router.refresh()
        } else {
            setMessage({ text: result.message, isError: true })
        }

        setLoading(false)
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>{seasonLabel} Season</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                        <span className="text-muted-foreground text-sm">
                            Current Phase:
                        </span>
                        <span className="rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground text-sm">
                            {currentConfig.label}
                        </span>
                    </div>
                    <p className="text-muted-foreground text-sm">
                        {currentConfig.description}
                    </p>
                    <div className="rounded-lg bg-muted p-3">
                        <p className="font-medium text-sm">Admin Hint</p>
                        <p className="text-muted-foreground text-sm">
                            {currentConfig.adminHint}
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Phase Timeline */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Phase Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-1">
                        {SEASON_PHASES.map((p, index) => {
                            const config = PHASE_CONFIG[p]
                            const isCurrent = p === phase
                            const isPast = index < currentIndex
                            const isFuture = index > currentIndex

                            return (
                                <div
                                    key={p}
                                    className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                                        isCurrent
                                            ? "bg-primary/10 font-medium"
                                            : ""
                                    }`}
                                >
                                    <div
                                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                                            isCurrent
                                                ? "bg-primary text-primary-foreground"
                                                : isPast
                                                  ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                                  : "bg-muted text-muted-foreground"
                                        }`}
                                    >
                                        {isPast ? "\u2713" : index + 1}
                                    </div>
                                    <span
                                        className={
                                            isFuture
                                                ? "text-muted-foreground"
                                                : ""
                                        }
                                    >
                                        {config.label}
                                    </span>
                                    {isCurrent && (
                                        <span className="ml-auto text-muted-foreground text-xs">
                                            Current
                                        </span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Advance / Revert Controls */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Phase Controls</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {message && (
                        <div
                            className={`rounded-lg p-3 text-sm ${
                                message.isError
                                    ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                                    : "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                            }`}
                        >
                            {message.text}
                        </div>
                    )}

                    {currentConfig.nextPhases.length > 0 && (
                        <div className="space-y-2">
                            <p className="font-medium text-sm">
                                Advance Season
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {currentConfig.nextPhases.map((nextPhase) => (
                                    <Button
                                        key={nextPhase}
                                        onClick={() => handleAdvance(nextPhase)}
                                        disabled={loading}
                                    >
                                        {loading
                                            ? "Updating..."
                                            : `Advance to ${PHASE_CONFIG[nextPhase].label}`}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    )}

                    {currentConfig.previousPhase && (
                        <div className="space-y-2 border-t pt-4">
                            <p className="font-medium text-muted-foreground text-sm">
                                Revert Phase
                            </p>
                            <p className="text-muted-foreground text-xs">
                                Only use this if you need to go back to a
                                previous phase.
                            </p>
                            <Button
                                variant="outline"
                                onClick={() =>
                                    handleRevert(currentConfig.previousPhase!)
                                }
                                disabled={loading}
                            >
                                {loading
                                    ? "Updating..."
                                    : `Revert to ${PHASE_CONFIG[currentConfig.previousPhase].label}`}
                            </Button>
                        </div>
                    )}

                    {currentConfig.nextPhases.length === 0 &&
                        !currentConfig.previousPhase && (
                            <p className="text-muted-foreground text-sm">
                                No phase transitions available.
                            </p>
                        )}
                </CardContent>
            </Card>
        </div>
    )
}
