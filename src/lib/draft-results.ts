import "server-only"

import { and, asc, eq, inArray, isNotNull, or } from "drizzle-orm"
import { db } from "@/database/db"
import {
    divisions,
    drafts,
    individual_divisions,
    teams,
    userRoles,
    users
} from "@/database/schema"
import { isAdminOrDirector } from "@/lib/rbac"

export type DivisionOption = { id: number; name: string }

export type DraftPlayer = {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    round: number
    overall: number
    male: boolean | null
}

export type DraftTeam = {
    teamId: number
    teamName: string
    teamNumber: number | null
    captainId: string
    captainFirstName: string
    captainLastName: string
    captainPreferredName: string | null
    players: DraftPlayer[]
}

/** Every division running in the season, by level. */
export async function getSeasonDivisions(
    seasonId: number
): Promise<DivisionOption[]> {
    return db
        .select({ id: divisions.id, name: divisions.name })
        .from(individual_divisions)
        .innerJoin(divisions, eq(individual_divisions.division, divisions.id))
        .where(eq(individual_divisions.season, seasonId))
        .orderBy(asc(divisions.level))
}

/**
 * The divisions whose draft board this user may see in `seasonId`: every
 * division for admins; otherwise the divisions where they captain or coach a
 * team (captain/captain2) plus those their commissioner rows name. A
 * commissioner row without a division grants nothing here: commissioners are
 * always tied to a specific division.
 */
export async function getDraftBoardDivisions(
    userId: string,
    seasonId: number
): Promise<DivisionOption[]> {
    if (await isAdminOrDirector(userId)) {
        return getSeasonDivisions(seasonId)
    }

    const [teamRows, commissionerRows] = await Promise.all([
        db
            .select({ divisionId: teams.division })
            .from(teams)
            .where(
                and(
                    eq(teams.season, seasonId),
                    or(eq(teams.captain, userId), eq(teams.captain2, userId))
                )
            ),
        db
            .select({ divisionId: userRoles.division_id })
            .from(userRoles)
            .where(
                and(
                    eq(userRoles.user_id, userId),
                    eq(userRoles.role, "commissioner"),
                    eq(userRoles.season_id, seasonId),
                    isNotNull(userRoles.division_id)
                )
            )
    ])

    const divisionIds = [
        ...new Set(
            [...teamRows, ...commissionerRows]
                .map((r) => r.divisionId)
                .filter((id): id is number => id !== null)
        )
    ]
    if (divisionIds.length === 0) return []

    return db
        .select({ id: divisions.id, name: divisions.name })
        .from(divisions)
        .where(inArray(divisions.id, divisionIds))
        .orderBy(asc(divisions.level))
}

/** Each team in the division with its draft picks, by round and overall. */
export async function getDraftResultsForDivision(
    seasonId: number,
    divisionId: number
): Promise<DraftTeam[]> {
    const teamRows = await db
        .select({
            teamId: teams.id,
            teamName: teams.name,
            teamNumber: teams.number,
            captainId: teams.captain,
            captainFirstName: users.first_name,
            captainLastName: users.last_name,
            captainPreferredName: users.preferred_name
        })
        .from(teams)
        .innerJoin(users, eq(teams.captain, users.id))
        .where(and(eq(teams.season, seasonId), eq(teams.division, divisionId)))
        .orderBy(asc(teams.number))

    if (teamRows.length === 0) {
        return []
    }

    const teamIds = teamRows.map((t) => t.teamId)

    const pickRows = await db
        .select({
            teamId: drafts.team,
            userId: drafts.user,
            round: drafts.round,
            overall: drafts.overall,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            male: users.male
        })
        .from(drafts)
        .innerJoin(users, eq(drafts.user, users.id))
        .where(inArray(drafts.team, teamIds))
        .orderBy(asc(drafts.round), asc(drafts.overall))

    const picksByTeam = new Map<number, DraftPlayer[]>()
    for (const pick of pickRows) {
        const list = picksByTeam.get(pick.teamId) ?? []
        list.push({
            userId: pick.userId,
            firstName: pick.firstName,
            lastName: pick.lastName,
            preferredName: pick.preferredName,
            round: pick.round,
            overall: pick.overall,
            male: pick.male
        })
        picksByTeam.set(pick.teamId, list)
    }

    return teamRows.map((t) => ({
        ...t,
        players: picksByTeam.get(t.teamId) ?? []
    }))
}
