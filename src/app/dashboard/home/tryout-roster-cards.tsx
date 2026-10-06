import { RiCalendarLine } from "@remixicon/react"
import Link from "next/link"
import type { ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    formatEventDate,
    formatEventTime,
    getEventsByType,
    type SeasonConfig
} from "@/lib/site-config"
import { formatTryoutTeamLabel } from "@/lib/tryout-team-names"
import type { TryoutTeamRoster, Week1RosterSlot } from "./load-season-progress"

// "You're in Week N Tryouts" cards: week 1 is by session/court, weeks 2
// and 3 by division team.

function TryoutCardShell({
    week,
    children
}: {
    week: 1 | 2 | 3
    children: ReactNode
}) {
    return (
        <Card className="min-w-[280px] flex-1 border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <RiCalendarLine className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    <CardTitle className="text-lg text-orange-700 dark:text-orange-300">
                        You're in Week {week} Tryouts this Thursday!
                    </CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-orange-700 text-sm dark:text-orange-300">
                    You have been assigned a spot in the Pre-Season Week {week}{" "}
                    tryout.
                </p>
                <div className="space-y-1.5 rounded-md bg-orange-100 p-3 text-sm dark:bg-orange-900">
                    {children}
                </div>
                <p className="text-orange-600 text-sm dark:text-orange-400">
                    Please plan to arrive 10 minutes early.
                </p>
                <Link
                    href={`/dashboard/preseason-week-${week}`}
                    className="inline-flex items-center justify-center rounded-md bg-orange-600 px-4 py-2 font-medium text-sm text-white hover:bg-orange-700"
                >
                    View Full Week {week} Roster
                </Link>
            </CardContent>
        </Card>
    )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex justify-between">
            <span className="text-orange-700 dark:text-orange-300">
                {label}
            </span>
            <span className="font-semibold text-orange-800 dark:text-orange-200">
                {children}
            </span>
        </div>
    )
}

function TryoutDateRow({
    config,
    week
}: {
    config: SeasonConfig
    week: 1 | 2 | 3
}) {
    const event = getEventsByType(config, "tryout")[week - 1]
    if (!event?.eventDate) return null
    return <Row label="Date:">{formatEventDate(event.eventDate)}</Row>
}

export function Week1RosterCard({
    roster,
    config
}: {
    roster: Week1RosterSlot
    config: SeasonConfig
}) {
    const t1Slots = getEventsByType(config, "tryout")[0]?.timeSlots ?? []
    const time =
        roster.sessionNumber === 1
            ? formatEventTime(t1Slots[0]?.startTime ?? "") || "TBD"
            : formatEventTime(t1Slots[1]?.startTime ?? "") || "TBD"
    return (
        <TryoutCardShell week={1}>
            <TryoutDateRow config={config} week={1} />
            <Row label="Session:">
                {roster.sessionNumber === 3
                    ? "Alternate"
                    : `Session ${roster.sessionNumber}`}
            </Row>
            {roster.sessionNumber !== 3 && (
                <Row label="Court:">Court {roster.courtNumber}</Row>
            )}
            <Row label="Time:">{time}</Row>
        </TryoutCardShell>
    )
}

export function TryoutTeamRosterCard({
    week,
    roster,
    config
}: {
    week: 2 | 3
    roster: TryoutTeamRoster
    config: SeasonConfig
}) {
    return (
        <TryoutCardShell week={week}>
            <TryoutDateRow config={config} week={week} />
            <Row label="Time:">{roster.sessionTime}</Row>
            <Row label="Court:">Court {roster.courtNumber}</Row>
            <Row label="Division:">{roster.divisionName}</Row>
            <Row label="Team:">
                Team{" "}
                {formatTryoutTeamLabel(roster.divisionName, roster.teamNumber)}
            </Row>
            {roster.captainName && (
                <Row label="Captain:">{roster.captainName}</Row>
            )}
        </TryoutCardShell>
    )
}
