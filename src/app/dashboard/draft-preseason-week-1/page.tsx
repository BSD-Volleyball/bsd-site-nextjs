import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { PageHeader } from "@/components/layout/page-header"
import { getIsCommissioner } from "@/app/dashboard/actions"
import { getSeasonConfig } from "@/lib/site-config"
import { db } from "@/database/db"
import { week1Rosters, users } from "@/database/schema"
import { and, eq } from "drizzle-orm"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Draft Preseason Week 1"
}

export const dynamic = "force-dynamic"

interface RosterPlayer {
    userId: string
    displayName: string
    lastName: string
    sessionNumber: number
    courtNumber: number
}

export default async function DraftPreseasonWeek1Page() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await getIsCommissioner()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Draft Preseason Week 1"
                    description="Preseason week 1 roster assignments by session and court."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    No current season found.
                </div>
            </div>
        )
    }

    const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

    const rosterRows = await db
        .select({
            userId: week1Rosters.user,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preffered_name,
            sessionNumber: week1Rosters.session_number,
            courtNumber: week1Rosters.court_number
        })
        .from(week1Rosters)
        .innerJoin(users, eq(week1Rosters.user, users.id))
        .where(
            and(
                eq(week1Rosters.season, config.seasonId),
                eq(week1Rosters.session_number, 1)
            )
        )

    const session2Rows = await db
        .select({
            userId: week1Rosters.user,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preffered_name,
            sessionNumber: week1Rosters.session_number,
            courtNumber: week1Rosters.court_number
        })
        .from(week1Rosters)
        .innerJoin(users, eq(week1Rosters.user, users.id))
        .where(
            and(
                eq(week1Rosters.season, config.seasonId),
                eq(week1Rosters.session_number, 2)
            )
        )

    const alternateRows = await db
        .select({
            userId: week1Rosters.user,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preffered_name,
            sessionNumber: week1Rosters.session_number,
            courtNumber: week1Rosters.court_number
        })
        .from(week1Rosters)
        .innerJoin(users, eq(week1Rosters.user, users.id))
        .where(
            and(
                eq(week1Rosters.season, config.seasonId),
                eq(week1Rosters.session_number, 3)
            )
        )

    const players: RosterPlayer[] = [...rosterRows, ...session2Rows]
        .map((row) => ({
            userId: row.userId,
            displayName: row.preferredName
                ? `${row.preferredName} ${row.lastName}`
                : `${row.firstName} ${row.lastName}`,
            lastName: row.lastName,
            sessionNumber: row.sessionNumber,
            courtNumber: row.courtNumber
        }))
        .sort((a, b) => {
            if (a.sessionNumber !== b.sessionNumber) {
                return a.sessionNumber - b.sessionNumber
            }
            if (a.courtNumber !== b.courtNumber) {
                return a.courtNumber - b.courtNumber
            }
            return a.lastName.localeCompare(b.lastName)
        })

    const alternates: RosterPlayer[] = alternateRows
        .map((row) => ({
            userId: row.userId,
            displayName: row.preferredName
                ? `${row.preferredName} ${row.lastName}`
                : `${row.firstName} ${row.lastName}`,
            lastName: row.lastName,
            sessionNumber: row.sessionNumber,
            courtNumber: row.courtNumber
        }))
        .sort((a, b) => a.lastName.localeCompare(b.lastName))

    const getPlayers = (sessionNumber: 1 | 2, courtNumber: 1 | 2 | 3 | 4) =>
        players.filter(
            (player) =>
                player.sessionNumber === sessionNumber &&
                player.courtNumber === courtNumber
        )

    return (
        <div className="space-y-8">
            <PageHeader
                title={`${seasonLabel} Draft Preseason Week 1`}
                description="Preseason week 1 roster assignments by session and court."
            />

            <div className="space-y-4 rounded-lg border bg-muted/20 p-5">
                <h2 className="font-semibold text-sm uppercase tracking-wide">
                    ABOUT THE PRESEASON ROSTERS FOR WEEK 1 - New Players, Legacy
                    Players and "Opt-Ins"
                </h2>
                <p className="text-sm">
                    The focus for the first week of Preseason Play is on players
                    who are joining the league for the first time ("new
                    players") and players who are returning to the league after
                    an absence of two years or longer ("legacy players"). All
                    new players and legacy players have been placed on the
                    roster for Preseason Week 1. A limited number of interested
                    players who have "opted in" have also been placed on the
                    rosters below.
                </p>
                <p className="text-sm">
                    There will be two sessions, capped at 48 players each (12
                    players on each court). Each session will be divided equally
                    between skills drills and game play with an opportunity for
                    player movement across courts halfway though the session.
                    Captains at all levels of play will be invited to observe
                    both sessions.
                </p>
                <p className="text-sm">
                    All registered players will be placed on the roster for
                    Preseason Weeks 2 & 3.
                </p>
            </div>

            {[1, 2].map((sessionNumber) => (
                <section key={`session-${sessionNumber}`} className="space-y-4">
                    <h2 className="font-semibold text-xl">
                        Session {sessionNumber}{" "}
                        <span className="font-normal text-base text-muted-foreground">
                            (
                            {sessionNumber === 1
                                ? "7:00pm - 8:30pm"
                                : "8:30pm - 10:00pm"}
                            )
                        </span>
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {[1, 2, 3, 4].map((courtNumber) => {
                            const courtPlayers = getPlayers(
                                sessionNumber as 1 | 2,
                                courtNumber as 1 | 2 | 3 | 4
                            )

                            return (
                                <div
                                    key={`session-${sessionNumber}-court-${courtNumber}`}
                                    className="rounded-lg border bg-card p-4"
                                >
                                    <div className="mb-3 flex items-center justify-between">
                                        <h3 className="font-semibold text-base">
                                            Court {courtNumber}
                                        </h3>
                                        <span className="text-muted-foreground text-xs">
                                            {courtPlayers.length} players
                                        </span>
                                    </div>

                                    {courtPlayers.length === 0 ? (
                                        <p className="text-muted-foreground text-sm">
                                            No players assigned.
                                        </p>
                                    ) : (
                                        <ol className="space-y-1.5 text-sm">
                                            {courtPlayers.map((player) => (
                                                <li
                                                    key={player.userId}
                                                    className="rounded-sm bg-muted/40 px-2 py-1"
                                                >
                                                    {player.displayName}
                                                </li>
                                            ))}
                                        </ol>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </section>
            ))}

            <section className="space-y-4">
                <h2 className="font-semibold text-xl">Alternates</h2>
                <div className="rounded-lg border bg-card p-4">
                    {alternates.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            No alternates assigned.
                        </p>
                    ) : (
                        <ol className="columns-1 space-y-1.5 text-sm md:columns-2 xl:columns-3">
                            {alternates.map((player) => (
                                <li
                                    key={`alt-${player.userId}`}
                                    className="break-inside-avoid rounded-sm bg-muted/40 px-2 py-1"
                                >
                                    {player.displayName}
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </section>
        </div>
    )
}
