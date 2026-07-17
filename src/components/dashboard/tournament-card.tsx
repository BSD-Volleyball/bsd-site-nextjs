import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RiTrophyLine } from "@remixicon/react"
import type { TournamentDashboardCardData } from "@/lib/tournament-dashboard"
import { TournamentWithdrawButton } from "@/components/dashboard/tournament-withdraw-button"

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

function fmtDate(iso: string): string {
    const d = new Date(`${iso}T00:00:00`)
    return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric"
    })
}

// Tournament type + date + info link rendered under the card title.
// Shown in every state of the card so users always know what tournament
// the card refers to and can jump to the full info page.
function TournamentMeta({ data }: { data: TournamentDashboardCardData }) {
    const typeLabel =
        data.tournamentType === "coed"
            ? "Coed Tournament"
            : "Reverse Coed Tournament"
    return (
        <div className="space-y-0.5 pt-0.5 text-xs">
            <p className="text-muted-foreground">
                <span className="font-medium">{typeLabel}</span> ·{" "}
                {fmtDate(data.tournamentDate)}
            </p>
            <Link
                href={`/tournament/${data.tournamentCode}`}
                className="text-primary hover:underline"
            >
                More details →
            </Link>
        </div>
    )
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
                    <TournamentMeta data={data} />
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <p>
                        You're on team <strong>{data.team.teamName}</strong>
                        {data.team.isCaptain && " (captain)"}
                        {data.team.divisionName && (
                            <>
                                {" "}
                                in division{" "}
                                <strong>{data.team.divisionName}</strong>
                            </>
                        )}
                        .
                    </p>

                    {data.team.roster.length > 0 && (
                        <div className="rounded-md border border-indigo-300 bg-white p-2 dark:border-indigo-700 dark:bg-indigo-900/40">
                            <p className="font-medium text-indigo-700 text-xs uppercase tracking-wide dark:text-indigo-300">
                                Roster
                            </p>
                            <ul className="mt-1 space-y-0.5">
                                {data.team.roster.map((p) => (
                                    <li key={p.userId} className="text-sm">
                                        {p.name}
                                        {p.isCaptain && (
                                            <span className="ml-2 rounded bg-indigo-200 px-1.5 py-0.5 font-medium text-indigo-800 text-xs dark:bg-indigo-800 dark:text-indigo-100">
                                                Captain
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

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
                    <TournamentMeta data={data} />
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
                    <div className="flex flex-wrap gap-2">
                        {data.registrationOpen && !data.allDivisionsFull && (
                            <Link href="/dashboard/tournament-signup">
                                <Button variant="outline" size="sm">
                                    Sign Up a Team
                                </Button>
                            </Link>
                        )}
                        <TournamentWithdrawButton
                            tournamentName={data.tournamentName}
                        />
                    </div>
                    <p className="text-muted-foreground text-xs">
                        Changed your mind? You can withdraw any time before a
                        captain adds you to a team.
                    </p>
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
                    <TournamentMeta data={data} />
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

    // Team registration is closed, but individuals can still sign up as a
    // player (accepting the waiver) through tournament day so captains can
    // add them to rosters.
    if (data.playerSignupOpen) {
        return (
            <Card className="min-w-[280px] flex-1 border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950">
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                        <RiTrophyLine className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        <CardTitle className="text-indigo-700 text-lg dark:text-indigo-300">
                            {data.tournamentName}
                        </CardTitle>
                    </div>
                    <TournamentMeta data={data} />
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <p>
                        Team registration is closed, but you can still sign up
                        as a player and accept the waiver so a captain can add
                        you to their roster.
                    </p>
                    <Link href="/dashboard/tournament-waitlist">
                        <Button size="sm">Sign Up as a Player</Button>
                    </Link>
                </CardContent>
            </Card>
        )
    }

    // Tournament day has passed and not on a team — nothing actionable.
    return null
}
