import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { getReffingScheduleData } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Reffing Schedule"
}

function formatDate(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric"
    })
}

function formatTime(time: string): string {
    const [hours, minutes] = time.split(":").map(Number)
    const period = hours >= 12 ? "PM" : "AM"
    const displayHour = hours % 12 || 12
    return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`
}

export default async function ReffingSchedulePage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const result = await getReffingScheduleData()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Reffing Schedule"
                    description="Your upcoming referee assignments"
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message}
                </div>
            </div>
        )
    }

    const { seasonLabel, matches } = result.data

    return (
        <div className="space-y-6">
            <PageHeader
                title="Reffing Schedule"
                description={`Your upcoming referee assignments for ${seasonLabel}`}
            />

            {matches.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No upcoming matches assigned.
                </div>
            ) : (
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Time</TableHead>
                                <TableHead>Court</TableHead>
                                <TableHead>Division</TableHead>
                                <TableHead>Match</TableHead>
                                <TableHead>Type</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {matches.map((m) => (
                                <TableRow key={m.matchId}>
                                    <TableCell className="whitespace-nowrap">
                                        {m.date ? formatDate(m.date) : "—"}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap">
                                        {m.time ? formatTime(m.time) : "—"}
                                    </TableCell>
                                    <TableCell>{m.court ?? "—"}</TableCell>
                                    <TableCell>{m.divisionName}</TableCell>
                                    <TableCell>
                                        {m.homeTeamName} vs {m.awayTeamName}
                                    </TableCell>
                                    <TableCell>
                                        {m.isPlayoff ? (
                                            <Badge variant="secondary">
                                                Playoff
                                            </Badge>
                                        ) : (
                                            "Regular"
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    )
}
