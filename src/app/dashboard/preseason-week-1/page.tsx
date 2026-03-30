import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { PageHeader } from "@/components/layout/page-header"
import {
    getSeasonConfig,
    getEventsByType,
    formatEventDate,
    formatEventTime
} from "@/lib/site-config"
import { db } from "@/database/db"
import { week1Rosters, users } from "@/database/schema"
import { and, eq } from "drizzle-orm"
import { PrintButton } from "./print-button"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Pre-Season Week 1"
}

export const dynamic = "force-dynamic"

interface RosterPlayer {
    userId: string
    oldId: number
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

    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Pre-Season Week 1"
                    description="Preseason week 1 roster assignments by session and court."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    No current season found.
                </div>
            </div>
        )
    }

    const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`
    const tryouts = getEventsByType(config, "tryout")
    const tryout1 = tryouts[0]
    const tryout1DateDisplay = tryout1
        ? formatEventDate(tryout1.eventDate)
        : "Date TBD"
    const sessionTimes: Record<1 | 2, string> = {
        1: tryout1?.timeSlots[0]
            ? formatEventTime(tryout1.timeSlots[0].startTime)
            : "Time TBD",
        2: tryout1?.timeSlots[1]
            ? formatEventTime(tryout1.timeSlots[1].startTime)
            : "Time TBD"
    }

    const rosterRows = await db
        .select({
            userId: week1Rosters.user,
            oldId: users.old_id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
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
            oldId: users.old_id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
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
            oldId: users.old_id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
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
            oldId: row.oldId,
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
            oldId: row.oldId,
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
            <div className="flex items-start justify-between print:hidden">
                <PageHeader
                    title={`${seasonLabel} Pre-Season Week 1`}
                    description={`Preseason week 1 roster assignments by session and court. ${tryout1DateDisplay}`}
                />
                <PrintButton />
            </div>

            <div className="space-y-4 rounded-lg border bg-muted/20 p-5 print:hidden">
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

            {/* Print-only compact view — both sessions on one landscape page */}
            <div className="hidden print:block">
                <style>{`
                    @media print {
                        .pw1-title { font-size: 15pt; font-weight: 700; text-align: center; margin-bottom: 7pt; letter-spacing: 0.05em; text-transform: uppercase; }
                        .pw1-session-header { font-size: 12pt; font-weight: 600; border-bottom: 1px solid #000; margin-bottom: 5pt; padding-bottom: 2pt; }
                        .pw1-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5pt; margin-bottom: 10pt; }
                        .pw1-court { border: 1px solid #999; border-radius: 2pt; padding: 5pt; }
                        .pw1-court-name { font-size: 10.5pt; font-weight: 600; margin-bottom: 3pt; }
                        .pw1-list { list-style: none; margin: 0; padding: 0; }
                        .pw1-player { font-size: 10.5pt; line-height: 1.4; padding: 1pt 3pt; border-radius: 2pt; }
                        .pw1-player-empty { font-size: 10.5pt; color: #999; font-style: italic; }
                    }
                `}</style>
                <p className="pw1-title">{seasonLabel} Pre-Season Week 1 — {tryout1DateDisplay}</p>
                {[1, 2].map((sessionNumber) => (
                    <div key={`print-session-${sessionNumber}`}>
                        <p className="pw1-session-header">
                            Session {sessionNumber} &mdash;{" "}
                            {sessionTimes[sessionNumber as 1 | 2] || "Time TBD"}
                        </p>
                        <div className="pw1-grid">
                            {[1, 2, 3, 4].map((courtNumber) => {
                                const courtPlayers = getPlayers(
                                    sessionNumber as 1 | 2,
                                    courtNumber as 1 | 2 | 3 | 4
                                )
                                return (
                                    <div
                                        key={`print-s${sessionNumber}-c${courtNumber}`}
                                        className="pw1-court"
                                    >
                                        <p className="pw1-court-name">
                                            Court {courtNumber}
                                        </p>
                                        {courtPlayers.length === 0 ? (
                                            <p className="pw1-player-empty">
                                                No players
                                            </p>
                                        ) : (
                                            <ol className="pw1-list">
                                                {courtPlayers.map((player) => (
                                                    <li
                                                        key={player.userId}
                                                        className="pw1-player"
                                                    >
                                                        {player.oldId}.{" "}
                                                        {player.displayName}
                                                    </li>
                                                ))}
                                            </ol>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Screen view — hidden when printing */}
            <div className="contents print:hidden">
                {[1, 2].map((sessionNumber) => (
                    <section
                        key={`session-${sessionNumber}`}
                        className="space-y-4"
                    >
                        <h2 className="font-semibold text-xl">
                            Session {sessionNumber}{" "}
                            <span className="font-normal text-base text-muted-foreground">
                                (
                                {sessionTimes[sessionNumber as 1 | 2] ||
                                    "Time TBD"}
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
                                                        className={
                                                            player.userId ===
                                                            session.user.id
                                                                ? "rounded-sm bg-primary/15 px-2 py-1 font-semibold ring-1 ring-primary/50"
                                                                : "rounded-sm bg-muted/40 px-2 py-1"
                                                        }
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
            </div>

            <section className="space-y-4 print:hidden">
                <h2 className="font-semibold text-xl">
                    Alternates{" "}
                    <span className="font-normal text-base text-muted-foreground">
                        (we will contact you if a spot opens up)
                    </span>
                </h2>
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
                                    className={
                                        player.userId === session.user.id
                                            ? "break-inside-avoid rounded-sm bg-primary/15 px-2 py-1 font-semibold ring-1 ring-primary/50"
                                            : "break-inside-avoid rounded-sm bg-muted/40 px-2 py-1"
                                    }
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
