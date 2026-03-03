"use server"

import { and, asc, count, eq } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import {
    divisions,
    movingDay,
    seasons,
    signups,
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

export async function getWeek2HomeworkData(): Promise<{
    status: boolean
    message: string
    data?: Week2HomeworkData
}> {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return { status: false, message: "Not authenticated" }
    }

    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return { status: false, message: "No active season found" }
    }

    const [{ seasonRosterCount }] = await db
        .select({ seasonRosterCount: count() })
        .from(week2Rosters)
        .where(eq(week2Rosters.season, config.seasonId))

    if (seasonRosterCount === 0) {
        return {
            status: false,
            message: "Teams haven't been created yet for this season. Check back after Week 2 tryouts."
        }
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
                eq(week2Rosters.user, session.user.id),
                eq(week2Rosters.is_captain, true)
            )
        )
        .limit(1)

    if (!captainEntry) {
        return {
            status: false,
            message:
                "You were not a captain in Week 2 for this season. This page is only available to Week 2 captains."
        }
    }

    const [divisionInfo] = await db
        .select({ name: divisions.name, level: divisions.level })
        .from(divisions)
        .where(eq(divisions.id, captainEntry.divisionId))
        .limit(1)

    if (!divisionInfo) {
        return { status: false, message: "Division not found" }
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
            preferredName: users.preffered_name,
            oldId: users.old_id,
            male: users.male,
            isCaptain: week2Rosters.is_captain,
            teamNumber: week2Rosters.team_number,
            divisionId: week2Rosters.division,
            pairPickFirstName: pairPickUser.first_name,
            pairPickLastName: pairPickUser.last_name,
            pairPickPreferredName: pairPickUser.preffered_name,
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
            preferredName: users.preffered_name,
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
        .map((row) => ({ ...row, pairPickName: null, pairPickUserId: null }))

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
                eq(movingDay.submitted_by, session.user.id)
            )
        )

    const allSeasonRows = await db
        .select({ id: seasons.id, year: seasons.year, name: seasons.season })
        .from(seasons)
        .orderBy(asc(seasons.id))

    return {
        status: true,
        message: "Success",
        data: {
            seasonId: config.seasonId,
            divisionId: captainEntry.divisionId,
            divisionName: divisionInfo.name,
            divisionLevel: divisionInfo.level,
            teamNumber: captainEntry.teamNumber,
            captainUserId: session.user.id,
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
        }
    }
}

export interface SubmitWeek2HomeworkInput {
    forcedMoveUpMale: string
    forcedMoveUpNonMale: string
    forcedMoveDownMale: string
    forcedMoveDownNonMale: string
    recommendedMoveUp: string[]
    recommendedMoveDown: string[]
}

export async function submitWeek2Homework(
    input: SubmitWeek2HomeworkInput
): Promise<{ status: boolean; message: string }> {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return { status: false, message: "Not authenticated" }
    }

    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return { status: false, message: "No active season found" }
    }

    const [captainEntry] = await db
        .select({
            divisionId: week2Rosters.division,
            teamNumber: week2Rosters.team_number
        })
        .from(week2Rosters)
        .where(
            and(
                eq(week2Rosters.season, config.seasonId),
                eq(week2Rosters.user, session.user.id),
                eq(week2Rosters.is_captain, true)
            )
        )
        .limit(1)

    if (!captainEntry) {
        return {
            status: false,
            message: "You were not a captain in Week 2 for this season"
        }
    }

    const [divisionInfo] = await db
        .select({ level: divisions.level })
        .from(divisions)
        .where(eq(divisions.id, captainEntry.divisionId))
        .limit(1)

    const allActiveDivisions = await db
        .select({ level: divisions.level })
        .from(divisions)
        .where(eq(divisions.active, true))

    const levels = allActiveDivisions.map((d) => d.level)
    const minLevel = Math.min(...levels)
    const maxLevel = Math.max(...levels)

    const isTopDivision = divisionInfo?.level === minLevel
    const isBottomDivision = divisionInfo?.level === maxLevel

    if (!isTopDivision) {
        if (!input.forcedMoveUpMale) {
            return {
                status: false,
                message: "Please select a male player to move up"
            }
        }
        if (!input.forcedMoveUpNonMale) {
            return {
                status: false,
                message: "Please select a non-male player to move up"
            }
        }
    }

    if (!isBottomDivision) {
        if (!input.forcedMoveDownMale) {
            return {
                status: false,
                message: "Please select a male player to move down"
            }
        }
        if (!input.forcedMoveDownNonMale) {
            return {
                status: false,
                message: "Please select a non-male player to move down"
            }
        }
    }

    type Entry = {
        player: string
        direction: "up" | "down"
        is_forced: boolean
    }

    const entries: Entry[] = []

    if (!isTopDivision && input.forcedMoveUpMale) {
        entries.push({
            player: input.forcedMoveUpMale,
            direction: "up",
            is_forced: true
        })
    }
    if (!isTopDivision && input.forcedMoveUpNonMale) {
        entries.push({
            player: input.forcedMoveUpNonMale,
            direction: "up",
            is_forced: true
        })
    }
    if (!isBottomDivision && input.forcedMoveDownMale) {
        entries.push({
            player: input.forcedMoveDownMale,
            direction: "down",
            is_forced: true
        })
    }
    if (!isBottomDivision && input.forcedMoveDownNonMale) {
        entries.push({
            player: input.forcedMoveDownNonMale,
            direction: "down",
            is_forced: true
        })
    }

    for (const userId of input.recommendedMoveUp) {
        if (userId) {
            entries.push({ player: userId, direction: "up", is_forced: false })
        }
    }

    for (const userId of input.recommendedMoveDown) {
        if (userId) {
            entries.push({
                player: userId,
                direction: "down",
                is_forced: false
            })
        }
    }

    await db
        .delete(movingDay)
        .where(
            and(
                eq(movingDay.season, config.seasonId),
                eq(movingDay.submitted_by, session.user.id)
            )
        )

    if (entries.length > 0) {
        await db.insert(movingDay).values(
            entries.map((e) => ({
                season: config.seasonId as number,
                submitted_by: session.user.id,
                player: e.player,
                direction: e.direction,
                is_forced: e.is_forced
            }))
        )
    }

    return { status: true, message: "Homework submitted successfully!" }
}
