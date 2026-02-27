import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { PageHeader } from "@/components/layout/page-header"
import { getIsCommissioner } from "@/app/dashboard/actions"
import { getSeasonConfig } from "@/lib/site-config"
import { db } from "@/database/db"
import { week2Rosters, users, divisions } from "@/database/schema"
import { asc, eq } from "drizzle-orm"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Pre-Season Week 2"
}

export const dynamic = "force-dynamic"

interface Week2RosterRow {
    userId: string
    displayName: string
    lastName: string
    divisionId: number
    divisionName: string
    divisionLevel: number
    teamNumber: number
    isCaptain: boolean
}

interface DivisionTeam {
    teamNumber: number
    players: Week2RosterRow[]
}

interface DivisionGroup {
    divisionId: number
    divisionName: string
    divisionLevel: number
    teams: DivisionTeam[]
}

const LEGACY_COURT_BY_DIVISION: Record<string, number> = {
    AA: 1,
    A: 2,
    ABA: 3,
    ABB: 4,
    BB: 7,
    BBB: 8
}

function buildDivisionSchedule(
    divisionName: string,
    maxTeamNumber: number,
    divisionIndex: number,
    sessionTimes: string[]
) {
    const courtNumber =
        LEGACY_COURT_BY_DIVISION[divisionName] ?? divisionIndex + 1

    const possibleMatchups: Array<[number, number]> = [
        [1, 2],
        [3, 4],
        [5, 6]
    ]

    const matchups = possibleMatchups.filter(
        ([homeTeam, awayTeam]) =>
            homeTeam <= maxTeamNumber && awayTeam <= maxTeamNumber
    )

    return matchups.map(([homeTeam, awayTeam], index) => ({
        time: sessionTimes[index] || "Time TBD",
        courtNumber,
        matchLabel: `${divisionName}-${homeTeam} vs. ${divisionName}-${awayTeam}`
    }))
}

export default async function PreseasonWeek2Page() {
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
                    title="Pre-Season Week 2"
                    description="Preseason week 2 roster assignments grouped by division."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    No current season found.
                </div>
            </div>
        )
    }

    const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`
    const sessionTimes = [
        config.tryout2Session1Time,
        config.tryout2Session2Time,
        config.tryout2Session3Time
    ]

    const rosterRows = await db
        .select({
            userId: week2Rosters.user,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preffered_name,
            divisionId: week2Rosters.division,
            divisionName: divisions.name,
            divisionLevel: divisions.level,
            teamNumber: week2Rosters.team_number,
            isCaptain: week2Rosters.is_captain
        })
        .from(week2Rosters)
        .innerJoin(users, eq(week2Rosters.user, users.id))
        .innerJoin(divisions, eq(week2Rosters.division, divisions.id))
        .where(eq(week2Rosters.season, config.seasonId))
        .orderBy(
            asc(divisions.level),
            asc(week2Rosters.team_number),
            asc(users.last_name),
            asc(users.first_name)
        )

    const userAssignmentCounts = new Map<string, number>()

    for (const row of rosterRows) {
        const currentCount = userAssignmentCounts.get(row.userId) || 0
        userAssignmentCounts.set(row.userId, currentCount + 1)
    }

    const normalizedRows: Week2RosterRow[] = rosterRows
        .map((row) => {
            const baseName = row.preferredName
                ? `${row.preferredName} ${row.lastName}`
                : `${row.firstName} ${row.lastName}`
            const needsAsterisk =
                (userAssignmentCounts.get(row.userId) || 0) > 1
            const captainSuffix = row.isCaptain ? " (Capt)" : ""
            const asteriskSuffix = needsAsterisk ? "*" : ""

            return {
                userId: row.userId,
                displayName: `${baseName}${captainSuffix}${asteriskSuffix}`,
                lastName: row.lastName,
                divisionId: row.divisionId,
                divisionName: row.divisionName,
                divisionLevel: row.divisionLevel,
                teamNumber: row.teamNumber,
                isCaptain: row.isCaptain
            }
        })
        .sort((a, b) => {
            if (a.divisionLevel !== b.divisionLevel) {
                return a.divisionLevel - b.divisionLevel
            }
            if (a.teamNumber !== b.teamNumber) {
                return a.teamNumber - b.teamNumber
            }
            return a.lastName.localeCompare(b.lastName)
        })

    const groupedByDivision = new Map<
        number,
        {
            divisionId: number
            divisionName: string
            divisionLevel: number
            teams: Map<number, Week2RosterRow[]>
        }
    >()

    for (const row of normalizedRows) {
        const divisionGroup = groupedByDivision.get(row.divisionId) || {
            divisionId: row.divisionId,
            divisionName: row.divisionName,
            divisionLevel: row.divisionLevel,
            teams: new Map<number, Week2RosterRow[]>()
        }

        const teamPlayers = divisionGroup.teams.get(row.teamNumber) || []
        teamPlayers.push(row)
        divisionGroup.teams.set(row.teamNumber, teamPlayers)

        groupedByDivision.set(row.divisionId, divisionGroup)
    }

    const divisionGroups: DivisionGroup[] = [...groupedByDivision.values()]
        .map((division) => ({
            divisionId: division.divisionId,
            divisionName: division.divisionName,
            divisionLevel: division.divisionLevel,
            teams: [...division.teams.entries()]
                .sort(([teamA], [teamB]) => teamA - teamB)
                .map(([teamNumber, players]) => ({
                    teamNumber,
                    players
                }))
        }))
        .sort((a, b) => a.divisionLevel - b.divisionLevel)

    return (
        <div className="space-y-8">
            <PageHeader
                title={`${seasonLabel} Pre-Season Week 2`}
                description="Preseason week 2 roster assignments grouped by division and team."
            />

            <div className="space-y-4 rounded-lg border bg-muted/20 p-5">
                <h2 className="font-semibold text-sm uppercase tracking-wide">
                    ABOUT THE PRESEASON ROSTERS FOR WEEK 2 - Preseason
                    &quot;Automated&quot; Draft
                </h2>
                <p className="text-sm">
                    The league has conducted an &quot;automated&quot; draft into
                    regular divisions. Returning players were placed in the
                    division they most recently played in. New players were
                    placed in divisions based on feedback from the Captains
                    after Preseason Week 1. The league may have made some
                    limited adjustments to accommodate Pair Requests and fill in
                    roster gaps where necessary.
                </p>
                <p className="text-sm">
                    Players marked with an asterisk (*) are scheduled for two
                    matches.
                </p>
                <p className="text-sm">
                    Each team will play one match with no refs and capped at 50
                    minutes. Captains at all levels will be invited to observe
                    the matches when their teams are not playing. There will be
                    a new roster of preseason teams next week with over 40% of
                    players moving into new divisions (half moving up and half
                    moving down) based on feedback from the Captains.
                </p>
                <p className="text-sm">
                    All registered players will be placed on the roster for
                    Preseason Week 3.
                </p>
                <p className="font-semibold text-sm underline">
                    Preseason Week 2 - {config.tryout2Date || "Date TBD"}:
                </p>
            </div>

            {divisionGroups.length === 0 ? (
                <div className="rounded-lg border bg-card p-4 text-muted-foreground text-sm">
                    No Week 2 roster assignments were found for the current
                    season.
                </div>
            ) : (
                divisionGroups.map((division, divisionIndex) => {
                    const maxTeamNumber = Math.max(
                        ...division.teams.map((team) => team.teamNumber)
                    )
                    const scheduleRows = buildDivisionSchedule(
                        division.divisionName,
                        maxTeamNumber,
                        divisionIndex,
                        sessionTimes
                    )

                    return (
                        <section
                            key={division.divisionId}
                            className="space-y-4 rounded-lg border bg-card p-5"
                        >
                            <h2 className="font-semibold text-xl">
                                {division.divisionName} Division
                            </h2>

                            <div
                                className={
                                    maxTeamNumber <= 4
                                        ? "grid gap-4 md:grid-cols-2"
                                        : "grid gap-4 md:grid-cols-2 xl:grid-cols-3"
                                }
                            >
                                {division.teams.map((team) => (
                                    <div
                                        key={`${division.divisionId}-${team.teamNumber}`}
                                        className="rounded-lg border bg-muted/20 p-4"
                                    >
                                        <h3 className="mb-3 font-semibold text-base">
                                            Team {division.divisionName}-
                                            {team.teamNumber}
                                        </h3>
                                        <ol className="space-y-1.5 text-sm">
                                            {team.players.map((player) => (
                                                <li
                                                    key={`${player.userId}-${division.divisionId}-${team.teamNumber}`}
                                                    className="rounded-sm bg-background px-2 py-1"
                                                >
                                                    {player.displayName}
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                ))}
                            </div>

                            {scheduleRows.length > 0 && (
                                <div className="overflow-x-auto rounded-lg border">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/40">
                                            <tr>
                                                <th className="px-3 py-2 text-left">
                                                    Time
                                                </th>
                                                <th className="px-3 py-2 text-left">
                                                    Court
                                                </th>
                                                <th className="px-3 py-2 text-left">
                                                    Match
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {scheduleRows.map((scheduleRow) => (
                                                <tr
                                                    key={`${division.divisionId}-${scheduleRow.matchLabel}`}
                                                    className="border-t"
                                                >
                                                    <td className="px-3 py-2">
                                                        {scheduleRow.time}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        {
                                                            scheduleRow.courtNumber
                                                        }
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        {scheduleRow.matchLabel}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    )
                })
            )}
        </div>
    )
}
