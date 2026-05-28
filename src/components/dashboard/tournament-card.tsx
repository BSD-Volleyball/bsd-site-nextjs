import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RiTrophyLine } from "@remixicon/react"
import type { TournamentDashboardCardData } from "@/lib/tournament-dashboard"

interface Props {
    data: TournamentDashboardCardData
}

function fmtTime(t: string | null): string {
    if (!t) return "TBD"
    const [hStr, m] = t.split(":")
    const h = parseInt(hStr, 10)
    const period = h >= 12 ? "PM" : "AM"
    const h12 = ((h + 11) % 12) + 1
    return `${h12}:${m} ${period}`
}

export function TournamentDashboardCard({ data }: Props) {
    // On a team — show team + (if schedule available) next match + next work.
    if (data.team) {
        return (
            <Card className="min-w-[280px] flex-1 border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950">
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                        <RiTrophyLine className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        <CardTitle className="text-indigo-700 text-lg dark:text-indigo-300">
                            {data.tournamentName}
                        </CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <p>
                        You're on team <strong>{data.team.teamName}</strong>
                        {data.team.isCaptain && " (captain)"}.
                    </p>

                    {data.showSchedule && data.team.nextMatch && (
                        <div className="rounded-md border border-indigo-300 bg-white p-2 dark:border-indigo-700 dark:bg-indigo-900/40">
                            <p className="font-medium text-indigo-700 text-xs uppercase tracking-wide dark:text-indigo-300">
                                Next Match
                            </p>
                            <p>
                                vs{" "}
                                <strong>
                                    {data.team.nextMatch.opponentName}
                                </strong>
                            </p>
                            <p className="text-muted-foreground text-xs">
                                Court {data.team.nextMatch.court ?? "TBD"} ·{" "}
                                {fmtTime(data.team.nextMatch.startTime)} ·{" "}
                                {data.team.nextMatch.bracket === "pool"
                                    ? "Pool play"
                                    : data.team.nextMatch.bracket}
                            </p>
                        </div>
                    )}

                    {data.showSchedule && data.team.nextWork && (
                        <div className="rounded-md border border-amber-300 bg-white p-2 dark:border-amber-700 dark:bg-indigo-900/40">
                            <p className="font-medium text-amber-700 text-xs uppercase tracking-wide dark:text-amber-300">
                                Next Work Assignment
                            </p>
                            <p>
                                {data.team.nextWork.homeName} vs{" "}
                                {data.team.nextWork.awayName}
                            </p>
                            <p className="text-muted-foreground text-xs">
                                Court {data.team.nextWork.court ?? "TBD"} ·{" "}
                                {fmtTime(data.team.nextWork.startTime)} — enter
                                scores via Enter Tournament Scores.
                            </p>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <Link href="/dashboard/tournament-team">
                            <Button variant="outline" size="sm">
                                {data.team.isCaptain
                                    ? "Manage Team"
                                    : "View Team"}
                            </Button>
                        </Link>
                        {data.showSchedule && (
                            <Link href="/dashboard/tournament-scores">
                                <Button variant="outline" size="sm">
                                    Enter Scores
                                </Button>
                            </Link>
                        )}
                    </div>
                </CardContent>
            </Card>
        )
    }

    // Player has expressed interest but isn't on a roster yet.
    if (data.onWaitlist) {
        return (
            <Card className="min-w-[280px] flex-1 border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950">
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                        <RiTrophyLine className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        <CardTitle className="text-emerald-700 text-lg dark:text-emerald-300">
                            {data.tournamentName}
                        </CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                    <p className="font-medium">
                        Thanks for signing up to play!
                    </p>
                    <p>
                        You're not on a team yet. If you know which captain
                        plans to add you, please reach out so they can put you
                        on their roster. Otherwise we'll contact you if we can
                        place you on a team.
                    </p>
                    {data.registrationOpen && !data.allDivisionsFull && (
                        <p className="text-muted-foreground text-xs">
                            Want to captain a team yourself instead? Sign up
                            below.
                        </p>
                    )}
                    {data.registrationOpen && !data.allDivisionsFull && (
                        <Link href="/dashboard/tournament-signup">
                            <Button variant="outline" size="sm">
                                Sign Up a Team
                            </Button>
                        </Link>
                    )}
                </CardContent>
            </Card>
        )
    }

    // Registration open and the user is neither on a team nor on the list.
    if (data.registrationOpen) {
        return (
            <Card className="min-w-[280px] flex-1 border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950">
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                        <RiTrophyLine className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        <CardTitle className="text-indigo-700 text-lg dark:text-indigo-300">
                            {data.tournamentName}
                        </CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    {data.allDivisionsFull ? (
                        <>
                            <p>
                                Every division is full — no more teams can
                                register. You can still sign up as a player so a
                                captain can add you if a spot opens up.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <Link href="/dashboard/tournament-waitlist">
                                    <Button size="sm">
                                        Sign Up as a Player
                                    </Button>
                                </Link>
                            </div>
                        </>
                    ) : (
                        <>
                            <p>
                                Registration is open. Pick the path that fits
                                you:
                            </p>
                            <ul className="ml-4 list-disc space-y-1 text-muted-foreground text-xs">
                                <li>
                                    <strong>Sign up a team</strong> if you're a
                                    captain ready to register and pay the team
                                    fee.
                                </li>
                                <li>
                                    <strong>Sign up as a player</strong> to let
                                    captains know you'd like to be added to a
                                    team — also pre-accepts the waiver so you're
                                    cleared to play when a captain adds you.
                                </li>
                            </ul>
                            <div className="flex flex-wrap gap-2">
                                <Link href="/dashboard/tournament-signup">
                                    <Button size="sm">Sign Up a Team</Button>
                                </Link>
                                <Link href="/dashboard/tournament-waitlist">
                                    <Button variant="outline" size="sm">
                                        Sign Up as a Player
                                    </Button>
                                </Link>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        )
    }

    // Registration closed and not on a team — nothing actionable to show.
    return null
}
