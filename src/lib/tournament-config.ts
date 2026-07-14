import "server-only"

import { db } from "@/database/db"
import {
    divisions,
    tournaments,
    tournamentDivisions,
    tournamentRoster,
    tournamentTeams,
    waiverAcceptances,
    waivers
} from "@/database/schema"
import { and, asc, count, desc, eq, ne } from "drizzle-orm"
import {
    TOURNAMENT_PHASES,
    type TournamentPhase
} from "@/lib/tournament-phases"

export interface TournamentDivisionConfig {
    // tournament_divisions.id
    id: number
    // divisions.id (league-wide identity, e.g. the row for "A")
    divisionId: number
    // divisions.name — display label (e.g. "A", "BB")
    divisionName: string
    // divisions.level — numeric sort key from the league divisions table
    divisionLevel: number
    teamCount: number
    malePerTeam: number
    nonMalePerTeam: number
    teamsAdvancingPerPool: number
    sortOrder: number
}

export interface TournamentConfig {
    tournamentId: number
    code: string
    name: string
    year: number
    phase: TournamentPhase
    tournamentDate: string
    checkinTime: string | null
    firstServeTime: string | null
    address: string | null
    cost: string
    lateCost: string
    lateDate: string | null
    registrationCloseDate: string | null
    rosterLockDate: string | null
    tournamentType: "coed" | "reverse_coed"
    poolSize: number
    eliminationFormat: "single" | "double"
    divisions: TournamentDivisionConfig[]
}

// rowToDivision was inlined into loadDivisions because it now needs the
// joined divisions.name / divisions.level columns alongside the
// tournament_divisions row.

function rowToConfig(
    t: typeof tournaments.$inferSelect,
    divisions: TournamentDivisionConfig[]
): TournamentConfig {
    return {
        tournamentId: t.id,
        code: t.code,
        name: t.name,
        year: t.year,
        phase: TOURNAMENT_PHASES.includes(t.phase as TournamentPhase)
            ? (t.phase as TournamentPhase)
            : "registration_open",
        tournamentDate: t.tournament_date,
        checkinTime: t.checkin_time,
        firstServeTime: t.first_serve_time,
        address: t.address,
        cost: t.cost || "",
        lateCost: t.late_cost || "",
        lateDate: t.late_date,
        registrationCloseDate: t.registration_close_date,
        rosterLockDate: t.roster_lock_date,
        tournamentType: t.tournament_type as "coed" | "reverse_coed",
        poolSize: t.pool_size,
        eliminationFormat: t.elimination_format as "single" | "double",
        divisions
    }
}

async function loadDivisions(
    tournamentId: number
): Promise<TournamentDivisionConfig[]> {
    const rows = await db
        .select({
            id: tournamentDivisions.id,
            divisionId: tournamentDivisions.division_id,
            divisionName: divisions.name,
            divisionLevel: divisions.level,
            teamCount: tournamentDivisions.team_count,
            malePerTeam: tournamentDivisions.male_per_team,
            nonMalePerTeam: tournamentDivisions.non_male_per_team,
            teamsAdvancingPerPool: tournamentDivisions.teams_advancing_per_pool,
            sortOrder: tournamentDivisions.sort_order
        })
        .from(tournamentDivisions)
        .innerJoin(divisions, eq(divisions.id, tournamentDivisions.division_id))
        .where(eq(tournamentDivisions.tournament_id, tournamentId))
        .orderBy(asc(tournamentDivisions.sort_order))
    return rows
}

/**
 * Latest tournament whose phase is not yet "complete".
 * Mirrors getSeasonConfig() in spirit but returns null when no tournament
 * exists or all are complete — callers handle the empty case.
 */
export async function getTournamentConfig(): Promise<TournamentConfig | null> {
    const [t] = await db
        .select()
        .from(tournaments)
        .where(ne(tournaments.phase, "complete"))
        .orderBy(desc(tournaments.id))
        .limit(1)

    if (!t) return null

    const divisions = await loadDivisions(t.id)
    return rowToConfig(t, divisions)
}

function isPastDateET(date: string): boolean {
    const nowET = new Date(
        new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
    )
    const target = new Date(`${date}T23:59:59`)
    return nowET >= target
}

export function getCurrentTournamentCost(config: TournamentConfig): string {
    if (config.lateDate && config.lateCost && isPastDateET(config.lateDate)) {
        return config.lateCost
    }
    return config.cost
}

export function isRegistrationClosed(config: TournamentConfig): boolean {
    if (config.phase !== "registration_open") return true
    if (
        config.registrationCloseDate &&
        isPastDateET(config.registrationCloseDate)
    ) {
        return true
    }
    return false
}

/**
 * Player signup (interest list + waiver acceptance) stays open after team
 * registration closes: individuals can still sign the waiver through the end
 * of tournament day (ET) so captains/admins can add them to rosters.
 */
export function isPlayerSignupOpen(config: TournamentConfig): boolean {
    if (config.phase === "complete") return false
    return !isPastDateET(config.tournamentDate)
}

export function isRosterLocked(config: TournamentConfig): boolean {
    if (!config.rosterLockDate) return false
    return isPastDateET(config.rosterLockDate)
}

export interface DivisionAvailability {
    divisionId: number
    divisionName: string
    teamCount: number
    maxTeams: number
    full: boolean
}

export interface TournamentAvailability {
    divisions: DivisionAvailability[]
    allDivisionsFull: boolean
}

/**
 * Per-division team counts vs cap, plus an aggregate "all full" flag.
 * "Count" is the number of teams whose **preferred division** matches —
 * during registration this is what consumes a slot. Admin reassignment
 * during the prepare phase can change `division_id` but does not affect
 * signup gating.
 */
export async function getTournamentAvailability(
    config: TournamentConfig
): Promise<TournamentAvailability> {
    const counts = await db
        .select({
            divisionId: tournamentTeams.preferred_division_id,
            n: count()
        })
        .from(tournamentTeams)
        .where(eq(tournamentTeams.tournament_id, config.tournamentId))
        .groupBy(tournamentTeams.preferred_division_id)
    const countByDivision = new Map(counts.map((c) => [c.divisionId, c.n]))

    const rows: DivisionAvailability[] = config.divisions.map((d) => {
        const teamCount = countByDivision.get(d.id) ?? 0
        return {
            divisionId: d.id,
            divisionName: d.divisionName,
            teamCount,
            maxTeams: d.teamCount,
            full: teamCount >= d.teamCount
        }
    })

    return {
        divisions: rows,
        allDivisionsFull: rows.length > 0 && rows.every((r) => r.full)
    }
}

/**
 * Returns true if the given user is already rostered on any team in this
 * tournament. Used to gate the Sign Up button and the express-interest button
 * so a player can't double up.
 */
export async function isUserOnTournamentRoster(
    tournamentId: number,
    userId: string
): Promise<boolean> {
    const [row] = await db
        .select({ id: tournamentRoster.id })
        .from(tournamentRoster)
        .where(
            and(
                eq(tournamentRoster.tournament_id, tournamentId),
                eq(tournamentRoster.user_id, userId)
            )
        )
        .limit(1)
    return !!row
}

/**
 * Returns the active tournament's name if the given user is rostered on a
 * team (other than as a self-added captain) for the active tournament AND
 * has not yet accepted the active waiver. Otherwise null.
 *
 * Drives the dashboard waiver-gate card for captain-added players.
 */
export async function getTournamentWaiverGate(
    userId: string
): Promise<{ tournamentName: string } | null> {
    const config = await getTournamentConfig()
    if (!config) return null

    const [rosterRow] = await db
        .select({
            addedBy: tournamentRoster.added_by_user_id
        })
        .from(tournamentRoster)
        .where(
            and(
                eq(tournamentRoster.tournament_id, config.tournamentId),
                eq(tournamentRoster.user_id, userId)
            )
        )
        .limit(1)
    if (!rosterRow) return null
    // Self-add (captain) already accepted at signup time; skip.
    if (rosterRow.addedBy === userId) return null

    const [activeWaiver] = await db
        .select({ id: waivers.id })
        .from(waivers)
        .where(eq(waivers.active, true))
        .limit(1)
    if (!activeWaiver) return null

    const [accepted] = await db
        .select({ id: waiverAcceptances.id })
        .from(waiverAcceptances)
        .where(
            and(
                eq(waiverAcceptances.user_id, userId),
                eq(waiverAcceptances.waiver_id, activeWaiver.id)
            )
        )
        .limit(1)
    if (accepted) return null

    return { tournamentName: config.name }
}
