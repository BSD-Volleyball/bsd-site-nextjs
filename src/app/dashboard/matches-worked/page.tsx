import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { getMatchesWorkedData } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Matches Worked"
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

export default async function MatchesWorkedPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const result = await getMatchesWorkedData()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Matches Worked"
                    description="Your referee match history and compensation"
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message}
                </div>
            </div>
        )
    }

    const { seasonLabel, isCertified, ratePerMatch, matches, totalPay } =
        result.data

    return (
        <div className="space-y-6">
            <PageHeader
                title="Matches Worked"
                description={`Your referee match history and compensation for ${seasonLabel}`}
            />

            <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-muted-foreground text-sm font-medium">
                            Matches Worked
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="font-bold text-2xl">{matches.length}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-muted-foreground text-sm font-medium">
                            Rate per Match
                            {isCertified ? " (Certified)" : " (Uncertified)"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="font-bold text-2xl">${ratePerMatch}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-muted-foreground text-sm font-medium">
                            Total Compensation
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="font-bold text-2xl">${totalPay}</p>
                    </CardContent>
                </Card>
            </div>

            {matches.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No matches worked yet.
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
                                <TableHead className="text-right">
                                    Pay
                                </TableHead>
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
                                    <TableCell>
                                        {m.court ?? "—"}
                                    </TableCell>
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
                                    <TableCell className="text-right">
                                        ${m.pay}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        <TableFooter>
                            <TableRow>
                                <TableCell
                                    colSpan={6}
                                    className="font-semibold"
                                >
                                    Total
                                </TableCell>
                                <TableCell className="text-right font-semibold">
                                    ${totalPay}
                                </TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </div>
            )}
        </div>
    )
}
