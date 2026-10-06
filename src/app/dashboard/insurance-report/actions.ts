"use server"

import { formatSeasonRowLabel } from "@/lib/season-utils"
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
} from "@/next/action-helpers"
import { formatPlayerName } from "@/lib/utils"
import { eq, inArray } from "drizzle-orm"
import { buildInsuranceGroups, type InsuranceReport } from "./report-logic"

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
                label: formatSeasonRowLabel(r)
            })),
            ...subRows.map((r) => ({
                userId: r.userId,
                name: nameFor(r.userId),
                label: formatSeasonRowLabel(r)
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
