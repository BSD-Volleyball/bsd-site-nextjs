"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { saveTournamentMatchScore, type ScoreEntryRow } from "./actions"

interface Props {
    rows: ScoreEntryRow[]
}

interface RowState {
    homeSet1: string
    awaySet1: string
    homeSet2: string
    awaySet2: string
    homeSet3: string
    awaySet3: string
}

function init(row: ScoreEntryRow): RowState {
    const v = (n: number | null) => (n === null ? "" : String(n))
    return {
        homeSet1: v(row.homeSet1),
        awaySet1: v(row.awaySet1),
        homeSet2: v(row.homeSet2),
        awaySet2: v(row.awaySet2),
        homeSet3: v(row.homeSet3),
        awaySet3: v(row.awaySet3)
    }
}

function num(s: string): number | null {
    if (s === "") return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
}

export function ScoreEntryList({ rows }: Props) {
    const router = useRouter()
    const [state, setState] = useState<Record<number, RowState>>(() => {
        const o: Record<number, RowState> = {}
        for (const r of rows) o[r.matchId] = init(r)
        return o
    })
    const [busy, setBusy] = useState<number | null>(null)

    function update(id: number, field: keyof RowState, v: string) {
        setState((prev) => ({
            ...prev,
            [id]: { ...prev[id], [field]: v }
        }))
    }

    async function save(row: ScoreEntryRow) {
        const s = state[row.matchId]
        setBusy(row.matchId)
        const result = await saveTournamentMatchScore(row.matchId, {
            homeSet1: num(s.homeSet1),
            awaySet1: num(s.awaySet1),
            homeSet2: num(s.homeSet2),
            awaySet2: num(s.awaySet2),
            homeSet3: num(s.homeSet3),
            awaySet3: num(s.awaySet3)
        })
        setBusy(null)
        if (!result.status) {
            toast.error(result.message)
            return
        }
        toast.success("Score saved.")
        router.refresh()
    }

    return (
        <div className="space-y-3">
            {rows.map((row) => {
                const s = state[row.matchId]
                return (
                    <Card key={row.matchId}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">
                                {row.homeTeamName} vs {row.awayTeamName}
                            </CardTitle>
                            <p className="text-muted-foreground text-xs">
                                {row.bracket === "pool" ? "Pool" : row.bracket}{" "}
                                · Court {row.court ?? "—"} ·{" "}
                                {row.startTime ?? "—"}
                            </p>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <ScoreInputRow
                                label={row.homeTeamName}
                                v1={s.homeSet1}
                                v2={s.homeSet2}
                                v3={s.homeSet3}
                                onChange={(field, v) =>
                                    update(row.matchId, field, v)
                                }
                                home
                            />
                            <ScoreInputRow
                                label={row.awayTeamName}
                                v1={s.awaySet1}
                                v2={s.awaySet2}
                                v3={s.awaySet3}
                                onChange={(field, v) =>
                                    update(row.matchId, field, v)
                                }
                            />
                            <div className="flex justify-end">
                                <Button
                                    size="sm"
                                    disabled={busy === row.matchId}
                                    onClick={() => save(row)}
                                >
                                    {busy === row.matchId
                                        ? "Saving..."
                                        : "Save Score"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    )
}

function ScoreInputRow({
    label,
    v1,
    v2,
    v3,
    onChange,
    home
}: {
    label: string
    v1: string
    v2: string
    v3: string
    onChange: (field: keyof RowState, v: string) => void
    home?: boolean
}) {
    const fields: Array<[keyof RowState, string]> = home
        ? [
              ["homeSet1", v1],
              ["homeSet2", v2],
              ["homeSet3", v3]
          ]
        : [
              ["awaySet1", v1],
              ["awaySet2", v2],
              ["awaySet3", v3]
          ]
    return (
        <div className="grid grid-cols-4 items-center gap-2">
            <span className="font-medium text-sm">{label}</span>
            {fields.map(([field, v]) => (
                <Input
                    key={field}
                    type="number"
                    min={0}
                    value={v}
                    onChange={(e) => onChange(field, e.target.value)}
                    placeholder="—"
                />
            ))}
        </div>
    )
}
