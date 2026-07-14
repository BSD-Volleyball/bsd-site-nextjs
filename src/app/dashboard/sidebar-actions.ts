"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { checkSignupEligibility } from "@/lib/site-config"
import { db } from "@/database/db"
import {
    seasons,
    teams,
    drafts,
    divisions,
    individual_divisions,
    signups
} from "@/database/schema"
import { eq, and, lt, lte, desc, inArray, or } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import {
    isAdminOrDirectorBySession,
    isCommissionerBySession,
    hasCaptainPagesAccessBySession,
    hasPermissionBySession
} from "@/lib/rbac"
import type { SeasonPhase } from "@/lib/season-phases"

export interface SeasonNavDivision {
    id: number
    name: string
    level: number
}

export interface SeasonNavItem {
    id: number
    year: number
    season: string
    divisions: SeasonNavDivision[]
}

export async function getRecentSeasonsNav(): Promise<SeasonNavItem[]> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return []
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return []
        }

        // Once the current season is marked Complete, treat it as historical
        // so it shows up in this list alongside prior seasons.
        const includeCurrent = config.phase === "complete"
        const recentSeasons = await db
            .select({
                id: seasons.id,
                year: seasons.year,
                season: seasons.season
            })
            .from(seasons)
            .where(
                includeCurrent
                    ? lte(seasons.id, config.seasonId)
                    : lt(seasons.id, config.seasonId)
            )
            .orderBy(desc(seasons.id))
            .limit(3)

        if (recentSeasons.length === 0) {
            return []
        }

        const seasonIds = recentSeasons.map((s) => s.id)

        const divisionsWithDrafts = await db
            .selectDistinct({
                seasonId: teams.season,
                divisionId: divisions.id,
                divisionName: divisions.name,
                divisionLevel: divisions.level
            })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .innerJoin(divisions, eq(teams.division, divisions.id))
            .where(inArray(teams.season, seasonIds))
            .orderBy(divisions.level)

        const divisionsBySeasonId = new Map<number, SeasonNavDivision[]>()
        for (const row of divisionsWithDrafts) {
            const arr = divisionsBySeasonId.get(row.seasonId) || []
            arr.push({
                id: row.divisionId,
                name: row.divisionName,
                level: row.divisionLevel
            })
            divisionsBySeasonId.set(row.seasonId, arr)
        }

        return recentSeasons
            .filter((s) => divisionsBySeasonId.has(s.id))
            .map((s) => ({
                id: s.id,
                year: s.year,
                season: s.season,
                divisions: divisionsBySeasonId.get(s.id) || []
            }))
    } catch (error) {
        console.error("Error fetching recent seasons nav:", error)
        return []
    }
}

export interface TournamentSidebarInfo {
    tournamentId: number
    name: string
    phase: string
    canSignUp: boolean
    // Player signup (waiver acceptance) stays open through tournament day
    // even after team registration closes.
    canPlayerSignUp: boolean
    isCaptain: boolean
    isRostered: boolean
    showPoolTools: boolean
    showBracketTools: boolean
}

export interface SidebarData {
    showSignupLink: boolean
    hasCurrentSeasonSignup: boolean
    isAdmin: boolean
    isCommissioner: boolean
    hasCaptainPagesAccess: boolean
    isCoach: boolean
    hasPicturesAccess: boolean
    hasScoresAccess: boolean
    hasConcernsAccess: boolean
    isReferee: boolean
    isRefCoordinator: boolean
    seasonNav: SeasonNavItem[]
    phase: SeasonPhase | null
    tournament: TournamentSidebarInfo | null
}

export async function getSidebarData(): Promise<SidebarData> {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return {
            showSignupLink: false,
            hasCurrentSeasonSignup: false,
            isAdmin: false,
            isCommissioner: false,
            hasCaptainPagesAccess: false,
            isCoach: false,
            hasPicturesAccess: false,
            hasScoresAccess: false,
            hasConcernsAccess: false,
            isReferee: false,
            isRefCoordinator: false,
            seasonNav: [],
            phase: null,
            tournament: null
        }
    }

    const config = await getSeasonConfig()
    const seasonId = config.seasonId

    const [
        showSignupLink,
        hasCurrentSeasonSignup,
        isAdmin,
        isCommissioner,
        hasCaptainPagesAccess,
        hasPicturesAccess,
        hasScoresAccess,
        hasConcernsAccess,
        isReferee,
        isRefCoordinator,
        seasonNav,
        isCoach
    ] = await Promise.all([
        checkSignupEligibility(session.user.id),
        seasonId
            ? (async () => {
                  const [signup] = await db
                      .select({ id: signups.id })
                      .from(signups)
                      .where(
                          and(
                              eq(signups.season, seasonId),
                              eq(signups.player, session.user.id)
                          )
                      )
                      .limit(1)
                  return !!signup
              })()
            : Promise.resolve(false),
        isAdminOrDirectorBySession(),
        isCommissionerBySession(),
        hasCaptainPagesAccessBySession(),
        seasonId
            ? hasPermissionBySession("pictures:manage", { seasonId })
            : Promise.resolve(false),
        seasonId
            ? hasPermissionBySession("scores:enter", { seasonId })
            : Promise.resolve(false),
        seasonId
            ? hasPermissionBySession("concerns:view", { seasonId })
            : Promise.resolve(false),
        seasonId
            ? hasPermissionBySession("schedule:view", { seasonId })
            : Promise.resolve(false),
        seasonId
            ? hasPermissionBySession("schedule:manage", { seasonId })
            : Promise.resolve(false),
        getRecentSeasonsNav(),
        seasonId
            ? (async () => {
                  const [coachEntry] = await db
                      .select({ id: teams.id })
                      .from(teams)
                      .innerJoin(
                          individual_divisions,
                          and(
                              eq(individual_divisions.season, seasonId),
                              eq(individual_divisions.division, teams.division),
                              eq(individual_divisions.coaches, true)
                          )
                      )
                      .where(
                          and(
                              eq(teams.season, seasonId),
                              or(
                                  eq(teams.captain, session.user.id),
                                  eq(teams.captain2, session.user.id)
                              )
                          )
                      )
                      .limit(1)
                  return !!coachEntry
              })()
            : Promise.resolve(false)
    ])

    const tournament = await getTournamentSidebarInfo(session.user.id)

    return {
        showSignupLink,
        hasCurrentSeasonSignup,
        isAdmin,
        isCommissioner,
        hasCaptainPagesAccess,
        isCoach,
        hasPicturesAccess,
        hasScoresAccess,
        hasConcernsAccess,
        isReferee,
        isRefCoordinator,
        seasonNav,
        phase: seasonId ? config.phase : null,
        tournament
    }
}

async function getTournamentSidebarInfo(
    userId: string
): Promise<TournamentSidebarInfo | null> {
    const {
        getTournamentAvailability,
        getTournamentConfig,
        isPlayerSignupOpen,
        isRegistrationClosed
    } = await import("@/lib/tournament-config")
    const { TOURNAMENT_PHASE_CONFIG } = await import("@/lib/tournament-phases")
    const { tournamentRoster, tournamentTeams } = await import(
        "@/database/schema"
    )

    const config = await getTournamentConfig()
    if (!config) return null

    const [rosterRow] = await db
        .select({ teamId: tournamentRoster.team_id })
        .from(tournamentRoster)
        .where(
            and(
                eq(tournamentRoster.tournament_id, config.tournamentId),
                eq(tournamentRoster.user_id, userId)
            )
        )
        .limit(1)
    const isRostered = !!rosterRow

    let isCaptain = false
    if (rosterRow) {
        const [team] = await db
            .select({ captain: tournamentTeams.captain_user_id })
            .from(tournamentTeams)
            .where(eq(tournamentTeams.id, rosterRow.teamId))
            .limit(1)
        isCaptain = team?.captain === userId
    }

    const phaseCfg =
        TOURNAMENT_PHASE_CONFIG[
            config.phase as keyof typeof TOURNAMENT_PHASE_CONFIG
        ]
    const registrationOpen =
        phaseCfg?.showRegistration === true && !isRegistrationClosed(config)
    const allDivisionsFull = registrationOpen
        ? (await getTournamentAvailability(config)).allDivisionsFull
        : false
    const canSignUp = registrationOpen && !isRostered && !allDivisionsFull
    const canPlayerSignUp = isPlayerSignupOpen(config) && !isRostered

    return {
        tournamentId: config.tournamentId,
        name: config.name,
        phase: config.phase,
        canSignUp,
        canPlayerSignUp,
        isCaptain,
        isRostered,
        showPoolTools: phaseCfg?.showPoolTools === true,
        showBracketTools: phaseCfg?.showBracketTools === true
    }
}
