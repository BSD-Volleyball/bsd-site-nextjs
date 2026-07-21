"use server"

import { db } from "@/database/db"
import {
    drafts,
    seasons,
    signups,
    substitutions,
    teams,
    tournamentRoster,
    tournaments,
    users
} from "@/database/schema"
import {
    type ActionResult,
    ok,
    requireAdmin,
    requirePositiveInt,
    withAction
} from "@/lib/action-helpers"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import { formatPlayerName } from "@/lib/utils"
import { eq, inArray } from "drizzle-orm"
import {
    buildInsuranceGroups,
    type InsuranceReport,
    seasonLabel
} from "./report-logic"

/**
 * Distinct calendar years that have any season or tournament data, newest
 * first. The current year is always included so the report defaults to a real
 * option even before the season/tournament rows for it exist.
 */
export async function getInsuranceReportYears(): Promise<number[]> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) return []

    const [seasonYears, tournamentYears] = await Promise.all([
        db.selectDistinct({ year: seasons.year }).from(seasons),
        db.selectDistinct({ year: tournaments.year }).from(tournaments)
    ])

    const set = new Set<number>()
    for (const row of seasonYears) set.add(row.year)
    for (const row of tournamentYears) set.add(row.year)
    set.add(new Date().getFullYear())

    return Array.from(set).sort((a, b) => b - a)
}

/**
 * Insurance headcount for a calendar year: distinct participants (season
 * rosters + permanent subs + tournament rosters) bucketed into the youngest
 * age group they registered as that year.
 */
export const getInsuranceReport = withAction(
    async (year: number): Promise<ActionResult<InsuranceReport>> => {
        await requireAdmin()
        const y = requirePositiveInt(year, "year")

        // Registration — age group source (independent of participation).
        const ageRows = await db
            .select({ userId: signups.player, age: signups.age })
            .from(signups)
            .innerJoin(seasons, eq(signups.season, seasons.id))
            .where(eq(seasons.year, y))

        // Season participation: actually rostered players.
        const rosteredRows = await db
            .select({
                userId: drafts.user,
                season: seasons.season,
                year: seasons.year
            })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .innerJoin(seasons, eq(teams.season, seasons.id))
            .where(eq(seasons.year, y))

        // Season participation: permanent subs.
        const subRows = await db
            .select({
                userId: substitutions.sub_user,
                season: seasons.season,
                year: seasons.year
            })
            .from(substitutions)
            .innerJoin(seasons, eq(substitutions.season, seasons.id))
            .where(eq(seasons.year, y))

        // Tournament participation: rostered players (includes captains).
        const tournamentRows = await db
            .select({
                userId: tournamentRoster.user_id,
                name: tournaments.name,
                year: tournaments.year
            })
            .from(tournamentRoster)
            .innerJoin(
                tournaments,
                eq(tournamentRoster.tournament_id, tournaments.id)
            )
            .where(eq(tournaments.year, y))

        // Resolve display names for everyone who participated.
        const participantIds = new Set<string>()
        for (const row of rosteredRows) participantIds.add(row.userId)
        for (const row of subRows) participantIds.add(row.userId)
        for (const row of tournamentRows) participantIds.add(row.userId)

        const userRows = participantIds.size
            ? await db
                  .select({
                      id: users.id,
                      firstName: users.first_name,
                      lastName: users.last_name,
                      preferredName: users.preferred_name
                  })
                  .from(users)
                  .where(inArray(users.id, Array.from(participantIds)))
            : []

        const nameById = new Map(
            userRows.map((u) => [
                u.id,
                formatPlayerName(u.firstName, u.lastName, u.preferredName)
            ])
        )
        const nameFor = (id: string) => nameById.get(id) ?? "Unknown player"

        const participation = [
            ...rosteredRows.map((r) => ({
                userId: r.userId,
                name: nameFor(r.userId),
                label: seasonLabel(r.season, r.year)
            })),
            ...subRows.map((r) => ({
                userId: r.userId,
                name: nameFor(r.userId),
                label: seasonLabel(r.season, r.year)
            })),
            ...tournamentRows.map((r) => ({
                userId: r.userId,
                name: nameFor(r.userId),
                label: `${r.name} ${r.year}`
            }))
        ]

        const groups = buildInsuranceGroups({
            ageEntries: ageRows.map((r) => ({
                userId: r.userId,
                age: r.age
            })),
            participation
        })

        return ok({ groups })
    }
)
