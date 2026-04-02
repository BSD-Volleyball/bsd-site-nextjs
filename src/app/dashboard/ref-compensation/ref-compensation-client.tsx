"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RiArrowDownSLine, RiArrowUpSLine } from "@remixicon/react"

type MatchWorked = {
    matchId: number
    date: string
    time: string
    court: number | null
    divisionName: string
    homeTeamName: string
    awayTeamName: string
    isPlayoff: boolean
}

type RefSummary = {
    userId: string
    name: string
    email: string
    isCertified: boolean
    ratePerMatch: string
    matchesWorked: MatchWorked[]
    totalMatches: number
    totalPay: string
}

type CompensationData = {
    seasonLabel: string
    certifiedRate: string
    uncertifiedRate: string
    refs: RefSummary[]
    grandTotalPay: string
    grandTotalMatches: number
}

export function RefCompensationClient({ data }: { data: CompensationData }) {
    const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set())

    function toggleRef(userId: string) {
        setExpandedRefs((prev) => {
            const next = new Set(prev)
            if (next.has(userId)) {
                next.delete(userId)
            } else {
                next.add(userId)
            }
            return next
        })
    }

    return (
        <div className="space-y-6">
            {/* Summary card */}
            <Card>
                <CardHeader>
                    <CardTitle>Season Summary</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                        <div>
                            <p className="text-muted-foreground text-sm">
                                Season
                            </p>
                            <p className="font-semibold">{data.seasonLabel}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground text-sm">
                                Certified Rate
                            </p>
                            <p className="font-semibold">
                                ${data.certifiedRate}
                            </p>
                        </div>
                        <div>
                            <p className="text-muted-foreground text-sm">
                                Uncertified Rate
                            </p>
                            <p className="font-semibold">
                                ${data.uncertifiedRate}
                            </p>
                        </div>
                        <div>
                            <p className="text-muted-foreground text-sm">
                                Total Matches
                            </p>
                            <p className="font-semibold">
                                {data.grandTotalMatches}
                            </p>
                        </div>
                        <div>
                            <p className="text-muted-foreground text-sm">
                                Total Pay
                            </p>
                            <p className="font-semibold">
                                ${data.grandTotalPay}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Per-ref sections */}
            {data.refs.length === 0 ? (
                <Card>
                    <CardContent className="py-8 text-center">
                        <p className="text-muted-foreground">
                            No referees registered for this season.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                data.refs.map((ref) => {
                    const isExpanded = expandedRefs.has(ref.userId)
                    return (
                        <Card key={ref.userId}>
                            <CardHeader
                                className="cursor-pointer"
                                onClick={() => toggleRef(ref.userId)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <CardTitle className="text-base">
                                            {ref.name}
                                        </CardTitle>
                                        <Badge
                                            variant={
                                                ref.isCertified
                                                    ? "default"
                                                    : "secondary"
                                            }
                                        >
                                            {ref.isCertified
                                                ? "Certified"
                                                : "Uncertified"}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-muted-foreground text-sm">
                                            {ref.totalMatches}{" "}
                                            {ref.totalMatches === 1
                                                ? "match"
                                                : "matches"}
                                        </span>
                                        <span className="font-semibold">
                                            ${ref.totalPay}
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                toggleRef(ref.userId)
                                            }}
                                        >
                                            {isExpanded ? (
                                                <RiArrowUpSLine className="h-4 w-4" />
                                            ) : (
                                                <RiArrowDownSLine className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            {isExpanded && (
                                <CardContent>
                                    <p className="mb-3 text-muted-foreground text-sm">
                                        {ref.email} &middot; Rate: $
                                        {ref.ratePerMatch}/match
                                    </p>
                                    {ref.matchesWorked.length === 0 ? (
                                        <p className="text-muted-foreground text-sm">
                                            No matches assigned yet.
                                        </p>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b text-left">
                                                        <th className="pr-4 pb-2 font-medium">
                                                            Date
                                                        </th>
                                                        <th className="pr-4 pb-2 font-medium">
                                                            Time
                                                        </th>
                                                        <th className="pr-4 pb-2 font-medium">
                                                            Court
                                                        </th>
                                                        <th className="pr-4 pb-2 font-medium">
                                                            Division
                                                        </th>
                                                        <th className="pr-4 pb-2 font-medium">
                                                            Match
                                                        </th>
                                                        <th className="pb-2 font-medium">
                                                            Rate
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {ref.matchesWorked.map(
                                                        (m) => (
                                                            <tr
                                                                key={m.matchId}
                                                                className="border-b last:border-b-0"
                                                            >
                                                                <td className="py-2 pr-4">
                                                                    {m.date}
                                                                </td>
                                                                <td className="py-2 pr-4">
                                                                    {m.time}
                                                                </td>
                                                                <td className="py-2 pr-4">
                                                                    {m.court ??
                                                                        "—"}
                                                                </td>
                                                                <td className="py-2 pr-4">
                                                                    {
                                                                        m.divisionName
                                                                    }
                                                                </td>
                                                                <td className="py-2 pr-4">
                                                                    {
                                                                        m.homeTeamName
                                                                    }{" "}
                                                                    vs{" "}
                                                                    {
                                                                        m.awayTeamName
                                                                    }
                                                                    {m.isPlayoff && (
                                                                        <Badge
                                                                            variant="outline"
                                                                            className="ml-2"
                                                                        >
                                                                            Playoff
                                                                        </Badge>
                                                                    )}
                                                                </td>
                                                                <td className="py-2">
                                                                    $
                                                                    {
                                                                        ref.ratePerMatch
                                                                    }
                                                                </td>
                                                            </tr>
                                                        )
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </CardContent>
                            )}
                        </Card>
                    )
                })
            )}
        </div>
    )
}
