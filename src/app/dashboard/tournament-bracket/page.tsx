import { redirect } from "next/navigation"
import { headers } from "next/headers"
import type { Metadata } from "next"
import { db } from "@/database/db"
import { PageHeader } from "@/components/layout/page-header"
import { auth } from "@/lib/auth"
import {
    divisions as leagueDivisions,
    tournamentDivisions,
    tournamentMatches,
    tournamentTeams
} from "@/database/schema"
import { and, asc, eq, ne } from "drizzle-orm"
import { getTournamentConfig } from "@/lib/tournament-config"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = {
    title: "Tournament Bracket"
}

export default async function TournamentBracketPage() {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) redirect("/auth/sign-in")

    const config = await getTournamentConfig()
    if (!config) {
        return (
            <div className="space-y-6">
                <PageHeader title="Tournament Bracket" description="" />
                <p className="text-muted-foreground">No active tournament.</p>
            </div>
        )
    }

    const matches = await db
        .select()
        .from(tournamentMatches)
        .where(
            and(
                eq(tournamentMatches.tournament_id, config.tournamentId),
                ne(tournamentMatches.bracket, "pool")
            )
        )
        .orderBy(
            asc(tournamentMatches.division_id),
            asc(tournamentMatches.bracket),
            asc(tournamentMatches.bracket_round),
            asc(tournamentMatches.bracket_slot)
        )

    const teams = await db
        .select({ id: tournamentTeams.id, name: tournamentTeams.name })
        .from(tournamentTeams)
        .where(eq(tournamentTeams.tournament_id, config.tournamentId))
    const teamName = new Map(teams.map((t) => [t.id, t.name]))

    const divisions = await db
        .select({
            id: tournamentDivisions.id,
            name: leagueDivisions.name
        })
        .from(tournamentDivisions)
        .innerJoin(
            leagueDivisions,
            eq(leagueDivisions.id, tournamentDivisions.division_id)
        )
        .where(eq(tournamentDivisions.tournament_id, config.tournamentId))
        .orderBy(asc(tournamentDivisions.sort_order))

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${config.name} — Bracket`}
                description={`${config.eliminationFormat} elimination`}
            />
            {matches.length === 0 ? (
                <p className="text-muted-foreground">
                    Bracket has not been seeded yet. Advance the tournament to
                    Playoffs to seed.
                </p>
            ) : (
                divisions.map((div) => {
                    const divMatches = matches.filter(
                        (m) => m.division_id === div.id
                    )
                    if (divMatches.length === 0) return null
                    // Group by bracket then round
                    const buckets = new Map<string, typeof divMatches>()
                    for (const m of divMatches) {
                        const key = `${m.bracket}-${m.bracket_round ?? 0}`
                        const arr = buckets.get(key) ?? []
                        arr.push(m)
                        buckets.set(key, arr)
                    }
                    return (
                        <Card key={div.id}>
                            <CardHeader>
                                <CardTitle>{div.name}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-wrap gap-4 overflow-x-auto">
                                    {[...buckets.entries()].map(([key, ms]) => {
                                        const [bracket, round] = key.split("-")
                                        return (
                                            <div
                                                key={key}
                                                className="min-w-[200px] space-y-2"
                                            >
                                                <h4 className="font-medium text-sm">
                                                    {bracket.toUpperCase()} · R
                                                    {round}
                                                </h4>
                                                {ms.map((m) => (
                                                    <div
                                                        key={m.id}
                                                        className="rounded border p-2 text-xs"
                                                    >
                                                        <Row
                                                            name={
                                                                m.home_team_id !==
                                                                null
                                                                    ? (teamName.get(
                                                                          m.home_team_id
                                                                      ) ?? "—")
                                                                    : "TBD"
                                                            }
                                                            isWinner={
                                                                m.winner_team_id ===
                                                                m.home_team_id
                                                            }
                                                            sets={[
                                                                m.home_set1_score,
                                                                m.home_set2_score,
                                                                m.home_set3_score
                                                            ]}
                                                        />
                                                        <Row
                                                            name={
                                                                m.away_team_id !==
                                                                null
                                                                    ? (teamName.get(
                                                                          m.away_team_id
                                                                      ) ?? "—")
                                                                    : "TBD"
                                                            }
                                                            isWinner={
                                                                m.winner_team_id ===
                                                                m.away_team_id
                                                            }
                                                            sets={[
                                                                m.away_set1_score,
                                                                m.away_set2_score,
                                                                m.away_set3_score
                                                            ]}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    )
                })
            )}
        </div>
    )
}

function Row({
    name,
    isWinner,
    sets
}: {
    name: string
    isWinner: boolean
    sets: (number | null)[]
}) {
    return (
        <div
            className={`flex items-center justify-between ${
                isWinner ? "font-semibold" : ""
            }`}
        >
            <span>{name}</span>
            <span className="text-muted-foreground">
                {sets.map((s) => (s === null ? "—" : s)).join(" / ")}
            </span>
        </div>
    )
}
