import "server-only"

import { playerPicBaseUrl } from "@/config/env"
import { db } from "@/database/db"
import {
    seasons,
    signups,
    users,
    drafts,
    teams,
    divisions,
    individual_divisions,
    waitlist,
    champions,
    evaluations,
    userUnavailability,
    seasonEvents,
    userRoles
} from "@/database/schema"
import { eq, and, desc, count, inArray, isNotNull } from "drizzle-orm"
import { getSeasonConfig, formatEventDate } from "@/lib/site-config"
import { buildPlayerPictureUrl, formatDisplayName } from "@/lib/utils"

export async function getSeasonSignup(userId: string) {
    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return {
            season: null,
            signup: null,
            pairPickName: null,
            config,
            seasonFull: false,
            onWaitlist: false,
            waitlistApproved: false
        }
    }

    const season = { id: config.seasonId }

    // Check if user has a signup for this season
    const [signup] = await db
        .select()
        .from(signups)
        .where(and(eq(signups.season, season.id), eq(signups.player, userId)))
        .limit(1)

    // If there's a pair pick, get their name
    let pairPickName: string | null = null
    if (signup?.pair_pick) {
        const [pairUser] = await db
            .select({
                first_name: users.first_name,
                last_name: users.last_name
            })
            .from(users)
            .where(eq(users.id, signup.pair_pick))
            .limit(1)

        if (pairUser) {
            pairPickName =
                [pairUser.first_name, pairUser.last_name]
                    .filter(Boolean)
                    .join(" ") || null
        }
    }

    // Check if season is full
    let seasonFull = false
    const maxPlayers = config.maxPlayers
    if (maxPlayers > 0 && !signup) {
        const [result] = await db
            .select({ total: count() })
            .from(signups)
            .where(eq(signups.season, season.id))

        if (result && result.total >= maxPlayers) {
            seasonFull = true
        }
    }

    // Check if user is on the waitlist
    let onWaitlist = false
    let waitlistApproved = false
    if (!signup) {
        const [waitlistEntry] = await db
            .select({ id: waitlist.id, approved: waitlist.approved })
            .from(waitlist)
            .where(
                and(eq(waitlist.season, season.id), eq(waitlist.user, userId))
            )
            .limit(1)

        onWaitlist = !!waitlistEntry
        waitlistApproved = waitlistEntry?.approved ?? false
    }

    // Fetch player unavailability for this signup
    let unavailableDates: string | null = null
    if (signup) {
        const unavailRows = await db
            .select({ eventDate: seasonEvents.event_date })
            .from(userUnavailability)
            .innerJoin(
                seasonEvents,
                eq(seasonEvents.id, userUnavailability.event_id)
            )
            .where(eq(userUnavailability.signup_id, signup.id))

        if (unavailRows.length > 0) {
            unavailableDates = unavailRows
                .map((u) => formatEventDate(u.eventDate))
                .join(", ")
        }
    }

    return {
        season,
        signup,
        pairPickName,
        unavailableDates,
        config,
        seasonFull,
        onWaitlist,
        waitlistApproved
    }
}

export type SeasonSignupStatus = NonNullable<
    Awaited<ReturnType<typeof getSeasonSignup>>
>

export interface PreviousSeason {
    year: number
    season: string
    divisionName: string
    teamName: string
    captainName: string
    teamId: number
    champion: boolean
    championPicture: string | null
    teamPhotoUrl: string
}

export async function getPreviousSeasonsPlayed(
    userId: string
): Promise<PreviousSeason[]> {
    const results = await db
        .select({
            year: seasons.year,
            season: seasons.season,
            divisionName: divisions.name,
            teamName: teams.name,
            teamId: teams.id,
            captainFirstName: users.first_name,
            captainLastName: users.last_name,
            captainPreferredName: users.preferred_name,
            championId: champions.id,
            championPicture: champions.picture,
            teamPictureUrl: teams.picture_url
        })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .innerJoin(seasons, eq(teams.season, seasons.id))
        .innerJoin(divisions, eq(teams.division, divisions.id))
        .innerJoin(users, eq(teams.captain, users.id))
        .leftJoin(champions, eq(teams.id, champions.team))
        .where(eq(drafts.user, userId))
        .orderBy(desc(seasons.year), desc(seasons.id))

    return results.map((r) => ({
        year: r.year,
        season: r.season,
        divisionName: r.divisionName,
        teamName: r.teamName,
        teamId: r.teamId,
        captainName: formatDisplayName(
            r.captainFirstName,
            r.captainLastName,
            r.captainPreferredName
        ),
        champion: !!r.championId,
        championPicture: r.championPicture,
        teamPhotoUrl: buildPlayerPictureUrl(
            playerPicBaseUrl(),
            r.teamPictureUrl
        )
    }))
}

export async function getNewPlayerEvalStats(
    userId: string,
    seasonId: number
): Promise<{ totalNew: number; ratedByUser: number }> {
    // Get all signed-up players for this season
    const signedUpUsers = await db
        .select({ userId: signups.player })
        .from(signups)
        .where(eq(signups.season, seasonId))

    const userIds = signedUpUsers.map((r) => r.userId)
    if (userIds.length === 0) return { totalNew: 0, ratedByUser: 0 }

    // Find which have been drafted before (not new)
    const draftedUsers = await db
        .select({ user: drafts.user })
        .from(drafts)
        .where(inArray(drafts.user, userIds))

    const draftedUserIds = new Set(draftedUsers.map((d) => d.user))
    const newPlayerIds = userIds.filter((id) => !draftedUserIds.has(id))
    const totalNew = newPlayerIds.length

    if (totalNew === 0) return { totalNew: 0, ratedByUser: 0 }

    // Count how many the current user has evaluated this season
    const [result] = await db
        .select({ total: count() })
        .from(evaluations)
        .where(
            and(
                eq(evaluations.season, seasonId),
                eq(evaluations.evaluator, userId),
                inArray(evaluations.player, newPlayerIds)
            )
        )

    return { totalNew, ratedByUser: result?.total ?? 0 }
}

export interface CaptainSelectionDivisionStatus {
    divisionId: number
    divisionName: string
    requiredTeams: number
    teamsWithCaptain: number
    isComplete: boolean
}

export async function getAllDivisionCaptainSelectionStatus(
    seasonId: number
): Promise<CaptainSelectionDivisionStatus[]> {
    const divisionTargets = await db
        .select({
            divisionId: individual_divisions.division,
            divisionName: divisions.name,
            requiredTeams: individual_divisions.teams
        })
        .from(individual_divisions)
        .innerJoin(divisions, eq(individual_divisions.division, divisions.id))
        .where(eq(individual_divisions.season, seasonId))
        .orderBy(divisions.level)

    if (divisionTargets.length === 0) return []

    const captainCounts = await db
        .select({
            divisionId: teams.division,
            total: count()
        })
        .from(teams)
        .where(
            and(
                eq(teams.season, seasonId),
                inArray(
                    teams.division,
                    divisionTargets.map((d) => d.divisionId)
                ),
                isNotNull(teams.captain)
            )
        )
        .groupBy(teams.division)

    const countByDivisionId = new Map(
        captainCounts.map((row) => [row.divisionId, row.total])
    )

    return divisionTargets.map((division) => {
        const teamsWithCaptain = countByDivisionId.get(division.divisionId) ?? 0
        return {
            divisionId: division.divisionId,
            divisionName: division.divisionName,
            requiredTeams: division.requiredTeams,
            teamsWithCaptain,
            isComplete:
                division.requiredTeams > 0 &&
                teamsWithCaptain === division.requiredTeams
        }
    })
}

export async function getCommissionerCaptainSelectionStatus(
    userId: string,
    seasonId: number
): Promise<CaptainSelectionDivisionStatus[]> {
    const commissionerDivisions = await db
        .select({
            divisionId: divisions.id,
            divisionName: divisions.name,
            requiredTeams: individual_divisions.teams
        })
        .from(userRoles)
        .innerJoin(divisions, eq(userRoles.division_id, divisions.id))
        .leftJoin(
            individual_divisions,
            and(
                eq(individual_divisions.season, seasonId),
                eq(individual_divisions.division, userRoles.division_id)
            )
        )
        .where(
            and(
                eq(userRoles.role, "commissioner"),
                eq(userRoles.season_id, seasonId),
                eq(userRoles.user_id, userId)
            )
        )
        .orderBy(divisions.level)

    if (commissionerDivisions.length === 0) return []

    const captainCounts = await db
        .select({
            divisionId: teams.division,
            total: count()
        })
        .from(teams)
        .where(
            and(
                eq(teams.season, seasonId),
                inArray(
                    teams.division,
                    commissionerDivisions.map((d) => d.divisionId)
                ),
                isNotNull(teams.captain)
            )
        )
        .groupBy(teams.division)

    const countByDivisionId = new Map(
        captainCounts.map((row) => [row.divisionId, row.total])
    )

    return commissionerDivisions.map((division) => {
        const requiredTeams = division.requiredTeams ?? 0
        const teamsWithCaptain = countByDivisionId.get(division.divisionId) ?? 0
        return {
            divisionId: division.divisionId,
            divisionName: division.divisionName,
            requiredTeams,
            teamsWithCaptain,
            isComplete: requiredTeams > 0 && teamsWithCaptain === requiredTeams
        }
    })
}
