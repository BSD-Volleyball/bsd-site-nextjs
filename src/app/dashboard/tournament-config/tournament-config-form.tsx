"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
    type AvailableDivision,
    createTournament,
    saveTournamentConfig,
    type TournamentConfigData,
    type TournamentDivisionInput,
    type TournamentMetadataInput
} from "./actions"

interface Props {
    initialData: TournamentConfigData | null | undefined
    availableDivisions: AvailableDivision[]
}

interface DivisionState {
    key: string
    id?: number
    // 0 = unselected
    divisionId: number
    teamCount: number
    malePerTeam: number
    nonMalePerTeam: number
    teamsAdvancingPerPool: number
    sortOrder: number
}

function makeKey() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function blankDivision(sortOrder: number): DivisionState {
    return {
        key: makeKey(),
        divisionId: 0,
        teamCount: 4,
        malePerTeam: 3,
        nonMalePerTeam: 3,
        teamsAdvancingPerPool: 2,
        sortOrder
    }
}

export function TournamentConfigForm({
    initialData,
    availableDivisions
}: Props) {
    const router = useRouter()
    const isNew = !initialData
    const [saving, setSaving] = useState(false)

    const [code, setCode] = useState(initialData?.code ?? "")
    const [name, setName] = useState(initialData?.name ?? "")
    const [year, setYear] = useState<number>(
        initialData?.year ?? new Date().getFullYear()
    )
    const [tournamentDate, setTournamentDate] = useState(
        initialData?.tournament_date ?? ""
    )
    const [checkinTime, setCheckinTime] = useState(
        initialData?.checkin_time ?? ""
    )
    const [firstServeTime, setFirstServeTime] = useState(
        initialData?.first_serve_time ?? ""
    )
    const [address, setAddress] = useState(initialData?.address ?? "")
    const [cost, setCost] = useState(initialData?.cost ?? "")
    const [lateCost, setLateCost] = useState(initialData?.late_cost ?? "")
    const [lateDate, setLateDate] = useState(initialData?.late_date ?? "")
    const [registrationCloseDate, setRegistrationCloseDate] = useState(
        initialData?.registration_close_date ?? ""
    )
    const [rosterLockDate, setRosterLockDate] = useState(
        initialData?.roster_lock_date ?? ""
    )
    const [tournamentType, setTournamentType] = useState<
        "coed" | "reverse_coed"
    >((initialData?.tournament_type as "coed" | "reverse_coed") ?? "coed")
    const [poolSize, setPoolSize] = useState<number>(
        initialData?.pool_size ?? 4
    )
    const [eliminationFormat, setEliminationFormat] = useState<
        "single" | "double"
    >((initialData?.elimination_format as "single" | "double") ?? "single")

    const [divisions, setDivisions] = useState<DivisionState[]>(
        initialData?.divisions.map((d) => ({
            key: makeKey(),
            id: d.id,
            divisionId: d.division_id,
            teamCount: d.team_count,
            malePerTeam: d.male_per_team,
            nonMalePerTeam: d.non_male_per_team,
            teamsAdvancingPerPool: d.teams_advancing_per_pool,
            sortOrder: d.sort_order
        })) ?? [blankDivision(0)]
    )

    // Pre-compute division-id → name for quick lookup in the dropdowns.
    const divisionsById = new Map(availableDivisions.map((d) => [d.id, d]))

    function updateDivision(key: string, patch: Partial<DivisionState>) {
        setDivisions((prev) =>
            prev.map((d) => (d.key === key ? { ...d, ...patch } : d))
        )
    }

    function addDivision() {
        setDivisions((prev) => [...prev, blankDivision(prev.length)])
    }

    function removeDivision(key: string) {
        setDivisions((prev) =>
            prev
                .filter((d) => d.key !== key)
                .map((d, i) => ({ ...d, sortOrder: i }))
        )
    }

    function buildMetadata(): TournamentMetadataInput {
        return {
            code: code.trim(),
            year,
            name: name.trim(),
            tournamentDate,
            checkinTime: checkinTime || null,
            firstServeTime: firstServeTime || null,
            address: address || null,
            cost,
            lateCost,
            lateDate: lateDate || null,
            registrationCloseDate: registrationCloseDate || null,
            rosterLockDate: rosterLockDate || null,
            tournamentType,
            poolSize,
            eliminationFormat
        }
    }

    function buildDivisions(): TournamentDivisionInput[] {
        return divisions.map((d, i) => ({
            id: d.id,
            divisionId: d.divisionId,
            teamCount: d.teamCount,
            malePerTeam: d.malePerTeam,
            nonMalePerTeam: d.nonMalePerTeam,
            teamsAdvancingPerPool: d.teamsAdvancingPerPool,
            sortOrder: i
        }))
    }

    async function handleCreate() {
        if (!code.trim() || !name.trim() || !tournamentDate) {
            toast.error("Code, name, and tournament date are required.")
            return
        }
        setSaving(true)
        try {
            const result = await createTournament(buildMetadata())
            if (!result.status) {
                toast.error(result.message)
                return
            }
            // Now save divisions to the new tournament.
            const save = await saveTournamentConfig(
                result.data.tournamentId,
                buildMetadata(),
                buildDivisions()
            )
            if (!save.status) {
                toast.error(save.message)
                return
            }
            toast.success("Tournament created.")
            router.refresh()
        } finally {
            setSaving(false)
        }
    }

    async function handleSave() {
        if (!initialData) return
        if (!code.trim() || !name.trim() || !tournamentDate) {
            toast.error("Code, name, and tournament date are required.")
            return
        }
        setSaving(true)
        try {
            const result = await saveTournamentConfig(
                initialData.tournamentId,
                buildMetadata(),
                buildDivisions()
            )
            if (!result.status) {
                toast.error(result.message)
                return
            }
            toast.success("Tournament configuration saved.")
            router.refresh()
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>
                        {isNew ? "Create Tournament" : "Tournament Details"}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="t-name">Tournament Name</Label>
                            <Input
                                id="t-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="t-code">Code (URL slug)</Label>
                            <Input
                                id="t-code"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="summer-2026-open"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="t-year">Year</Label>
                            <Input
                                id="t-year"
                                type="number"
                                value={year}
                                onChange={(e) =>
                                    setYear(Number(e.target.value) || 0)
                                }
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="t-date">Tournament Date</Label>
                            <Input
                                id="t-date"
                                type="date"
                                value={tournamentDate}
                                onChange={(e) =>
                                    setTournamentDate(e.target.value)
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="t-checkin">Check-in Time</Label>
                            <Input
                                id="t-checkin"
                                type="time"
                                value={checkinTime}
                                onChange={(e) => setCheckinTime(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="t-first">First Serve Time</Label>
                            <Input
                                id="t-first"
                                type="time"
                                value={firstServeTime}
                                onChange={(e) =>
                                    setFirstServeTime(e.target.value)
                                }
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="t-addr">Tournament Address</Label>
                        <Input
                            id="t-addr"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                        />
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="t-cost">Tournament Cost ($)</Label>
                            <Input
                                id="t-cost"
                                inputMode="decimal"
                                value={cost}
                                onChange={(e) => setCost(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="t-late-cost">Late Cost ($)</Label>
                            <Input
                                id="t-late-cost"
                                inputMode="decimal"
                                value={lateCost}
                                onChange={(e) => setLateCost(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="t-late-date">Late Date</Label>
                            <Input
                                id="t-late-date"
                                type="date"
                                value={lateDate}
                                onChange={(e) => setLateDate(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="t-reg-close">
                                Registration Close Date
                            </Label>
                            <Input
                                id="t-reg-close"
                                type="date"
                                value={registrationCloseDate}
                                onChange={(e) =>
                                    setRegistrationCloseDate(e.target.value)
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="t-roster-lock">
                                Roster Lock Date
                            </Label>
                            <Input
                                id="t-roster-lock"
                                type="date"
                                value={rosterLockDate}
                                onChange={(e) =>
                                    setRosterLockDate(e.target.value)
                                }
                            />
                        </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="t-type">Tournament Type</Label>
                            <select
                                id="t-type"
                                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                                value={tournamentType}
                                onChange={(e) =>
                                    setTournamentType(
                                        e.target.value as
                                            | "coed"
                                            | "reverse_coed"
                                    )
                                }
                            >
                                <option value="coed">Coed</option>
                                <option value="reverse_coed">
                                    Reverse Coed
                                </option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="t-pool-size">Pool Size</Label>
                            <Input
                                id="t-pool-size"
                                type="number"
                                min={2}
                                value={poolSize}
                                onChange={(e) =>
                                    setPoolSize(Number(e.target.value) || 0)
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="t-elim">Elimination Format</Label>
                            <select
                                id="t-elim"
                                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                                value={eliminationFormat}
                                onChange={(e) =>
                                    setEliminationFormat(
                                        e.target.value as "single" | "double"
                                    )
                                }
                            >
                                <option value="single">
                                    Single Elimination
                                </option>
                                <option value="double">
                                    Double Elimination
                                </option>
                            </select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Divisions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {divisions.map((d, idx) => (
                        <div
                            key={d.key}
                            className="space-y-3 rounded-md border p-4"
                        >
                            <div className="flex items-center justify-between">
                                <h4 className="font-medium">
                                    {divisionsById.get(d.divisionId)?.name ??
                                        `Division ${idx + 1}`}
                                </h4>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeDivision(d.key)}
                                >
                                    Remove
                                </Button>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Division</Label>
                                    <select
                                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                                        value={d.divisionId}
                                        onChange={(e) =>
                                            updateDivision(d.key, {
                                                divisionId:
                                                    Number(e.target.value) || 0
                                            })
                                        }
                                    >
                                        <option value={0}>
                                            — Pick a division —
                                        </option>
                                        {availableDivisions.map((opt) => {
                                            // Allow keeping this row's own
                                            // current division; otherwise hide
                                            // any division already used in
                                            // another row of this tournament.
                                            const takenElsewhere = divisions
                                                .filter(
                                                    (other) =>
                                                        other.key !== d.key
                                                )
                                                .some(
                                                    (other) =>
                                                        other.divisionId ===
                                                        opt.id
                                                )
                                            if (takenElsewhere) return null
                                            return (
                                                <option
                                                    key={opt.id}
                                                    value={opt.id}
                                                >
                                                    {opt.name}
                                                </option>
                                            )
                                        })}
                                    </select>
                                    {d.divisionId > 0 &&
                                        !divisionsById.has(d.divisionId) && (
                                            <p className="text-amber-600 text-xs">
                                                Stored division is no longer
                                                active — pick a new one.
                                            </p>
                                        )}
                                </div>
                                <div className="space-y-2">
                                    <Label>Number of Teams</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        value={d.teamCount}
                                        onChange={(e) =>
                                            updateDivision(d.key, {
                                                teamCount:
                                                    Number(e.target.value) || 0
                                            })
                                        }
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                <div className="space-y-2">
                                    <Label>Males per Team</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={d.malePerTeam}
                                        onChange={(e) =>
                                            updateDivision(d.key, {
                                                malePerTeam:
                                                    Number(e.target.value) || 0
                                            })
                                        }
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Non-Males per Team</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={d.nonMalePerTeam}
                                        onChange={(e) =>
                                            updateDivision(d.key, {
                                                nonMalePerTeam:
                                                    Number(e.target.value) || 0
                                            })
                                        }
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Teams Advancing per Pool</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        value={d.teamsAdvancingPerPool}
                                        onChange={(e) =>
                                            updateDivision(d.key, {
                                                teamsAdvancingPerPool:
                                                    Number(e.target.value) || 0
                                            })
                                        }
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                    <Button
                        type="button"
                        variant="outline"
                        onClick={addDivision}
                    >
                        Add Division
                    </Button>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
                <Button
                    type="button"
                    onClick={isNew ? handleCreate : handleSave}
                    disabled={saving}
                >
                    {saving
                        ? "Saving..."
                        : isNew
                          ? "Create Tournament"
                          : "Save Changes"}
                </Button>
            </div>
        </div>
    )
}
