import { notFound } from "next/navigation"
import Link from "next/link"
import type { Metadata } from "next"
import { db } from "@/database/db"
import {
    divisions,
    tournamentDivisions,
    tournamentTeams,
    tournaments
} from "@/database/schema"
import { asc, count, eq } from "drizzle-orm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Calendar,
    Clock,
    DollarSign,
    Flag,
    Lock,
    MapPin,
    Trophy,
    Users
} from "lucide-react"
import { TOURNAMENT_PHASE_CONFIG } from "@/lib/tournament-phases"

interface PageParams {
    params: Promise<{ code: string }>
}

export async function generateMetadata({
    params
}: PageParams): Promise<Metadata> {
    const { code } = await params
    const [t] = await db
        .select({ name: tournaments.name })
        .from(tournaments)
        .where(eq(tournaments.code, code.toLowerCase()))
        .limit(1)
    return {
        title: t ? `${t.name} — BSD Tournament` : "Tournament — BSD"
    }
}

function fmtDate(iso: string): string {
    const d = new Date(`${iso}T00:00:00`)
    return d.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    })
}

function fmtShortDate(iso: string): string {
    const d = new Date(`${iso}T00:00:00`)
    return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
    })
}

function fmtTime(t: string | null): string {
    if (!t) return "—"
    const [hStr, m] = t.split(":")
    const h = parseInt(hStr, 10)
    const period = h >= 12 ? "PM" : "AM"
    const h12 = ((h + 11) % 12) + 1
    return `${h12}:${m} ${period}`
}

function isPastDateET(date: string): boolean {
    const nowET = new Date(
        new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
    )
    const target = new Date(`${date}T23:59:59`)
    return nowET >= target
}

export default async function TournamentMarketingPage({ params }: PageParams) {
    const { code } = await params
    const [t] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.code, code.toLowerCase()))
        .limit(1)
    if (!t) notFound()

    const [divs, teamCounts] = await Promise.all([
        db
            .select({
                id: tournamentDivisions.id,
                name: divisions.name,
                team_count: tournamentDivisions.team_count,
                male_per_team: tournamentDivisions.male_per_team,
                non_male_per_team: tournamentDivisions.non_male_per_team
            })
            .from(tournamentDivisions)
            .innerJoin(
                divisions,
                eq(divisions.id, tournamentDivisions.division_id)
            )
            .where(eq(tournamentDivisions.tournament_id, t.id))
            .orderBy(asc(tournamentDivisions.sort_order)),
        db
            .select({
                divisionId: tournamentTeams.preferred_division_id,
                n: count()
            })
            .from(tournamentTeams)
            .where(eq(tournamentTeams.tournament_id, t.id))
            .groupBy(tournamentTeams.preferred_division_id)
    ])

    const countByDivision = new Map(teamCounts.map((c) => [c.divisionId, c.n]))
    const phase = t.phase as keyof typeof TOURNAMENT_PHASE_CONFIG
    const phaseLabel = TOURNAMENT_PHASE_CONFIG[phase]?.label ?? phase
    const isLate = !!t.late_date && !!t.late_cost && isPastDateET(t.late_date)
    const currentCost = isLate ? t.late_cost : t.cost
    const registrationOpen =
        phase === "registration_open" &&
        (!t.registration_close_date || !isPastDateET(t.registration_close_date))
    const allDivisionsFull =
        divs.length > 0 &&
        divs.every((d) => (countByDivision.get(d.id) ?? 0) >= d.team_count)
    const canSignUpTeam = registrationOpen && !allDivisionsFull

    return (
        <div className="min-h-screen">
            {/* Hero header */}
            <header className="relative overflow-hidden border-b">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-primary/5" />
                <div className="container relative mx-auto max-w-5xl px-4 py-16 sm:py-20">
                    <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary">
                                    {t.tournament_type === "coed"
                                        ? "Coed"
                                        : "Reverse Coed"}
                                </Badge>
                                <Badge variant="outline">{t.year}</Badge>
                                <Badge>{phaseLabel}</Badge>
                            </div>
                            <h1 className="font-bold text-4xl tracking-tight sm:text-5xl">
                                {t.name}
                            </h1>
                            <p className="flex items-center gap-2 text-lg text-muted-foreground">
                                <Calendar className="size-5" />
                                {fmtDate(t.tournament_date)}
                            </p>
                            {t.address && (
                                <p className="flex items-center gap-2 text-muted-foreground">
                                    <MapPin className="size-4" />
                                    {t.address}
                                </p>
                            )}
                        </div>
                        <div className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg sm:size-24">
                            <Trophy className="size-10 sm:size-12" />
                        </div>
                    </div>

                    {/* CTA row */}
                    {(canSignUpTeam || registrationOpen) && (
                        <div className="mt-8 flex flex-wrap gap-3">
                            {canSignUpTeam && (
                                <Button asChild size="lg">
                                    <Link href="/dashboard/tournament-signup">
                                        Sign Up a Team
                                    </Link>
                                </Button>
                            )}
                            {registrationOpen && (
                                <Button
                                    asChild
                                    size="lg"
                                    variant={
                                        canSignUpTeam ? "outline" : "default"
                                    }
                                >
                                    <Link href="/dashboard/tournament-waitlist">
                                        Join as an Individual
                                    </Link>
                                </Button>
                            )}
                        </div>
                    )}
                    {allDivisionsFull && registrationOpen && (
                        <p className="mt-4 text-amber-700 text-sm dark:text-amber-400">
                            Every division is full — team signups are closed.
                            You can still join as an individual to get on a
                            captain's radar if a spot opens up.
                        </p>
                    )}
                </div>
            </header>

            {/* Quick facts grid */}
            <section className="container mx-auto max-w-5xl px-4 py-12">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <FactCard
                        icon={<Clock className="size-5" />}
                        label="Check-In"
                        value={fmtTime(t.checkin_time)}
                    />
                    <FactCard
                        icon={<Flag className="size-5" />}
                        label="First Serve"
                        value={fmtTime(t.first_serve_time)}
                    />
                    <FactCard
                        icon={<Trophy className="size-5" />}
                        label="Format"
                        value={`Pools of ${t.pool_size} → ${
                            t.elimination_format === "single"
                                ? "single"
                                : "double"
                        } elim`}
                    />
                    <FactCard
                        icon={<DollarSign className="size-5" />}
                        label={isLate ? "Late Team Fee" : "Team Fee"}
                        value={currentCost ? `$${currentCost}` : "TBA"}
                        hint={
                            !isLate && t.late_cost && t.late_date
                                ? `$${t.late_cost} after ${fmtShortDate(t.late_date)}`
                                : undefined
                        }
                    />
                    {t.registration_close_date && (
                        <FactCard
                            icon={<Lock className="size-5" />}
                            label="Registration Closes"
                            value={fmtShortDate(t.registration_close_date)}
                        />
                    )}
                    {t.roster_lock_date && (
                        <FactCard
                            icon={<Users className="size-5" />}
                            label="Roster Lock"
                            value={fmtShortDate(t.roster_lock_date)}
                        />
                    )}
                </div>
            </section>

            {/* Divisions */}
            <section className="border-t bg-muted/30">
                <div className="container mx-auto max-w-5xl px-4 py-12">
                    <div className="mb-8">
                        <h2 className="font-bold text-3xl">Divisions</h2>
                        <p className="mt-1 text-muted-foreground">
                            Pick the level that fits your team.
                        </p>
                    </div>

                    {divs.length === 0 ? (
                        <Card>
                            <CardContent className="py-10 text-center text-muted-foreground">
                                Divisions to be announced.
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {divs.map((d) => {
                                const taken = countByDivision.get(d.id) ?? 0
                                const remaining = Math.max(
                                    0,
                                    d.team_count - taken
                                )
                                const full = remaining === 0
                                return (
                                    <Card
                                        key={d.id}
                                        className={
                                            full
                                                ? "border-muted opacity-70"
                                                : "border-primary/30"
                                        }
                                    >
                                        <CardHeader className="pb-3">
                                            <div className="flex items-center justify-between">
                                                <CardTitle className="font-bold text-2xl">
                                                    {d.name}
                                                </CardTitle>
                                                {full ? (
                                                    <Badge variant="secondary">
                                                        Full
                                                    </Badge>
                                                ) : registrationOpen ? (
                                                    <Badge>
                                                        {remaining} open
                                                    </Badge>
                                                ) : null}
                                            </div>
                                        </CardHeader>
                                        <CardContent className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">
                                                    Teams
                                                </span>
                                                <span className="font-medium">
                                                    {taken} / {d.team_count}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">
                                                    Roster cap
                                                </span>
                                                <span className="font-medium">
                                                    {d.male_per_team}M /{" "}
                                                    {d.non_male_per_team}NM
                                                </span>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </div>
            </section>

            {/* Footer CTA */}
            {registrationOpen && (
                <section className="container mx-auto max-w-5xl px-4 py-16 text-center">
                    <h2 className="font-bold text-3xl">Ready to play?</h2>
                    <p className="mt-2 text-muted-foreground">
                        {canSignUpTeam
                            ? "Sign up as a team captain or join the player list as an individual."
                            : "Team registration is closed, but you can still get on the player list."}
                    </p>
                    <div className="mt-6 flex flex-wrap justify-center gap-3">
                        {canSignUpTeam && (
                            <Button asChild size="lg">
                                <Link href="/dashboard/tournament-signup">
                                    Sign Up a Team
                                </Link>
                            </Button>
                        )}
                        <Button
                            asChild
                            size="lg"
                            variant={canSignUpTeam ? "outline" : "default"}
                        >
                            <Link href="/dashboard/tournament-waitlist">
                                Join as an Individual
                            </Link>
                        </Button>
                    </div>
                </section>
            )}
        </div>
    )
}

function FactCard({
    icon,
    label,
    value,
    hint
}: {
    icon: React.ReactNode
    label: string
    value: string
    hint?: string
}) {
    return (
        <div className="flex items-start gap-4 rounded-xl border bg-background p-5 transition-shadow hover:shadow-md">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    {label}
                </p>
                <p className="mt-0.5 font-semibold text-lg">{value}</p>
                {hint && (
                    <p className="mt-0.5 text-muted-foreground text-xs">
                        {hint}
                    </p>
                )}
            </div>
        </div>
    )
}
