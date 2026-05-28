import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { db } from "@/database/db"
import { divisions, tournamentDivisions, tournaments } from "@/database/schema"
import { asc, eq } from "drizzle-orm"

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

function fmtTime(t: string | null): string {
    if (!t) return "—"
    const [hStr, m] = t.split(":")
    const h = parseInt(hStr, 10)
    const period = h >= 12 ? "PM" : "AM"
    const h12 = ((h + 11) % 12) + 1
    return `${h12}:${m} ${period}`
}

export default async function TournamentMarketingPage({ params }: PageParams) {
    const { code } = await params
    const [t] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.code, code.toLowerCase()))
        .limit(1)
    if (!t) notFound()

    const divs = await db
        .select({
            id: tournamentDivisions.id,
            name: divisions.name,
            team_count: tournamentDivisions.team_count,
            male_per_team: tournamentDivisions.male_per_team,
            non_male_per_team: tournamentDivisions.non_male_per_team
        })
        .from(tournamentDivisions)
        .innerJoin(divisions, eq(divisions.id, tournamentDivisions.division_id))
        .where(eq(tournamentDivisions.tournament_id, t.id))
        .orderBy(asc(tournamentDivisions.sort_order))

    return (
        <div className="container mx-auto max-w-4xl px-4 py-16">
            <header className="space-y-2">
                <p className="text-muted-foreground text-sm uppercase tracking-wide">
                    {t.tournament_type === "coed" ? "Coed" : "Reverse Coed"}{" "}
                    Tournament · {t.year}
                </p>
                <h1 className="font-bold text-4xl">{t.name}</h1>
                <p className="text-lg text-muted-foreground">
                    {fmtDate(t.tournament_date)}
                </p>
            </header>

            <section className="prose prose-lg dark:prose-invert mt-8">
                <h2>Details</h2>
                <ul>
                    <li>
                        <strong>Check-in:</strong> {fmtTime(t.checkin_time)}
                    </li>
                    <li>
                        <strong>First serve:</strong>{" "}
                        {fmtTime(t.first_serve_time)}
                    </li>
                    {t.address && (
                        <li>
                            <strong>Location:</strong> {t.address}
                        </li>
                    )}
                    <li>
                        <strong>Team cost:</strong> ${t.cost ?? "—"}
                        {t.late_cost && t.late_date && (
                            <>
                                {" "}
                                (after {fmtDate(t.late_date)}: ${t.late_cost})
                            </>
                        )}
                    </li>
                    {t.registration_close_date && (
                        <li>
                            <strong>Registration closes:</strong>{" "}
                            {fmtDate(t.registration_close_date)}
                        </li>
                    )}
                    {t.roster_lock_date && (
                        <li>
                            <strong>Roster lock:</strong>{" "}
                            {fmtDate(t.roster_lock_date)}
                        </li>
                    )}
                    <li>
                        <strong>Format:</strong> Pool play (pools of{" "}
                        {t.pool_size}) into{" "}
                        {t.elimination_format === "single"
                            ? "single"
                            : "double"}{" "}
                        elimination bracket
                    </li>
                </ul>

                <h2>Divisions</h2>
                {divs.length === 0 ? (
                    <p>Divisions to be announced.</p>
                ) : (
                    <ul>
                        {divs.map((d) => (
                            <li key={d.id}>
                                <strong>{d.name}</strong> — {d.team_count} teams
                                · up to {d.male_per_team} males /{" "}
                                {d.non_male_per_team} non-males per team
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    )
}
