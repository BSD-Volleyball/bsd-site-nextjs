"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    addPlayerToRoster,
    removePlayerFromRoster,
    updatePreferredDivision,
    type CaptainTeamView
} from "./actions"

interface Props {
    view: CaptainTeamView
}

export function CaptainTeamEditor({ view }: Props) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)
    const [division, setDivision] = useState<number>(
        view.team.preferredDivisionId
    )
    const [search, setSearch] = useState("")

    const locked = view.rosterLocked
    const males = view.roster.filter((r) => r.male === true).length
    const nonMales = view.roster.filter((r) => r.male === false).length
    const currentDivision =
        view.divisions.find((d) => d.id === division) ?? view.divisions[0]

    async function handleDivisionChange(newId: number) {
        setDivision(newId)
        setBusy(true)
        const result = await updatePreferredDivision(newId)
        setBusy(false)
        if (!result.status) {
            toast.error(result.message)
            setDivision(view.team.preferredDivisionId)
            return
        }
        toast.success("Preferred division updated.")
        router.refresh()
    }

    async function handleRemove(userId: string) {
        setBusy(true)
        const result = await removePlayerFromRoster(userId)
        setBusy(false)
        if (!result.status) {
            toast.error(result.message)
            return
        }
        toast.success("Player removed.")
        router.refresh()
    }

    async function handleAdd(userId: string) {
        setBusy(true)
        const result = await addPlayerToRoster(userId)
        setBusy(false)
        if (!result.status) {
            toast.error(result.message)
            return
        }
        toast.success("Player added.")
        router.refresh()
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Preferred Division</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <Label htmlFor="div-select">Division</Label>
                    <select
                        id="div-select"
                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        value={division}
                        disabled={locked || busy}
                        onChange={(e) =>
                            handleDivisionChange(Number(e.target.value))
                        }
                    >
                        {view.divisions.map((d) => (
                            <option key={d.id} value={d.id}>
                                {d.name} — up to {d.malePerTeam}M /{" "}
                                {d.nonMalePerTeam}NM
                            </option>
                        ))}
                    </select>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>
                        Roster ({males}M / {nonMales}NM
                        {currentDivision &&
                            ` — cap ${currentDivision.malePerTeam}M / ${currentDivision.nonMalePerTeam}NM`}
                        )
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {view.roster.length === 0 && (
                        <p className="text-muted-foreground text-sm">
                            No players yet.
                        </p>
                    )}
                    {view.roster.map((r) => (
                        <div
                            key={r.userId}
                            className="flex items-center justify-between rounded border p-2 text-sm"
                        >
                            <div>
                                <span className="font-medium">{r.name}</span>
                                <span className="ml-2 text-muted-foreground">
                                    (
                                    {r.male === true
                                        ? "M"
                                        : r.male === false
                                          ? "NM"
                                          : "—"}
                                    )
                                </span>
                                {r.addedByCaptain && !r.waiverAccepted && (
                                    <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-900 text-xs dark:bg-amber-900 dark:text-amber-100">
                                        Waiver pending
                                    </span>
                                )}
                                {r.waiverAccepted && (
                                    <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-green-900 text-xs dark:bg-green-900 dark:text-green-100">
                                        Waiver ✓
                                    </span>
                                )}
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={locked || busy}
                                onClick={() => handleRemove(r.userId)}
                            >
                                Remove
                            </Button>
                        </div>
                    ))}
                </CardContent>
            </Card>

            {!locked && (
                <Card>
                    <CardHeader>
                        <CardTitle>Add Players</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Input
                            placeholder="Search players..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <div className="max-h-72 space-y-1 overflow-y-auto">
                            {(() => {
                                const q = search.trim().toLowerCase()
                                const filtered = q
                                    ? view.eligibleToAdd.filter((u) =>
                                          u.name.toLowerCase().includes(q)
                                      )
                                    : view.eligibleToAdd
                                if (filtered.length === 0) {
                                    return (
                                        <p className="px-2 py-1 text-muted-foreground text-sm">
                                            No matching players.
                                        </p>
                                    )
                                }
                                return filtered.map((u) => (
                                    <div
                                        key={u.id}
                                        className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-muted/50"
                                    >
                                        <span>
                                            {u.name}
                                            <span className="ml-2 text-muted-foreground">
                                                (
                                                {u.male === true
                                                    ? "M"
                                                    : u.male === false
                                                      ? "NM"
                                                      : "—"}
                                                )
                                            </span>
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={busy}
                                            onClick={() => handleAdd(u.id)}
                                        >
                                            Add
                                        </Button>
                                    </div>
                                ))
                            })()}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
