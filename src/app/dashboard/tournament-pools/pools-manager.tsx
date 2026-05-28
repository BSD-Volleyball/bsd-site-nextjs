"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    addTeamToPool,
    assignTeamToDivision,
    createPool,
    deletePool,
    removeTeamFromPool,
    type TournamentPoolsView
} from "./actions"

interface Props {
    view: TournamentPoolsView
}

export function TournamentPoolsManager({ view }: Props) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)
    const [newPoolName, setNewPoolName] = useState<Record<number, string>>({})

    async function run(p: Promise<{ status: boolean; message?: string }>) {
        setBusy(true)
        const result = await p
        setBusy(false)
        if (!result.status) {
            toast.error(result.message ?? "Failed.")
            return false
        }
        router.refresh()
        return true
    }

    return (
        <div className="space-y-6">
            {view.teamsMissingDivision.length > 0 && (
                <Card className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950">
                    <CardHeader>
                        <CardTitle className="text-base">
                            Teams without a final division
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        {view.teamsMissingDivision.map((t) => (
                            <div
                                key={t.id}
                                className="flex items-center justify-between"
                            >
                                <span>
                                    {t.name} —{" "}
                                    <span className="text-muted-foreground">
                                        preferred: {t.preferred}
                                    </span>
                                </span>
                            </div>
                        ))}
                        <p className="text-muted-foreground text-xs">
                            Use the "Assign to this division" buttons inside
                            each division card below to finalize divisions.
                        </p>
                    </CardContent>
                </Card>
            )}

            {view.divisions.map((d) => (
                <Card key={d.divisionId}>
                    <CardHeader>
                        <CardTitle>
                            {d.divisionName} ({d.teamCount} teams expected)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {d.unassignedTeams.length > 0 && (
                            <div className="rounded-md border border-amber-300 p-3 text-sm">
                                <p className="mb-2 font-medium">
                                    Teams preferring this division (not yet
                                    finalized)
                                </p>
                                {d.unassignedTeams.map((t) => (
                                    <div
                                        key={t.id}
                                        className="flex items-center justify-between"
                                    >
                                        <span>
                                            {t.name} — captain {t.captainName}
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={busy}
                                            onClick={() =>
                                                run(
                                                    assignTeamToDivision(
                                                        t.id,
                                                        d.divisionId
                                                    )
                                                )
                                            }
                                        >
                                            Assign to this division
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="space-y-3">
                            {d.pools.map((p) => (
                                <div
                                    key={p.poolId}
                                    className="rounded-md border p-3"
                                >
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="font-medium">
                                            {p.poolName}{" "}
                                            <span className="text-muted-foreground">
                                                ({p.teams.length} team
                                                {p.teams.length === 1
                                                    ? ""
                                                    : "s"}
                                                )
                                            </span>
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={
                                                busy || p.teams.length > 0
                                            }
                                            onClick={() =>
                                                run(deletePool(p.poolId))
                                            }
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                    <ul className="space-y-1 text-sm">
                                        {p.teams.map((t) => (
                                            <li
                                                key={t.id}
                                                className="flex items-center justify-between"
                                            >
                                                <span>{t.name}</span>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        run(
                                                            removeTeamFromPool(
                                                                p.poolId,
                                                                t.id
                                                            )
                                                        )
                                                    }
                                                >
                                                    Remove
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                    {d.unpooledTeams.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {d.unpooledTeams.map((t) => (
                                                <Button
                                                    key={t.id}
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        run(
                                                            addTeamToPool(
                                                                p.poolId,
                                                                t.id
                                                            )
                                                        )
                                                    }
                                                >
                                                    + {t.name}
                                                </Button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center gap-2">
                            <Input
                                placeholder="New pool name (e.g. Pool A)"
                                value={newPoolName[d.divisionId] ?? ""}
                                onChange={(e) =>
                                    setNewPoolName((prev) => ({
                                        ...prev,
                                        [d.divisionId]: e.target.value
                                    }))
                                }
                            />
                            <Button
                                disabled={busy}
                                onClick={async () => {
                                    const name = newPoolName[d.divisionId] ?? ""
                                    if (!name.trim()) {
                                        toast.error("Name required.")
                                        return
                                    }
                                    const success = await run(
                                        createPool(d.divisionId, name)
                                    )
                                    if (success) {
                                        setNewPoolName((prev) => ({
                                            ...prev,
                                            [d.divisionId]: ""
                                        }))
                                    }
                                }}
                            >
                                Create Pool
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}
