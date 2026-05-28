"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    placeWaitlistPlayerOnTeam,
    type PlacementTarget,
    type WaitlistEntry
} from "./actions"

interface Props {
    tournamentName: string
    waitlist: WaitlistEntry[]
    placementTargets: PlacementTarget[]
}

export function TournamentWaitlistTable({
    tournamentName,
    waitlist,
    placementTargets
}: Props) {
    const router = useRouter()
    const [busy, setBusy] = useState<number | null>(null)
    const [selection, setSelection] = useState<Record<number, number>>({})

    async function handlePlace(waitlistId: number) {
        const teamId = selection[waitlistId]
        if (!teamId) {
            toast.error("Pick a team first.")
            return
        }
        setBusy(waitlistId)
        const result = await placeWaitlistPlayerOnTeam(waitlistId, teamId)
        setBusy(null)
        if (!result.status) {
            toast.error(result.message)
            return
        }
        toast.success("Player placed.")
        router.refresh()
    }

    if (waitlist.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{tournamentName}</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                        No one on the waitlist yet.
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>{tournamentName} — Waitlist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {waitlist.map((w) => {
                    const eligibleTeams = placementTargets.filter((p) =>
                        w.male === true
                            ? p.malesRemaining > 0
                            : w.male === false
                              ? p.nonMalesRemaining > 0
                              : true
                    )
                    return (
                        <div
                            key={w.waitlistId}
                            className="flex flex-wrap items-center gap-2 rounded border p-3 text-sm"
                        >
                            <div className="min-w-[200px]">
                                <div className="font-medium">{w.name}</div>
                                <div className="text-muted-foreground text-xs">
                                    {w.email} —{" "}
                                    {w.male === true
                                        ? "Male"
                                        : w.male === false
                                          ? "Non-Male"
                                          : "—"}
                                </div>
                            </div>
                            <select
                                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                                value={selection[w.waitlistId] ?? ""}
                                onChange={(e) =>
                                    setSelection((prev) => ({
                                        ...prev,
                                        [w.waitlistId]: Number(e.target.value)
                                    }))
                                }
                            >
                                <option value="">Pick a team…</option>
                                {eligibleTeams.map((t) => (
                                    <option key={t.teamId} value={t.teamId}>
                                        {t.teamName} ({t.divisionName}) —{" "}
                                        {t.malesRemaining}M /{" "}
                                        {t.nonMalesRemaining}NM open
                                    </option>
                                ))}
                            </select>
                            <Button
                                size="sm"
                                disabled={busy === w.waitlistId}
                                onClick={() => handlePlace(w.waitlistId)}
                            >
                                {busy === w.waitlistId ? "Placing..." : "Place"}
                            </Button>
                        </div>
                    )
                })}
            </CardContent>
        </Card>
    )
}
