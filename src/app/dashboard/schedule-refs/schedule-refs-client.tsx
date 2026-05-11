"use client"

import { useState, useEffect, useMemo, useCallback, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from "@/components/ui/collapsible"
import { RiArrowDownSLine, RiArrowRightSLine } from "@remixicon/react"
import { toast } from "sonner"
import { getMatchesAndRefsForDate, saveRefAssignments } from "./actions"
import type {
    MatchDate,
    MatchRow,
    EligibleRef,
    MatchesAndRefsData
} from "./actions"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ScheduleRefsClientProps {
    matchDates: MatchDate[]
    initialDate: string | null
    initialData: MatchesAndRefsData | null
}

type RefRole = "primary" | "backup"
type MatchAssignment = { primary: string | null; backup: string | null }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(time: string): string {
    if (!time) return "—"
    const [hours, minutes] = time.split(":").map(Number)
    const period = hours >= 12 ? "PM" : "AM"
    const displayHour = hours % 12 || 12
    return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`
}

function divisionLevelLabel(level: number): string {
    const map: Record<number, string> = {
        1: "AA",
        2: "A",
        3: "ABA",
        4: "ABB",
        5: "BBB",
        6: "BB"
    }
    return map[level] ?? `Level ${level}`
}

function renderTeamCell(
    teamName: string | null,
    sourceLabel: string | null,
    possible: string[]
) {
    if (teamName) return <span>{teamName}</span>
    return (
        <span className="flex flex-col">
            <span className="font-medium italic">{sourceLabel ?? "TBD"}</span>
            {possible.length > 0 && (
                <span className="text-muted-foreground text-xs">
                    Possible: {possible.join(", ")}
                </span>
            )}
        </span>
    )
}

const UNASSIGNED = "__unassigned__"

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScheduleRefsClient({
    matchDates,
    initialDate,
    initialData
}: ScheduleRefsClientProps) {
    const [selectedDate, setSelectedDate] = useState<string>(
        initialDate ?? matchDates[0]?.date ?? ""
    )
    const [matchData, setMatchData] = useState<MatchesAndRefsData | null>(
        initialData
    )
    const [assignments, setAssignments] = useState<
        Record<number, MatchAssignment>
    >({})
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useTransition()
    const [pendingAssignment, setPendingAssignment] = useState<{
        matchId: number
        role: RefRole
        refId: string
        refName: string
    } | null>(null)
    const [refsOpen, setRefsOpen] = useState(false)

    // Initialize assignments from match data
    useEffect(() => {
        if (!matchData) return
        const initial: Record<number, MatchAssignment> = {}
        for (const m of matchData.matches) {
            initial[m.matchId] = {
                primary: m.primaryRefId,
                backup: m.backupRefId
            }
        }
        setAssignments(initial)
    }, [matchData])

    const fetchDateData = useCallback(async (date: string) => {
        setLoading(true)
        const result = await getMatchesAndRefsForDate(date)
        if (result.status) {
            setMatchData(result.data)
        } else {
            toast.error(result.message)
        }
        setLoading(false)
    }, [])

    const handleDateChange = useCallback(
        (date: string) => {
            setSelectedDate(date)
            fetchDateData(date)
        },
        [fetchDateData]
    )

    // Recompute eligible refs locally when assignments change.
    // - Refs already chosen at another match in the same time slot are excluded.
    // - On a given match, the OTHER role's choice is also excluded (can't be both).
    const computedEligible = useMemo(() => {
        if (!matchData) return {}

        const result: Record<
            number,
            { primary: EligibleRef[]; backup: EligibleRef[] }
        > = {}

        // Group matches by time
        const matchesByTime = new Map<string, MatchRow[]>()
        for (const m of matchData.matches) {
            if (!matchesByTime.has(m.time)) {
                matchesByTime.set(m.time, [])
            }
            matchesByTime.get(m.time)!.push(m)
        }

        for (const match of matchData.matches) {
            const baseEligible =
                matchData.eligibleRefsByMatch[match.matchId] ?? []

            const sameTimeMatches = matchesByTime.get(match.time) ?? []
            const assignedAtSameTime = new Set<string>()
            for (const otherMatch of sameTimeMatches) {
                if (otherMatch.matchId === match.matchId) continue
                const a = assignments[otherMatch.matchId]
                if (a?.primary) assignedAtSameTime.add(a.primary)
                if (a?.backup) assignedAtSameTime.add(a.backup)
            }

            const here = assignments[match.matchId]
            const filterForRole = (excludeRefId: string | null) =>
                baseEligible.filter((ref) => {
                    if (assignedAtSameTime.has(ref.userId)) return false
                    if (excludeRefId && ref.userId === excludeRefId)
                        return false
                    return true
                })

            result[match.matchId] = {
                primary: filterForRole(here?.backup ?? null),
                backup: filterForRole(here?.primary ?? null)
            }
        }

        return result
    }, [matchData, assignments])

    const applyAssignment = useCallback(
        (matchId: number, role: RefRole, refId: string | null) => {
            setAssignments((prev) => {
                const current = prev[matchId] ?? {
                    primary: null,
                    backup: null
                }
                return {
                    ...prev,
                    [matchId]: { ...current, [role]: refId }
                }
            })
        },
        []
    )

    const handleRefChange = useCallback(
        (matchId: number, role: RefRole, value: string) => {
            if (value === UNASSIGNED) {
                applyAssignment(matchId, role, null)
                return
            }
            const slots = computedEligible[matchId]
            const list = slots ? slots[role] : []
            const ref = list.find((r) => r.userId === value)
            if (ref?.isUnavailable) {
                setPendingAssignment({
                    matchId,
                    role,
                    refId: value,
                    refName: ref.name
                })
                return
            }
            applyAssignment(matchId, role, value)
        },
        [computedEligible, applyAssignment]
    )

    const confirmUnavailableAssignment = useCallback(() => {
        if (!pendingAssignment) return
        applyAssignment(
            pendingAssignment.matchId,
            pendingAssignment.role,
            pendingAssignment.refId
        )
        setPendingAssignment(null)
    }, [pendingAssignment, applyAssignment])

    const handleSave = useCallback(() => {
        if (!selectedDate) return
        const assignmentList = Object.entries(assignments).map(
            ([matchId, slots]) => ({
                matchId: Number(matchId),
                primaryRefId: slots.primary,
                backupRefId: slots.backup
            })
        )

        setSaving(async () => {
            const result = await saveRefAssignments(
                selectedDate,
                assignmentList
            )
            if (result.status) {
                toast.success("Ref assignments saved")
                await fetchDateData(selectedDate)
            } else {
                toast.error(result.message)
            }
        })
    }, [selectedDate, assignments, fetchDateData])

    const matchesByDivision = useMemo(() => {
        if (!matchData) return []
        const divMap = new Map<
            number,
            {
                divisionId: number
                divisionName: string
                divisionLevel: number
                matches: MatchRow[]
            }
        >()
        for (const m of matchData.matches) {
            if (!divMap.has(m.divisionId)) {
                divMap.set(m.divisionId, {
                    divisionId: m.divisionId,
                    divisionName: m.divisionName,
                    divisionLevel: m.divisionLevel,
                    matches: []
                })
            }
            divMap.get(m.divisionId)!.matches.push(m)
        }
        return [...divMap.values()].sort(
            (a, b) => a.divisionLevel - b.divisionLevel
        )
    }, [matchData])

    const currentDateLabel =
        matchDates.find((d) => d.date === selectedDate)?.label ?? selectedDate

    const scheduleGrid = useMemo(() => {
        if (!matchData) return null

        const times = [...new Set(matchData.matches.map((m) => m.time))].sort()
        const courts = [
            ...new Set(
                matchData.matches
                    .map((m) => m.court)
                    .filter((c): c is number => c != null)
            )
        ].sort((a, b) => a - b)

        if (times.length === 0 || courts.length === 0) return null

        const refNameById = new Map<string, string>()
        for (const ref of matchData.refs) {
            refNameById.set(ref.userId, ref.name)
        }

        const cellMap = new Map<
            string,
            { primary: string | null; backup: string | null }
        >()
        for (const match of matchData.matches) {
            if (match.court == null) continue
            const key = `${match.time}:${match.court}`
            const a = assignments[match.matchId]
            cellMap.set(key, {
                primary: a?.primary
                    ? (refNameById.get(a.primary) ?? a.primary)
                    : null,
                backup: a?.backup
                    ? (refNameById.get(a.backup) ?? a.backup)
                    : null
            })
        }

        return { times, courts, cellMap }
    }, [matchData, assignments])

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Select Match Date</CardTitle>
                </CardHeader>
                <CardContent>
                    {matchDates.length === 0 ? (
                        <p className="text-muted-foreground">
                            No match dates found for this season.
                        </p>
                    ) : (
                        <Select
                            value={selectedDate}
                            onValueChange={handleDateChange}
                        >
                            <SelectTrigger className="w-full max-w-sm">
                                <SelectValue placeholder="Select a date" />
                            </SelectTrigger>
                            <SelectContent>
                                {matchDates.map((d) => (
                                    <SelectItem key={d.date} value={d.date}>
                                        {d.label} — {d.matchCount} match
                                        {d.matchCount !== 1 ? "es" : ""}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </CardContent>
            </Card>

            {loading && (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    Loading…
                </div>
            )}

            {!loading && matchData && (
                <>
                    {matchData.refs.length > 0 && (
                        <Collapsible open={refsOpen} onOpenChange={setRefsOpen}>
                            <Card>
                                <CardHeader className="py-3">
                                    <CollapsibleTrigger asChild>
                                        <button
                                            type="button"
                                            className="flex w-full items-center justify-between text-left"
                                        >
                                            <CardTitle className="text-lg">
                                                Refs — {currentDateLabel}
                                                <span className="ml-2 font-normal text-muted-foreground text-sm">
                                                    ({matchData.refs.length})
                                                </span>
                                            </CardTitle>
                                            {refsOpen ? (
                                                <RiArrowDownSLine className="h-5 w-5 text-muted-foreground" />
                                            ) : (
                                                <RiArrowRightSLine className="h-5 w-5 text-muted-foreground" />
                                            )}
                                        </button>
                                    </CollapsibleTrigger>
                                </CardHeader>
                                <CollapsibleContent>
                                    <CardContent className="pt-0">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b text-left">
                                                        <th className="whitespace-nowrap px-3 py-2 font-medium">
                                                            Name
                                                        </th>
                                                        <th className="whitespace-nowrap px-3 py-2 font-medium">
                                                            Status
                                                        </th>
                                                        <th className="whitespace-nowrap px-3 py-2 font-medium">
                                                            Max Division
                                                        </th>
                                                        <th className="whitespace-nowrap px-3 py-2 font-medium">
                                                            Certified
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {[...matchData.refs]
                                                        .sort(
                                                            (a, b) =>
                                                                a.maxDivisionLevel -
                                                                b.maxDivisionLevel
                                                        )
                                                        .map((ref) => (
                                                            <tr
                                                                key={ref.userId}
                                                                className="border-b last:border-0"
                                                            >
                                                                <td className="px-3 py-2 font-medium">
                                                                    {ref.name}
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    {ref.isUnavailable ? (
                                                                        <Badge variant="destructive">
                                                                            Unavailable
                                                                        </Badge>
                                                                    ) : ref.playingTimeSlot ? (
                                                                        <Badge className="border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200">
                                                                            {
                                                                                ref.playingInfo
                                                                            }
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge className="bg-green-600 text-white hover:bg-green-700">
                                                                            Available
                                                                        </Badge>
                                                                    )}
                                                                </td>
                                                                <td className="whitespace-nowrap px-3 py-2">
                                                                    <Badge variant="outline">
                                                                        Up to{" "}
                                                                        {divisionLevelLabel(
                                                                            ref.maxDivisionLevel
                                                                        )}
                                                                    </Badge>
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    {ref.isCertified ? (
                                                                        <Badge variant="secondary">
                                                                            Certified
                                                                        </Badge>
                                                                    ) : (
                                                                        <span className="text-muted-foreground">
                                                                            —
                                                                        </span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </CardContent>
                                </CollapsibleContent>
                            </Card>
                        </Collapsible>
                    )}

                    {matchData.matches.length === 0 ? (
                        <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                            No matches on this date.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {matchesByDivision.map((division) => (
                                <Card key={division.divisionId}>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-base">
                                            {division.divisionName}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b text-left">
                                                        <th className="whitespace-nowrap px-3 py-2 font-medium">
                                                            Time
                                                        </th>
                                                        <th className="whitespace-nowrap px-3 py-2 font-medium">
                                                            Court
                                                        </th>
                                                        <th className="whitespace-nowrap px-3 py-2 font-medium">
                                                            Match
                                                        </th>
                                                        <th className="whitespace-nowrap px-3 py-2 font-medium">
                                                            Primary Ref
                                                        </th>
                                                        <th className="whitespace-nowrap px-3 py-2 font-medium">
                                                            Backup Ref
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {division.matches.map(
                                                        (match) => {
                                                            const slots =
                                                                computedEligible[
                                                                    match
                                                                        .matchId
                                                                ] ?? {
                                                                    primary: [],
                                                                    backup: []
                                                                }
                                                            const a =
                                                                assignments[
                                                                    match
                                                                        .matchId
                                                                ]
                                                            const primaryId =
                                                                a?.primary ??
                                                                null
                                                            const backupId =
                                                                a?.backup ??
                                                                null
                                                            return (
                                                                <tr
                                                                    key={
                                                                        match.matchId
                                                                    }
                                                                    className="border-b last:border-0"
                                                                >
                                                                    <td className="whitespace-nowrap px-3 py-2">
                                                                        {formatTime(
                                                                            match.time
                                                                        )}
                                                                    </td>
                                                                    <td className="px-3 py-2">
                                                                        {match.court ??
                                                                            "—"}
                                                                    </td>
                                                                    <td className="whitespace-nowrap px-3 py-2">
                                                                        <div className="flex flex-col gap-1">
                                                                            {renderTeamCell(
                                                                                match.homeTeamName,
                                                                                match.homeSourceLabel,
                                                                                match.homePossibleTeams
                                                                            )}
                                                                            <span className="text-muted-foreground text-xs">
                                                                                vs
                                                                            </span>
                                                                            {renderTeamCell(
                                                                                match.awayTeamName,
                                                                                match.awaySourceLabel,
                                                                                match.awayPossibleTeams
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-3 py-2">
                                                                        <RefPicker
                                                                            value={
                                                                                primaryId
                                                                            }
                                                                            eligible={
                                                                                slots.primary
                                                                            }
                                                                            onChange={(
                                                                                v
                                                                            ) =>
                                                                                handleRefChange(
                                                                                    match.matchId,
                                                                                    "primary",
                                                                                    v
                                                                                )
                                                                            }
                                                                        />
                                                                    </td>
                                                                    <td className="px-3 py-2">
                                                                        {match.isPlayoff ? (
                                                                            <RefPicker
                                                                                value={
                                                                                    backupId
                                                                                }
                                                                                eligible={
                                                                                    slots.backup
                                                                                }
                                                                                onChange={(
                                                                                    v
                                                                                ) =>
                                                                                    handleRefChange(
                                                                                        match.matchId,
                                                                                        "backup",
                                                                                        v
                                                                                    )
                                                                                }
                                                                            />
                                                                        ) : (
                                                                            <span className="text-muted-foreground text-xs">
                                                                                —
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            )
                                                        }
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}

                            <div className="flex justify-end pt-2">
                                <Button onClick={handleSave} disabled={saving}>
                                    {saving ? "Saving…" : "Save Assignments"}
                                </Button>
                            </div>

                            {scheduleGrid && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-lg">
                                            Ref Schedule Grid —{" "}
                                            {currentDateLabel}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="overflow-x-auto">
                                            <table className="w-full border-collapse text-sm">
                                                <thead>
                                                    <tr className="bg-muted/50">
                                                        <th className="whitespace-nowrap border px-3 py-2 text-left font-medium">
                                                            Time
                                                        </th>
                                                        {scheduleGrid.courts.map(
                                                            (court) => (
                                                                <th
                                                                    key={court}
                                                                    className="whitespace-nowrap border px-3 py-2 text-center font-medium"
                                                                >
                                                                    Court{" "}
                                                                    {court}
                                                                </th>
                                                            )
                                                        )}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {scheduleGrid.times.map(
                                                        (time) => (
                                                            <tr
                                                                key={time}
                                                                className="even:bg-muted/20"
                                                            >
                                                                <td className="whitespace-nowrap border px-3 py-2 font-medium">
                                                                    {formatTime(
                                                                        time
                                                                    )}
                                                                </td>
                                                                {scheduleGrid.courts.map(
                                                                    (court) => {
                                                                        const cell =
                                                                            scheduleGrid.cellMap.get(
                                                                                `${time}:${court}`
                                                                            )
                                                                        return (
                                                                            <td
                                                                                key={
                                                                                    court
                                                                                }
                                                                                className="border px-3 py-2 text-center"
                                                                            >
                                                                                {cell?.primary ? (
                                                                                    <div className="flex flex-col items-center">
                                                                                        <span className="font-medium">
                                                                                            {
                                                                                                cell.primary
                                                                                            }
                                                                                        </span>
                                                                                        {cell.backup && (
                                                                                            <span className="text-muted-foreground text-xs">
                                                                                                bk:{" "}
                                                                                                {
                                                                                                    cell.backup
                                                                                                }
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                ) : cell?.backup ? (
                                                                                    <span className="text-muted-foreground text-xs">
                                                                                        bk:{" "}
                                                                                        {
                                                                                            cell.backup
                                                                                        }
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="text-muted-foreground">
                                                                                        —
                                                                                    </span>
                                                                                )}
                                                                            </td>
                                                                        )
                                                                    }
                                                                )}
                                                            </tr>
                                                        )
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    )}
                </>
            )}

            <AlertDialog
                open={!!pendingAssignment}
                onOpenChange={(open) => {
                    if (!open) setPendingAssignment(null)
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Schedule unavailable ref?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            <strong>{pendingAssignment?.refName}</strong> has
                            marked themselves as unavailable for this date. Are
                            you sure you want to schedule them for this match?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmUnavailableAssignment}
                        >
                            Schedule Anyway
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

function RefPicker({
    value,
    eligible,
    onChange
}: {
    value: string | null
    eligible: EligibleRef[]
    onChange: (v: string) => void
}) {
    return (
        <Select value={value ?? UNASSIGNED} onValueChange={onChange}>
            <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select ref" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={UNASSIGNED}>— No ref —</SelectItem>
                {eligible.map((ref) => (
                    <SelectItem key={ref.userId} value={ref.userId}>
                        {ref.name}
                        {ref.isUnavailable && (
                            <span className="ml-1 text-destructive text-xs">
                                (unavailable)
                            </span>
                        )}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
