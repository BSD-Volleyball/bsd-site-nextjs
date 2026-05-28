"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    updateScheduleRow,
    type ScheduleRow,
    type ScheduleView
} from "./actions"

interface Props {
    view: ScheduleView
}

interface RowState {
    court: string
    startTime: string
    workTeamId: string
}

function initialState(row: ScheduleRow): RowState {
    return {
        court: row.court !== null ? String(row.court) : "",
        startTime: row.startTime ?? "",
        workTeamId: row.workTeamId !== null ? String(row.workTeamId) : ""
    }
}

export function ScheduleEditor({ view }: Props) {
    const router = useRouter()
    const [busy, setBusy] = useState<number | null>(null)
    const [rowState, setRowState] = useState<Record<number, RowState>>(() => {
        const init: Record<number, RowState> = {}
        for (const r of view.rows) init[r.matchId] = initialState(r)
        return init
    })

    function updateField(
        matchId: number,
        field: keyof RowState,
        value: string
    ) {
        setRowState((prev) => ({
            ...prev,
            [matchId]: { ...prev[matchId], [field]: value }
        }))
    }

    async function save(row: ScheduleRow) {
        const s = rowState[row.matchId]
        setBusy(row.matchId)
        const result = await updateScheduleRow(row.matchId, {
            court: s.court === "" ? null : Number(s.court),
            startTime: s.startTime === "" ? null : s.startTime,
            workTeamId: s.workTeamId === "" ? null : Number(s.workTeamId)
        })
        setBusy(null)
        if (!result.status) {
            toast.error(result.message)
            return
        }
        toast.success("Saved.")
        router.refresh()
    }

    // Group rows by bracket+pool for readability.
    const grouped = new Map<string, ScheduleRow[]>()
    for (const row of view.rows) {
        const key =
            row.bracket === "pool"
                ? `Pool · ${row.divisionName} · ${row.poolName ?? "—"}`
                : `${row.bracket.toUpperCase()} · ${row.divisionName} · Round ${row.bracketRound ?? "?"}`
        const arr = grouped.get(key) ?? []
        arr.push(row)
        grouped.set(key, arr)
    }

    return (
        <div className="space-y-4">
            {[...grouped.entries()].map(([label, rows]) => (
                <Card key={label}>
                    <CardHeader>
                        <CardTitle className="text-base">{label}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {rows.map((row) => (
                            <div
                                key={row.matchId}
                                className="grid grid-cols-1 gap-2 rounded border p-3 md:grid-cols-6"
                            >
                                <div className="text-sm md:col-span-2">
                                    <div className="font-medium">
                                        {row.homeTeamName ?? "TBD"} vs{" "}
                                        {row.awayTeamName ?? "TBD"}
                                    </div>
                                    <div className="text-muted-foreground text-xs">
                                        Match #{row.matchId}
                                    </div>
                                </div>
                                <Input
                                    type="number"
                                    placeholder="Court"
                                    min={1}
                                    value={rowState[row.matchId]?.court ?? ""}
                                    onChange={(e) =>
                                        updateField(
                                            row.matchId,
                                            "court",
                                            e.target.value
                                        )
                                    }
                                />
                                <Input
                                    type="time"
                                    value={
                                        rowState[row.matchId]?.startTime ?? ""
                                    }
                                    onChange={(e) =>
                                        updateField(
                                            row.matchId,
                                            "startTime",
                                            e.target.value
                                        )
                                    }
                                />
                                <select
                                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                                    value={
                                        rowState[row.matchId]?.workTeamId ?? ""
                                    }
                                    onChange={(e) =>
                                        updateField(
                                            row.matchId,
                                            "workTeamId",
                                            e.target.value
                                        )
                                    }
                                >
                                    <option value="">— Work team —</option>
                                    {row.candidateWorkTeams.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                                <Button
                                    size="sm"
                                    disabled={busy === row.matchId}
                                    onClick={() => save(row)}
                                >
                                    {busy === row.matchId
                                        ? "Saving..."
                                        : "Save"}
                                </Button>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}
