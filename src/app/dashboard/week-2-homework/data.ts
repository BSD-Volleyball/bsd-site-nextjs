import "server-only"

import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { and, asc, count, eq, or } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { getSessionUser } from "@/next/session"
import { db } from "@/database/db"
import {
    divisions,
    individual_divisions,
    movingDay,
    seasons,
    signups,
    teams,
    users,
    week2Rosters
} from "@/database/schema"
import { getSeasonConfig } from "@/lib/site-config"

export interface Week2Player {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    oldId: number
    male: boolean | null
    isCaptain: boolean
    teamNumber: number
    divisionId: number
    pairPickName: string | null
    pairPickUserId: string | null
}

export interface ExistingSubmission {
    id: number
    playerId: string
    direction: "up" | "down"
    isForced: boolean
}

export interface SeasonInfo {
    id: number
    year: number
    name: string
}

export interface Week2HomeworkData {
    seasonId: number
    divisionId: number
    divisionName: string
    divisionLevel: number
    teamNumber: number
    captainUserId: string
    teamRoster: Week2Player[]
    allTryoutPlayers: Week2Player[]
    isTopDivision: boolean
    isBottomDivision: boolean
    existingSubmissions: ExistingSubmission[]
    allSeasons: SeasonInfo[]
}

export interface CoachTeamRoster {
    teamNumber: number
    players: Week2Player[]
}

export interface CoachExistingSubmission {
    id: number
    playerId: string
    direction: "up" | "down"
    isForced: boolean
    teamNumber: number | null
}

export interface CoachWeek2HomeworkData {
    seasonId: number
    divisionId: number
    divisionName: string
    divisionLevel: number
    coachUserId: string
    isTopDivision: boolean
    isBottomDivision: boolean
    divisionTeams: CoachTeamRoster[]
    allTryoutPlayers: Week2Player[]
    existingSubmissions: CoachExistingSubmission[]
    allSeasons: SeasonInfo[]
}

export type Week2HomeworkView =
    | { mode: "captain"; homework: Week2HomeworkData }
    | { mode: "coach"; homework: CoachWeek2HomeworkData }

export const getWeek2HomeworkData = withAction(
    async (): Promise<ActionResult<Week2HomeworkView>> => {
        const sessionUser = await getSessionUser()

        if (!sessionUser) {
            return fail("Not authenticated")
        }

        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return fail("No active season found")
        }

        const [{ seasonRosterCount }] = await db
            .select({ seasonRosterCount: count() })
            .from(week2Rosters)
            .where(eq(week2Rosters.season, config.seasonId))

        if (seasonRosterCount === 0) {
            return fail(
                "Teams haven't been created yet for this season. Check back after Week 2 tryouts."
            )
        }

        const [captainEntry] = await db
            .select({
                userId: week2Rosters.user,
                divisionId: week2Rosters.division,
                teamNumber: week2Rosters.team_number
            })
            .from(week2Rosters)
            .where(
                and(
                    eq(week2Rosters.season, config.seasonId),
                    eq(week2Rosters.user, sessionUser.id),
                    eq(week2Rosters.is_captain, true)
                )
            )
            .limit(1)

        if (!captainEntry) {
            // Check if user is a coach in a coaches-mode division
            const [coachTeamEntry] = await db
                .select({ divisionId: teams.division })
                .from(teams)
                .where(
                    and(
                        eq(teams.season, config.seasonId),
                        or(
                            eq(teams.captain, sessionUser.id),
                            eq(teams.captain2, sessionUser.id)
                        )
                    )
                )
                .limit(1)

            if (!coachTeamEntry) {
                return fail(
                    "You were not a captain or coach in Week 2 for this season. This page is only available to Week 2 captains and coaches."
                )
            }

            const [coachIndivDiv] = await db
                .select({ coaches: individual_divisions.coaches })
                .from(individual_divisions)
                .where(
                    and(
                        eq(individual_divisions.season, config.seasonId),
                        eq(
                            individual_divisions.division,
                            coachTeamEntry.divisionId
                        )
                    )
                )
                .limit(1)

            if (!coachIndivDiv?.coaches) {
                return fail(
                    "You were not a captain or coach in Week 2 for this season. This page is only available to Week 2 captains and coaches."
                )
            }

            const [coachDivisionInfo] = await db
                .select({ name: divisions.name, level: divisions.level })
                .from(divisions)
                .where(eq(divisions.id, coachTeamEntry.divisionId))
                .limit(1)

            if (!coachDivisionInfo) {
                return fail("Division not found")
            }

            const coachAllActiveDivisions = await db
                .select({ level: divisions.level })
                .from(divisions)
                .where(eq(divisions.active, true))

            const coachLevels = coachAllActiveDivisions.map((d) => d.level)
            const coachMinLevel = Math.min(...coachLevels)
            const coachMaxLevel = Math.max(...coachLevels)

            const coachRosterRows = await db
                .select({
                    userId: week2Rosters.user,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preferred_name,
                    oldId: users.old_id,
                    male: users.male,
                    isCaptain: week2Rosters.is_captain,
                    teamNumber: week2Rosters.team_number,
                    divisionId: week2Rosters.division
                })
                .from(week2Rosters)
                .innerJoin(users, eq(week2Rosters.user, users.id))
                .where(
                    and(
                        eq(week2Rosters.season, config.seasonId),
                        eq(week2Rosters.division, coachTeamEntry.divisionId)
                    )
                )
                .orderBy(
                    asc(week2Rosters.team_number),
                    asc(users.last_name),
                    asc(users.first_name)
                )

            const teamMap = new Map<number, Week2Player[]>()
            for (const row of coachRosterRows) {
                const player: Week2Player = {
                    userId: row.userId,
                    firstName: row.firstName,
                    lastName: row.lastName,
                    preferredName: row.preferredName,
                    oldId: row.oldId,
                    male: row.male,
                    isCaptain: row.isCaptain,
                    teamNumber: row.teamNumber,
                    divisionId: row.divisionId,
                    pairPickName: null,
                    pairPickUserId: null
                }
                if (!teamMap.has(row.teamNumber)) {
                    teamMap.set(row.teamNumber, [])
                }
                teamMap.get(row.teamNumber)!.push(player)
            }

            const divisionTeams: CoachTeamRoster[] = Array.from(
                teamMap.entries()
            )
                .sort(([a], [b]) => a - b)
                .map(([teamNumber, players]) => ({ teamNumber, players }))

            const coachAllTryoutPlayerRows = await db
                .select({
                    userId: week2Rosters.user,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preferred_name,
                    oldId: users.old_id,
                    male: users.male,
                    isCaptain: week2Rosters.is_captain,
                    teamNumber: week2Rosters.team_number,
                    divisionId: week2Rosters.division
                })
                .from(week2Rosters)
                .innerJoin(users, eq(week2Rosters.user, users.id))
                .where(eq(week2Rosters.season, config.seasonId))
                .orderBy(
                    asc(week2Rosters.division),
                    asc(week2Rosters.team_number),
                    asc(users.last_name),
                    asc(users.first_name)
                )

            const coachSeenUserIds = new Set<string>()
            const coachAllTryoutPlayers: Week2Player[] =
                coachAllTryoutPlayerRows
                    .filter((row) => {
                        if (coachSeenUserIds.has(row.userId)) return false
                        coachSeenUserIds.add(row.userId)
                        return true
                    })
                    .map((row) => ({
                        ...row,
                        pairPickName: null,
                        pairPickUserId: null
                    }))

            // Load existing submissions; join week2Rosters to recover which team
            // each forced pick belongs to (needed to pre-populate the form).
            const existingCoachRows = await db
                .select({
                    id: movingDay.id,
                    playerId: movingDay.player,
                    direction: movingDay.direction,
                    isForced: movingDay.is_forced,
                    teamNumber: week2Rosters.team_number
                })
                .from(movingDay)
                .leftJoin(
                    week2Rosters,
                    and(
                        eq(week2Rosters.user, movingDay.player),
                        eq(week2Rosters.season, config.seasonId),
                        eq(week2Rosters.division, coachTeamEntry.divisionId)
                    )
                )
                .where(
                    and(
                        eq(movingDay.season, config.seasonId),
                        eq(movingDay.submitted_by, sessionUser.id)
                    )
                )

            const coachAllSeasonRows = await db
                .select({
                    id: seasons.id,
                    year: seasons.year,
                    name: seasons.season
                })
                .from(seasons)
                .orderBy(asc(seasons.id))

            return ok(
                {
                    mode: "coach",
                    homework: {
                        seasonId: config.seasonId,
                        divisionId: coachTeamEntry.divisionId,
                        divisionName: coachDivisionInfo.name,
                        divisionLevel: coachDivisionInfo.level,
                        coachUserId: sessionUser.id,
                        isTopDivision:
                            coachDivisionInfo.level === coachMinLevel,
                        isBottomDivision:
                            coachDivisionInfo.level === coachMaxLevel,
                        divisionTeams,
                        allTryoutPlayers: coachAllTryoutPlayers,
                        existingSubmissions: existingCoachRows.map((r) => ({
                            id: r.id,
                            playerId: r.playerId,
                            direction: r.direction as "up" | "down",
                            isForced: r.isForced,
                            teamNumber: r.teamNumber ?? null
                        })),
                        allSeasons: coachAllSeasonRows.map((s) => ({
                            id: s.id,
                            year: s.year,
                            name: s.name
                        }))
                    } satisfies CoachWeek2HomeworkData
                },
                "Success"
            )
        }

        const [divisionInfo] = await db
            .select({ name: divisions.name, level: divisions.level })
            .from(divisions)
            .where(eq(divisions.id, captainEntry.divisionId))
            .limit(1)

        if (!divisionInfo) {
            return fail("Division not found")
        }

        const allActiveDivisions = await db
            .select({ level: divisions.level })
            .from(divisions)
            .where(eq(divisions.active, true))

        const levels = allActiveDivisions.map((d) => d.level)
        const minLevel = Math.min(...levels)
        const maxLevel = Math.max(...levels)

        const pairPickUser = alias(users, "pair_pick_user")

        const teamRosterRows = await db
            .select({
                userId: week2Rosters.user,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                oldId: users.old_id,
                male: users.male,
                isCaptain: week2Rosters.is_captain,
                teamNumber: week2Rosters.team_number,
                divisionId: week2Rosters.division,
                pairPickFirstName: pairPickUser.first_name,
                pairPickLastName: pairPickUser.last_name,
                pairPickPreferredName: pairPickUser.preferred_name,
                pairPickUserId: pairPickUser.id
            })
            .from(week2Rosters)
            .innerJoin(users, eq(week2Rosters.user, users.id))
            .leftJoin(
                signups,
                and(
                    eq(signups.player, week2Rosters.user),
                    eq(signups.season, config.seasonId)
                )
            )
            .leftJoin(pairPickUser, eq(pairPickUser.id, signups.pair_pick))
            .where(
                and(
                    eq(week2Rosters.season, config.seasonId),
                    eq(week2Rosters.division, captainEntry.divisionId),
                    eq(week2Rosters.team_number, captainEntry.teamNumber)
                )
            )
            .orderBy(asc(users.last_name), asc(users.first_name))

        const mappedTeamRoster: Week2Player[] = teamRosterRows.map((row) => {
            const pairName = row.pairPickFirstName
                ? (row.pairPickPreferredName ?? row.pairPickFirstName) +
                  " " +
                  row.pairPickLastName
                : null
            return {
                userId: row.userId,
                firstName: row.firstName,
                lastName: row.lastName,
                preferredName: row.preferredName,
                oldId: row.oldId,
                male: row.male,
                isCaptain: row.isCaptain,
                teamNumber: row.teamNumber,
                divisionId: row.divisionId,
                pairPickName: pairName,
                pairPickUserId: row.pairPickUserId ?? null
            }
        })

        const allTryoutPlayerRows = await db
            .select({
                userId: week2Rosters.user,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                oldId: users.old_id,
                male: users.male,
                isCaptain: week2Rosters.is_captain,
                teamNumber: week2Rosters.team_number,
                divisionId: week2Rosters.division
            })
            .from(week2Rosters)
            .innerJoin(users, eq(week2Rosters.user, users.id))
            .where(eq(week2Rosters.season, config.seasonId))
            .orderBy(
                asc(week2Rosters.division),
                asc(week2Rosters.team_number),
                asc(users.last_name),
                asc(users.first_name)
            )

        // Deduplicate (players may appear in multiple teams)
        const seenUserIds = new Set<string>()
        const dedupedAllTryoutPlayers: Week2Player[] = allTryoutPlayerRows
            .filter((row) => {
                if (seenUserIds.has(row.userId)) return false
                seenUserIds.add(row.userId)
                return true
            })
            .map((row) => ({
                ...row,
                pairPickName: null,
                pairPickUserId: null
            }))

        const existingRows = await db
            .select({
                id: movingDay.id,
                playerId: movingDay.player,
                direction: movingDay.direction,
                isForced: movingDay.is_forced
            })
            .from(movingDay)
            .where(
                and(
                    eq(movingDay.season, config.seasonId),
                    eq(movingDay.submitted_by, sessionUser.id)
                )
            )

        const allSeasonRows = await db
            .select({
                id: seasons.id,
                year: seasons.year,
                name: seasons.season
            })
            .from(seasons)
            .orderBy(asc(seasons.id))

        return ok(
            {
                mode: "captain",
                homework: {
                    seasonId: config.seasonId,
                    divisionId: captainEntry.divisionId,
                    divisionName: divisionInfo.name,
                    divisionLevel: divisionInfo.level,
                    teamNumber: captainEntry.teamNumber,
                    captainUserId: sessionUser.id,
                    teamRoster: mappedTeamRoster,
                    allTryoutPlayers: dedupedAllTryoutPlayers,
                    isTopDivision: divisionInfo.level === minLevel,
                    isBottomDivision: divisionInfo.level === maxLevel,
                    existingSubmissions: existingRows.map((r) => ({
                        id: r.id,
                        playerId: r.playerId,
                        direction: r.direction as "up" | "down",
                        isForced: r.isForced
                    })),
                    allSeasons: allSeasonRows.map((s) => ({
                        id: s.id,
                        year: s.year,
                        name: s.name
                    }))
                } satisfies Week2HomeworkData
            },
            "Success"
        )
    }
)
