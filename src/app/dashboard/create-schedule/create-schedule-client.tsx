"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { writeRegularSeasonSchedule, writePlayoffSchedule } from "./actions"
import type { DivisionWithTeams } from "./actions"
import {
    SIX_TEAM_ROUNDS,
    SIX_TEAM_ROTATIONS,
    SIX_TEAM_TIMES,
    FOUR_TEAM_WEEKS,
    FOUR_TEAM_TIMES,
    SIX_TEAM_PLAYOFF,
    FOUR_TEAM_PLAYOFF,
    REGULAR_SEASON_WEEKS
} from "./schedule-constants"
import type { PlayoffMatchTemplate } from "./schedule-constants"

interface Props {
    seasonId: number
    seasonLabel: string
    divisions: DivisionWithTeams[]
    seasonDates: string[]
    playoffDates: string[]
}

interface PreviewMatch {
    week: number
    date: string
    time: string
    court: number
    homeLabel: string
    awayLabel: string
}

interface PlayoffPreview {
    matchNum: number
    week: number
    date: string
    time: string
    court: number
    homeLabel: string
    awayLabel: string
    bracket: string
    workLabel: string | null
}

function getTeamLabel(
    teamNumber: number,
    teams: DivisionWithTeams["teams"]
): string {
    const team = teams.find((t) => t.number === teamNumber)
    return team ? `${team.number}. ${team.name}` : `Team ${teamNumber}`
}

function buildRegularSeasonPreview(
    divIndex: number,
    division: DivisionWithTeams,
    seasonDates: string[]
): PreviewMatch[] {
    const court = division.level
    const matches: PreviewMatch[] = []

    if (division.teamCount === 4) {
        for (let week = 0; week < REGULAR_SEASON_WEEKS; week++) {
            const weekMatchups = FOUR_TEAM_WEEKS[week]
            for (let m = 0; m < weekMatchups.length; m++) {
                const [home, away] = weekMatchups[m]
                matches.push({
                    week: week + 1,
                    date: seasonDates[week] || "TBD",
                    time: FOUR_TEAM_TIMES[m] || "",
                    court,
                    homeLabel: getTeamLabel(home, division.teams),
                    awayLabel: getTeamLabel(away, division.teams)
                })
            }
        }
    } else {
        const rotation = SIX_TEAM_ROTATIONS[divIndex] || SIX_TEAM_ROTATIONS[0]
        for (let week = 0; week < REGULAR_SEASON_WEEKS; week++) {
            const roundIdx = rotation[week]
            const round = SIX_TEAM_ROUNDS[roundIdx]
            for (let m = 0; m < round.length; m++) {
                const [home, away] = round[m]
                matches.push({
                    week: week + 1,
                    date: seasonDates[week] || "TBD",
                    time: SIX_TEAM_TIMES[m] || "",
                    court,
                    homeLabel: getTeamLabel(home, division.teams),
                    awayLabel: getTeamLabel(away, division.teams)
                })
            }
        }
    }

    return matches
}

function getSecondCourt(primaryCourt: number): number {
    return primaryCourt === 1 ? 2 : 1
}

function buildPlayoffPreview(
    division: DivisionWithTeams,
    playoffDates: string[]
): PlayoffPreview[] {
    const court = division.level
    const template: PlayoffMatchTemplate[] =
        division.teamCount === 4 ? FOUR_TEAM_PLAYOFF : SIX_TEAM_PLAYOFF

    return template.map((pm) => ({
        matchNum: pm.matchNum,
        week: pm.week,
        date:
            pm.week <= playoffDates.length ? playoffDates[pm.week - 1] : "TBD",
        time: pm.time,
        court: pm.useSecondCourt ? getSecondCourt(court) : court,
        homeLabel: pm.homeSeed,
        awayLabel: pm.awaySeed,
        bracket: pm.bracket,
        workLabel: pm.workTeam
    }))
}

function bracketLabel(bracket: string): string {
    switch (bracket) {
        case "winners":
            return "Winners"
        case "losers":
            return "Losers"
        case "championship":
            return "Championship"
        default:
            return bracket
    }
}

export function CreateScheduleClient({
    seasonId,
    seasonLabel,
    divisions,
    seasonDates,
    playoffDates
}: Props) {
    const router = useRouter()
    const [regularStatus, setRegularStatus] = useState<{
        type: "success" | "error"
        message: string
    } | null>(null)
    const [playoffStatus, setPlayoffStatus] = useState<{
        type: "success" | "error"
        message: string
    } | null>(null)
    const [regularLoading, setRegularLoading] = useState(false)
    const [playoffLoading, setPlayoffLoading] = useState(false)

    const hasTeams = divisions.some((d) => d.teams.length > 0)
    const incompleteDivisions = divisions.filter(
        (d) => d.teams.length !== d.teamCount
    )
    const allTeamsReady = incompleteDivisions.length === 0

    async function handleWriteRegularSeason() {
        setRegularLoading(true)
        setRegularStatus(null)
        try {
            const result = await writeRegularSeasonSchedule(seasonId)
            setRegularStatus({
                type: result.status ? "success" : "error",
                message: result.message
            })
            if (result.status) {
                router.refresh()
            }
        } catch {
            setRegularStatus({
                type: "error",
                message: "An unexpected error occurred."
            })
        } finally {
            setRegularLoading(false)
        }
    }

    async function handleWritePlayoffSchedule() {
        setPlayoffLoading(true)
        setPlayoffStatus(null)
        try {
            const result = await writePlayoffSchedule(seasonId)
            setPlayoffStatus({
                type: result.status ? "success" : "error",
                message: result.message
            })
            if (result.status) {
                router.refresh()
            }
        } catch {
            setPlayoffStatus({
                type: "error",
                message: "An unexpected error occurred."
            })
        } finally {
            setPlayoffLoading(false)
        }
    }

    return (
        <div className="space-y-10">
            {!hasTeams && (
                <div className="rounded-md bg-yellow-50 p-4 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
                    No teams found for {seasonLabel}. Create teams before
                    generating schedules.
                </div>
            )}

            {hasTeams && !allTeamsReady && (
                <div className="rounded-md bg-yellow-50 p-4 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
                    <p className="font-semibold">
                        Some divisions don&apos;t have all teams created yet.
                        Schedule generation may be incomplete.
                    </p>
                    <ul className="mt-2 list-inside list-disc text-sm">
                        {incompleteDivisions.map((d) => (
                            <li key={d.divisionId}>
                                {d.divisionName}: {d.teams.length} of{" "}
                                {d.teamCount} teams created
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Regular Season Section */}
            <section>
                <h2 className="mb-4 font-bold text-xl">
                    Regular Season Schedule
                </h2>
                <p className="mb-6 text-muted-foreground text-sm">
                    6 weeks of round-robin play. Each team plays every other
                    team, with matchups staggered across divisions for balanced
                    court usage.
                </p>

                {divisions.map((div, divIndex) => {
                    const preview = buildRegularSeasonPreview(
                        divIndex,
                        div,
                        seasonDates
                    )
                    const weekGroups = new Map<number, PreviewMatch[]>()
                    for (const m of preview) {
                        if (!weekGroups.has(m.week)) {
                            weekGroups.set(m.week, [])
                        }
                        weekGroups.get(m.week)!.push(m)
                    }

                    return (
                        <div key={div.divisionId} className="mb-8">
                            <h3 className="mb-2 font-semibold text-lg">
                                {div.divisionName}
                                <span className="ml-2 font-normal text-muted-foreground text-sm">
                                    ({div.teamCount} teams, Court {div.level})
                                </span>
                            </h3>
                            {div.teams.length === 0 ? (
                                <p className="text-muted-foreground text-sm italic">
                                    No teams created yet.
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-left">
                                                <th className="px-3 py-2">
                                                    Week
                                                </th>
                                                <th className="px-3 py-2">
                                                    Date
                                                </th>
                                                <th className="px-3 py-2">
                                                    Time
                                                </th>
                                                <th className="px-3 py-2">
                                                    Court
                                                </th>
                                                <th className="px-3 py-2">
                                                    Home
                                                </th>
                                                <th className="px-3 py-2">
                                                    vs
                                                </th>
                                                <th className="px-3 py-2">
                                                    Away
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Array.from(
                                                weekGroups.entries()
                                            ).map(([week, matches]) =>
                                                matches.map((m, mIdx) => (
                                                    <tr
                                                        key={`${week}-${mIdx}`}
                                                        className={`border-b ${mIdx === 0 ? "border-t-2 border-t-muted" : ""}`}
                                                    >
                                                        <td className="px-3 py-1.5">
                                                            {mIdx === 0
                                                                ? week
                                                                : ""}
                                                        </td>
                                                        <td className="px-3 py-1.5">
                                                            {mIdx === 0
                                                                ? m.date
                                                                : ""}
                                                        </td>
                                                        <td className="px-3 py-1.5">
                                                            {m.time}
                                                        </td>
                                                        <td className="px-3 py-1.5">
                                                            {m.court}
                                                        </td>
                                                        <td className="px-3 py-1.5">
                                                            {m.homeLabel}
                                                        </td>
                                                        <td className="px-3 py-1.5 text-muted-foreground">
                                                            vs
                                                        </td>
                                                        <td className="px-3 py-1.5">
                                                            {m.awayLabel}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )
                })}

                {regularStatus && (
                    <div
                        className={`rounded-md p-4 ${
                            regularStatus.type === "success"
                                ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                                : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                        }`}
                    >
                        {regularStatus.message}
                    </div>
                )}

                <Button
                    onClick={handleWriteRegularSeason}
                    disabled={regularLoading || !hasTeams || !allTeamsReady}
                    className="mt-4"
                >
                    {regularLoading
                        ? "Writing Schedule..."
                        : "Write Regular Season Schedule to Database"}
                </Button>
            </section>

            <hr className="border-muted" />

            {/* Playoffs Section */}
            <section>
                <h2 className="mb-4 font-bold text-xl">Playoff Schedule</h2>
                <p className="mb-6 text-muted-foreground text-sm">
                    3 weeks of double-elimination playoffs. Team placements are
                    determined by regular season standings (seeds). Actual team
                    assignments are resolved when results are entered.
                </p>

                {divisions.map((div) => {
                    const preview = buildPlayoffPreview(div, playoffDates)
                    const weekGroups = new Map<number, PlayoffPreview[]>()
                    for (const m of preview) {
                        if (!weekGroups.has(m.week)) {
                            weekGroups.set(m.week, [])
                        }
                        weekGroups.get(m.week)!.push(m)
                    }

                    return (
                        <div key={div.divisionId} className="mb-8">
                            <h3 className="mb-2 font-semibold text-lg">
                                {div.divisionName}
                                <span className="ml-2 font-normal text-muted-foreground text-sm">
                                    ({div.teamCount} teams,{" "}
                                    {div.teamCount === 4
                                        ? "7 matches"
                                        : "11 matches"}
                                    , Court {div.level})
                                </span>
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-left">
                                            <th className="px-3 py-2">Week</th>
                                            <th className="px-3 py-2">Date</th>
                                            <th className="px-3 py-2">#</th>
                                            <th className="px-3 py-2">Time</th>
                                            <th className="px-3 py-2">Court</th>
                                            <th className="px-3 py-2">Home</th>
                                            <th className="px-3 py-2">vs</th>
                                            <th className="px-3 py-2">Away</th>
                                            <th className="px-3 py-2">
                                                Bracket
                                            </th>
                                            <th className="px-3 py-2">Work</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from(weekGroups.entries()).map(
                                            ([week, matches]) =>
                                                matches.map((m, mIdx) => (
                                                    <tr
                                                        key={`${week}-${mIdx}`}
                                                        className={`border-b ${mIdx === 0 ? "border-t-2 border-t-muted" : ""}`}
                                                    >
                                                        <td className="px-3 py-1.5">
                                                            {mIdx === 0
                                                                ? week
                                                                : ""}
                                                        </td>
                                                        <td className="px-3 py-1.5">
                                                            {mIdx === 0
                                                                ? m.date
                                                                : ""}
                                                        </td>
                                                        <td className="px-3 py-1.5 font-mono">
                                                            {m.matchNum}
                                                        </td>
                                                        <td className="px-3 py-1.5">
                                                            {m.time}
                                                        </td>
                                                        <td className="px-3 py-1.5">
                                                            {m.court}
                                                        </td>
                                                        <td className="px-3 py-1.5 font-mono">
                                                            {m.homeLabel}
                                                        </td>
                                                        <td className="px-3 py-1.5 text-muted-foreground">
                                                            vs
                                                        </td>
                                                        <td className="px-3 py-1.5 font-mono">
                                                            {m.awayLabel}
                                                        </td>
                                                        <td className="px-3 py-1.5">
                                                            <span
                                                                className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                                                                    m.bracket ===
                                                                    "winners"
                                                                        ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
                                                                        : m.bracket ===
                                                                            "losers"
                                                                          ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200"
                                                                          : "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200"
                                                                }`}
                                                            >
                                                                {bracketLabel(
                                                                    m.bracket
                                                                )}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-1.5 font-mono text-muted-foreground">
                                                            {m.workLabel || "—"}
                                                        </td>
                                                    </tr>
                                                ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )
                })}

                {playoffStatus && (
                    <div
                        className={`rounded-md p-4 ${
                            playoffStatus.type === "success"
                                ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                                : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                        }`}
                    >
                        {playoffStatus.message}
                    </div>
                )}

                <Button
                    onClick={handleWritePlayoffSchedule}
                    disabled={playoffLoading || !hasTeams || !allTeamsReady}
                    className="mt-4"
                >
                    {playoffLoading
                        ? "Writing Playoff Schedule..."
                        : "Write Playoff Schedule to Database"}
                </Button>
            </section>
        </div>
    )
}
