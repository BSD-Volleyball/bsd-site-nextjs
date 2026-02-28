"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { saveDivisionSelections } from "./actions"
import type {
    ActiveDivision,
    DivisionPlayerCounts,
    ExistingDivisionConfig,
    GenderSplit
} from "./actions"

interface DivisionState {
    divisionId: number
    enabled: boolean
    teams: number
    genderSplit: GenderSplit
    coaches: boolean
}

function parseSplit(split: GenderSplit): {
    malesPer: number
    nonMalesPer: number
} {
    const [m, f] = split.split("-").map(Number)
    return { malesPer: m, nonMalesPer: f }
}

// Generates priority order indices for gender split reductions.
// For n enabled divisions sorted ascending by level, returns indices ordered:
// highest, lowest, 2nd highest, 2nd lowest, 3rd highest, 3rd lowest, ...
function buildPriorityOrder(n: number): number[] {
    const order: number[] = []
    let high = n - 1
    let low = 0
    while (high > low) {
        order.push(high)
        order.push(low)
        high--
        low++
    }
    if (high === low) {
        order.push(high)
    }
    return order
}

// Computes default division states based on total signup counts.
// allDivisions must be sorted ascending by level (lowest first).
function computeDefaults(
    allDivisions: ActiveDivision[],
    totalMales: number,
    totalNonMales: number,
    highestLevel: number | null
): DivisionState[] {
    const N = allDivisions.length
    if (N === 0) return []

    const total = totalMales + totalNonMales

    // Step 1 — determine which divisions are enabled and their team counts.
    // Indices are into allDivisions (0 = lowest level, N-1 = highest level).
    let disabledIndices: number[]
    let fourTeamIndices: number[]

    if (total >= 272) {
        disabledIndices = []
        fourTeamIndices = [N - 1]
    } else if (total >= 256) {
        disabledIndices = []
        fourTeamIndices = [N - 1, N - 2]
    } else if (total >= 240) {
        disabledIndices = []
        fourTeamIndices = [N - 1, N - 2, 0]
    } else if (total >= 224) {
        disabledIndices = [N - 3]
        fourTeamIndices = [N - 1]
    } else if (total >= 208) {
        disabledIndices = [N - 3]
        fourTeamIndices = [N - 1, 0]
    } else if (total >= 192) {
        disabledIndices = [N - 3]
        fourTeamIndices = [N - 1, 0, 1]
    } else {
        // >= 176 and below all use this tier
        disabledIndices = [N - 3, N - 4]
        fourTeamIndices = [N - 1]
    }

    // Filter out any indices that are out of range for the actual division count
    const disabledSet = new Set(disabledIndices.filter((i) => i >= 0 && i < N))
    const fourTeamSet = new Set(fourTeamIndices.filter((i) => i >= 0 && i < N))

    // Build initial states, all starting at "4-4" for gender split
    const states: DivisionState[] = allDivisions.map((div, i) => ({
        divisionId: div.id,
        enabled: !disabledSet.has(i),
        teams: fourTeamSet.has(i) ? 4 : 6,
        genderSplit: "4-4" as GenderSplit,
        coaches: div.level === highestLevel
    }))

    // Step 2 — determine gender splits.
    // Collect enabled divisions in order (ascending by level), preserving their
    // index into `states` so we can write results back.
    const enabledWithIdx = states
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.enabled)

    const nEnabled = enabledWithIdx.length
    if (nEnabled === 0) return states

    // Priority order for reductions: indices into enabledWithIdx
    const priorityOrder = buildPriorityOrder(nEnabled)

    // splitStep[j]: 0 = "4-4" (4 NM), 1 = "5-3" (3 NM), 2 = "6-2" (2 NM)
    const splitStep = new Array<number>(nEnabled).fill(0)

    // Initial non-male leftover when all enabled divisions are at "4-4"
    let leftover =
        totalNonMales -
        enabledWithIdx.reduce((sum, { s }) => sum + s.teams * 4, 0)

    // Phase 1: give each division at most one step of reduction in priority order.
    // Stopping early is safe because no division gets a second step here.
    if (leftover < 0) {
        for (const j of priorityOrder) {
            if (leftover >= 0) break
            if (splitStep[j] < 2) {
                splitStep[j]++
                // Each step removes one non-male slot per team
                leftover += enabledWithIdx[j].s.teams
            }
        }
    }

    // Phase 2: only reached if phase 1 exhausted all first steps without fixing
    // the deficit. Now give each division at most one more step.
    if (leftover < 0) {
        for (const j of priorityOrder) {
            if (leftover >= 0) break
            if (splitStep[j] < 2) {
                splitStep[j]++
                leftover += enabledWithIdx[j].s.teams
            }
        }
    }

    // Write computed splits back into states
    const splits: GenderSplit[] = ["4-4", "5-3", "6-2"]
    enabledWithIdx.forEach(({ i }, j) => {
        states[i].genderSplit = splits[splitStep[j]]
    })

    return states
}

interface Props {
    seasonId: number
    activeDivisions: ActiveDivision[]
    totalMales: number
    totalNonMales: number
    existingConfig: ExistingDivisionConfig[]
    returningByDivision: DivisionPlayerCounts[]
    evaluatedByDivision: DivisionPlayerCounts[]
}

export function CreateDivisionsClient({
    seasonId,
    activeDivisions,
    totalMales,
    totalNonMales,
    existingConfig,
    returningByDivision,
    evaluatedByDivision
}: Props) {
    const returningMap = new Map(
        returningByDivision.map((r) => [r.divisionId, r])
    )
    const evaluatedMap = new Map(
        evaluatedByDivision.map((e) => [e.divisionId, e])
    )
    const router = useRouter()

    const highestLevel =
        activeDivisions.length > 0
            ? Math.max(...activeDivisions.map((d) => d.level))
            : null

    const buildInitialState = (): DivisionState[] => {
        const configMap = new Map(existingConfig.map((c) => [c.divisionId, c]))
        return activeDivisions.map((div) => {
            const saved = configMap.get(div.id)
            if (saved) {
                return {
                    divisionId: div.id,
                    enabled: true,
                    teams: saved.teams,
                    genderSplit: saved.genderSplit as GenderSplit,
                    coaches: saved.coaches
                }
            }
            return {
                divisionId: div.id,
                enabled: false,
                teams: 6,
                genderSplit: "5-3" as GenderSplit,
                coaches: div.level === highestLevel
            }
        })
    }

    const [divStates, setDivStates] =
        useState<DivisionState[]>(buildInitialState)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<{
        text: string
        ok: boolean
    } | null>(null)

    const updateDiv = (divisionId: number, patch: Partial<DivisionState>) => {
        setDivStates((prev) =>
            prev.map((s) =>
                s.divisionId === divisionId ? { ...s, ...patch } : s
            )
        )
    }

    const handleResetToDefaults = () => {
        setMessage(null)
        setDivStates(
            computeDefaults(
                activeDivisions,
                totalMales,
                totalNonMales,
                highestLevel
            )
        )
    }

    const { placedMales, placedNonMales } = useMemo(() => {
        let males = 0
        let nonMales = 0
        for (const s of divStates) {
            if (!s.enabled) continue
            const { malesPer, nonMalesPer } = parseSplit(s.genderSplit)
            males += s.teams * malesPer
            nonMales += s.teams * nonMalesPer
        }
        return { placedMales: males, placedNonMales: nonMales }
    }, [divStates])

    const leftoverMales = totalMales - placedMales
    const leftoverNonMales = totalNonMales - placedNonMales

    const handleSave = async () => {
        setSaving(true)
        setMessage(null)
        try {
            const result = await saveDivisionSelections({
                seasonId,
                selections: divStates
            })
            setMessage({ text: result.message, ok: result.status })
            if (result.status) {
                router.refresh()
            }
        } catch {
            setMessage({
                text: "Unexpected error. Please try again.",
                ok: false
            })
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start gap-6">
                {/* Left: Total counts */}
                <div className="w-40 shrink-0">
                    <div className="space-y-2 rounded-lg border bg-card p-4">
                        <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                            Total Signed Up
                        </p>
                        <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                    Males
                                </span>
                                <span className="font-semibold">
                                    {totalMales}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                    Non-Males
                                </span>
                                <span className="font-semibold">
                                    {totalNonMales}
                                </span>
                            </div>
                            <div className="flex justify-between border-t pt-1">
                                <span className="text-muted-foreground">
                                    Total
                                </span>
                                <span className="font-semibold">
                                    {totalMales + totalNonMales}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Center: Division cards */}
                <div className="flex-1">
                    {activeDivisions.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            No active divisions found.
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-4">
                            {divStates.map((state) => {
                                const div = activeDivisions.find(
                                    (d) => d.id === state.divisionId
                                )
                                if (!div) return null
                                const { malesPer, nonMalesPer } = parseSplit(
                                    state.genderSplit
                                )
                                const divMales = state.enabled
                                    ? state.teams * malesPer
                                    : 0
                                const divNonMales = state.enabled
                                    ? state.teams * nonMalesPer
                                    : 0

                                return (
                                    <div
                                        key={div.id}
                                        className={`w-44 min-w-44 shrink-0 space-y-4 rounded-lg border bg-card p-4 transition-opacity ${
                                            state.enabled
                                                ? "opacity-100"
                                                : "opacity-60"
                                        }`}
                                    >
                                        {/* Header: division name + enable toggle */}
                                        <label className="flex cursor-pointer items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={state.enabled}
                                                onChange={(e) =>
                                                    updateDiv(div.id, {
                                                        enabled:
                                                            e.target.checked
                                                    })
                                                }
                                                className="h-4 w-4 rounded border-gray-300 accent-primary"
                                            />
                                            <span className="font-semibold text-sm">
                                                {div.name}
                                            </span>
                                        </label>

                                        {/* Teams radio */}
                                        <fieldset disabled={!state.enabled}>
                                            <legend className="mb-1.5 font-medium text-muted-foreground text-xs">
                                                Teams
                                            </legend>
                                            <div className="flex gap-3">
                                                {[4, 6].map((n) => (
                                                    <label
                                                        key={n}
                                                        className="flex cursor-pointer items-center gap-1 text-sm"
                                                    >
                                                        <input
                                                            type="radio"
                                                            name={`teams-${div.id}`}
                                                            value={n}
                                                            checked={
                                                                state.teams ===
                                                                n
                                                            }
                                                            onChange={() =>
                                                                updateDiv(
                                                                    div.id,
                                                                    { teams: n }
                                                                )
                                                            }
                                                            className="accent-primary"
                                                        />
                                                        {n}
                                                    </label>
                                                ))}
                                            </div>
                                        </fieldset>

                                        {/* Gender split radio */}
                                        <fieldset disabled={!state.enabled}>
                                            <legend className="mb-1.5 font-medium text-muted-foreground text-xs">
                                                Gender Split (M/NM)
                                            </legend>
                                            <div className="flex flex-col gap-1">
                                                {(
                                                    [
                                                        "6-2",
                                                        "5-3",
                                                        "4-4"
                                                    ] as GenderSplit[]
                                                ).map((split) => (
                                                    <label
                                                        key={split}
                                                        className="flex cursor-pointer items-center gap-1 text-sm"
                                                    >
                                                        <input
                                                            type="radio"
                                                            name={`split-${div.id}`}
                                                            value={split}
                                                            checked={
                                                                state.genderSplit ===
                                                                split
                                                            }
                                                            onChange={() =>
                                                                updateDiv(
                                                                    div.id,
                                                                    {
                                                                        genderSplit:
                                                                            split
                                                                    }
                                                                )
                                                            }
                                                            className="accent-primary"
                                                        />
                                                        {split}
                                                    </label>
                                                ))}
                                            </div>
                                        </fieldset>

                                        {/* Coaches checkbox */}
                                        <label className="flex cursor-pointer items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={state.coaches}
                                                onChange={(e) =>
                                                    updateDiv(div.id, {
                                                        coaches:
                                                            e.target.checked
                                                    })
                                                }
                                                className="h-4 w-4 rounded border-gray-300 accent-primary"
                                            />
                                            <span className="text-sm">
                                                Coaches
                                            </span>
                                        </label>

                                        {/* Per-division placement counts */}
                                        <div className="space-y-1 border-t pt-2 text-xs">
                                            <p className="font-medium text-muted-foreground">
                                                Slots
                                            </p>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">
                                                    Males
                                                </span>
                                                <span className="font-semibold">
                                                    {divMales}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">
                                                    Non-Males
                                                </span>
                                                <span className="font-semibold">
                                                    {divNonMales}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Returning players (last drafted here) */}
                                        {(() => {
                                            const r = returningMap.get(div.id)
                                            return (
                                                <div className="space-y-1 border-t pt-2 text-xs">
                                                    <p className="font-medium text-muted-foreground">
                                                        Returning
                                                    </p>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">
                                                            Males
                                                        </span>
                                                        <span className="font-semibold">
                                                            {r?.males ?? 0}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">
                                                            Non-Males
                                                        </span>
                                                        <span className="font-semibold">
                                                            {r?.nonMales ?? 0}
                                                        </span>
                                                    </div>
                                                </div>
                                            )
                                        })()}

                                        {/* New players evaluated into this division */}
                                        {(() => {
                                            const e = evaluatedMap.get(div.id)
                                            return (
                                                <div className="space-y-1 border-t pt-2 text-xs">
                                                    <p className="font-medium text-muted-foreground">
                                                        Evaluated (New)
                                                    </p>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">
                                                            Males
                                                        </span>
                                                        <span className="font-semibold">
                                                            {e?.males ?? 0}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">
                                                            Non-Males
                                                        </span>
                                                        <span className="font-semibold">
                                                            {e?.nonMales ?? 0}
                                                        </span>
                                                    </div>
                                                </div>
                                            )
                                        })()}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Right: Leftover counts */}
                <div className="w-40 shrink-0">
                    <div className="space-y-2 rounded-lg border bg-card p-4">
                        <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                            Leftover
                        </p>
                        <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                    Males
                                </span>
                                <span
                                    className={`font-semibold ${leftoverMales < 0 ? "text-red-600 dark:text-red-400" : ""}`}
                                >
                                    {leftoverMales}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                    Non-Males
                                </span>
                                <span
                                    className={`font-semibold ${leftoverNonMales < 0 ? "text-red-600 dark:text-red-400" : ""}`}
                                >
                                    {leftoverNonMales}
                                </span>
                            </div>
                            <div className="flex justify-between border-t pt-1">
                                <span className="text-muted-foreground">
                                    Total
                                </span>
                                <span
                                    className={`font-semibold ${leftoverMales + leftoverNonMales < 0 ? "text-red-600 dark:text-red-400" : ""}`}
                                >
                                    {leftoverMales + leftoverNonMales}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Action buttons + feedback */}
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {saving ? "Saving…" : "Save Division Configuration"}
                </button>
                <button
                    type="button"
                    onClick={handleResetToDefaults}
                    disabled={saving}
                    className="rounded-md border px-4 py-2 font-medium text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Reset to Defaults
                </button>
                {message && (
                    <p
                        className={`text-sm ${message.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
                    >
                        {message.text}
                    </p>
                )}
            </div>
        </div>
    )
}
