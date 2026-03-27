"use server"

import { db } from "@/database/db"
import {
    seasons,
    divisions,
    individual_divisions,
    teams,
    drafts,
    users
} from "@/database/schema"
import { eq, and, asc, desc, inArray } from "drizzle-orm"
import { isAdminOrDirectorBySession } from "@/lib/rbac"

export async function getAvailableYears(): Promise<number[]> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) return []

    const rows = await db
        .selectDistinct({ year: seasons.year })
        .from(seasons)
        .orderBy(desc(seasons.year))

    return rows.map((r) => r.year)
}

export type SeasonOption = { id: number; code: string; season: string }

export async function getSeasonsForYear(year: number): Promise<SeasonOption[]> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) return []

    if (!Number.isInteger(year) || year < 2000 || year > 2100) return []

    return db
        .select({
            id: seasons.id,
            code: seasons.code,
            season: seasons.season
        })
        .from(seasons)
        .where(eq(seasons.year, year))
        .orderBy(asc(seasons.id))
}

export type DivisionOption = { id: number; name: string }

export async function getDivisionsForSeason(
    seasonId: number
): Promise<DivisionOption[]> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) return []

    if (!Number.isInteger(seasonId) || seasonId <= 0) return []

    return db
        .select({
            id: divisions.id,
            name: divisions.name
        })
        .from(individual_divisions)
        .innerJoin(divisions, eq(individual_divisions.division, divisions.id))
        .where(eq(individual_divisions.season, seasonId))
        .orderBy(asc(divisions.level))
}

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

export async function getDraftResults(
    seasonId: number,
    divisionId: number
): Promise<{ status: boolean; teams: DraftTeam[]; message?: string }> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) return { status: false, teams: [], message: "Unauthorized" }

    if (
        !Number.isInteger(seasonId) ||
        seasonId <= 0 ||
        !Number.isInteger(divisionId) ||
        divisionId <= 0
    ) {
        return { status: false, teams: [], message: "Invalid parameters" }
    }

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
        return { status: true, teams: [] }
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

    const result: DraftTeam[] = teamRows.map((t) => ({
        ...t,
        players: picksByTeam.get(t.teamId) ?? []
    }))

    return { status: true, teams: result }
}
