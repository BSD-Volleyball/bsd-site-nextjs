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
        Record<number, string | null>
    >({})
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useTransition()
    const [pendingAssignment, setPendingAssignment] = useState<{
        matchId: number
        refId: string
        refName: string
    } | null>(null)

    // Initialize assignments from match data
    useEffect(() => {
        if (!matchData) return
        const initial: Record<number, string | null> = {}
        for (const m of matchData.matches) {
            initial[m.matchId] = m.assignedRefId
        }
        setAssignments(initial)
    }, [matchData])

    // Fetch data when date changes (skip if initial data matches)
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

    // Recompute eligible refs locally when assignments change
    // A ref can't be assigned to two matches at the same time
    const computedEligible = useMemo(() => {
        if (!matchData) return {}

        const result: Record<number, EligibleRef[]> = {}

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

            // Find refs assigned to other matches at the same time
            const sameTimeMatches = matchesByTime.get(match.time) ?? []
            const assignedAtSameTime = new Set<string>()
            for (const otherMatch of sameTimeMatches) {
                if (otherMatch.matchId === match.matchId) continue
                const refId = assignments[otherMatch.matchId]
                if (refId) assignedAtSameTime.add(refId)
            }

            result[match.matchId] = baseEligible.filter(
                (ref) => !assignedAtSameTime.has(ref.userId)
            )
        }

        return result
    }, [matchData, assignments])

    const handleRefChange = useCallback(
        (matchId: number, value: string) => {
            if (value === UNASSIGNED) {
                setAssignments((prev) => ({ ...prev, [matchId]: null }))
                return
            }
            // Check if this ref is unavailable
            const eligible = computedEligible[matchId] ?? []
            const ref = eligible.find((r) => r.userId === value)
            if (ref?.isUnavailable) {
                setPendingAssignment({
                    matchId,
                    refId: value,
                    refName: ref.name
                })
                return
            }
            setAssignments((prev) => ({ ...prev, [matchId]: value }))
        },
        [computedEligible]
    )

    const confirmUnavailableAssignment = useCallback(() => {
        if (!pendingAssignment) return
        setAssignments((prev) => ({
            ...prev,
            [pendingAssignment.matchId]: pendingAssignment.refId
        }))
        setPendingAssignment(null)
    }, [pendingAssignment])

    const handleSave = useCallback(() => {
        if (!selectedDate) return
        const assignmentList = Object.entries(assignments).map(
            ([matchId, refereeId]) => ({
                matchId: Number(matchId),
                refereeId
            })
        )

        setSaving(async () => {
            const result = await saveRefAssignments(
                selectedDate,
                assignmentList
            )
            if (result.status) {
                toast.success("Ref assignments saved")
                // Refresh data to get updated server state
                await fetchDateData(selectedDate)
            } else {
                toast.error(result.message)
            }
        })
    }, [selectedDate, assignments, fetchDateData])

    // Group matches by division, sorted by divisionLevel then time
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

    return (
        <div className="space-y-6">
            {/* Date selector */}
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
                    {/* Ref summary table */}
                    {matchData.refs.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">
                                    Refs — {currentDateLabel}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
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
                        </Card>
                    )}

                    {/* Matches grouped by division */}
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
                                                            Assigned Ref
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {division.matches.map(
                                                        (match) => {
                                                            const eligible =
                                                                computedEligible[
                                                                    match
                                                                        .matchId
                                                                ] ?? []
                                                            const currentRefId =
                                                                assignments[
                                                                    match
                                                                        .matchId
                                                                ]
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
                                                                        {
                                                                            match.homeTeamName
                                                                        }{" "}
                                                                        vs{" "}
                                                                        {
                                                                            match.awayTeamName
                                                                        }
                                                                    </td>
                                                                    <td className="px-3 py-2">
                                                                        <Select
                                                                            value={
                                                                                currentRefId ??
                                                                                UNASSIGNED
                                                                            }
                                                                            onValueChange={(
                                                                                v
                                                                            ) =>
                                                                                handleRefChange(
                                                                                    match.matchId,
                                                                                    v
                                                                                )
                                                                            }
                                                                        >
                                                                            <SelectTrigger className="w-[220px]">
                                                                                <SelectValue placeholder="Select ref" />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                <SelectItem
                                                                                    value={
                                                                                        UNASSIGNED
                                                                                    }
                                                                                >
                                                                                    —
                                                                                    No
                                                                                    ref
                                                                                    —
                                                                                </SelectItem>
                                                                                {eligible.map(
                                                                                    (
                                                                                        ref
                                                                                    ) => (
                                                                                        <SelectItem
                                                                                            key={
                                                                                                ref.userId
                                                                                            }
                                                                                            value={
                                                                                                ref.userId
                                                                                            }
                                                                                        >
                                                                                            {
                                                                                                ref.name
                                                                                            }
                                                                                            {ref.isUnavailable && (
                                                                                                <span className="ml-1 text-destructive text-xs">
                                                                                                    (unavailable)
                                                                                                </span>
                                                                                            )}
                                                                                        </SelectItem>
                                                                                    )
                                                                                )}
                                                                            </SelectContent>
                                                                        </Select>
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
                        </div>
                    )}
                </>
            )}

            {/* Confirmation dialog for scheduling an unavailable ref */}
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
