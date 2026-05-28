"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    TOURNAMENT_PHASES,
    TOURNAMENT_PHASE_CONFIG,
    type TournamentPhase
} from "@/lib/tournament-phases"
import { advanceTournamentPhase, revertTournamentPhase } from "./actions"

interface Props {
    tournamentId: number
    label: string
    initialPhase: TournamentPhase
}

export function TournamentPhaseControl({
    tournamentId,
    label,
    initialPhase
}: Props) {
    const router = useRouter()
    const [phase, setPhase] = useState<TournamentPhase>(initialPhase)
    const [loading, setLoading] = useState(false)

    const currentConfig = TOURNAMENT_PHASE_CONFIG[phase]
    const currentIndex = TOURNAMENT_PHASES.indexOf(phase)

    async function handleAdvance(target: TournamentPhase) {
        setLoading(true)
        const result = await advanceTournamentPhase(tournamentId, target)
        if (result.status) {
            setPhase(target)
            toast.success(result.data.message)
            router.refresh()
        } else {
            toast.error(result.message)
        }
        setLoading(false)
    }

    async function handleRevert(target: TournamentPhase) {
        setLoading(true)
        const result = await revertTournamentPhase(tournamentId, target)
        if (result.status) {
            setPhase(target)
            toast.success(result.data.message)
            router.refresh()
        } else {
            toast.error(result.message)
        }
        setLoading(false)
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>{label}</CardTitle>
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

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Phase Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-1">
                        {TOURNAMENT_PHASES.map((p, index) => {
                            const cfg = TOURNAMENT_PHASE_CONFIG[p]
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
                                        {isPast ? "✓" : index + 1}
                                    </div>
                                    <span
                                        className={
                                            isFuture
                                                ? "text-muted-foreground"
                                                : ""
                                        }
                                    >
                                        {cfg.label}
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

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Phase Controls</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {currentConfig.nextPhases.length > 0 && (
                        <div className="space-y-2">
                            <p className="font-medium text-sm">
                                Advance Tournament
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {currentConfig.nextPhases.map((next) => (
                                    <Button
                                        key={next}
                                        onClick={() => handleAdvance(next)}
                                        disabled={loading}
                                    >
                                        {loading
                                            ? "Updating..."
                                            : `Advance to ${TOURNAMENT_PHASE_CONFIG[next].label}`}
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
                                    : `Revert to ${TOURNAMENT_PHASE_CONFIG[currentConfig.previousPhase].label}`}
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
