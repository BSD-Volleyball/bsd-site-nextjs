"use server"

import { formatTryoutTeamLabel } from "@/lib/tryout-team-names"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { and, eq, or } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import { getSessionUser } from "@/next/session"
import { db } from "@/database/db"
import {
    divisions,
    individual_divisions,
    movingDay,
    teams,
    users,
    week2Rosters
} from "@/database/schema"
import { getSeasonConfig } from "@/lib/site-config"

/**
 * Replace one submitter's moving-day picks wholesale. Delete and insert share
 * a transaction: a failed insert must not leave the submitter with no picks.
 */
async function replaceMovingDayPicks(
    seasonId: number,
    submitterId: string,
    entries: {
        player: string
        direction: (typeof movingDay.$inferInsert)["direction"]
        is_forced: boolean
    }[]
): Promise<void> {
    await db.transaction(async (tx) => {
        await tx
            .delete(movingDay)
            .where(
                and(
                    eq(movingDay.season, seasonId),
                    eq(movingDay.submitted_by, submitterId)
                )
            )
        if (entries.length > 0) {
            await tx.insert(movingDay).values(
                entries.map((e) => ({
                    season: seasonId,
                    submitted_by: submitterId,
                    player: e.player,
                    direction: e.direction,
                    is_forced: e.is_forced
                }))
            )
        }
    })
}

export interface SubmitCoachWeek2HomeworkInput {
    forcedMoveUpByTeam: { teamNumber: number; playerId: string }[]
    recommendedMoveUp: string[]
    recommendedMoveDown: string[]
}

export interface SubmitWeek2HomeworkInput {
    forcedMoveUpMale: string
    forcedMoveUpNonMale: string
    forcedMoveDownMale: string
    forcedMoveDownNonMale: string
    recommendedMoveUp: string[]
    recommendedMoveDown: string[]
}

export const submitWeek2Homework = withAction(
    async (input: SubmitWeek2HomeworkInput): Promise<ActionResult> => {
        const sessionUser = await getSessionUser()

        if (!sessionUser) {
            return fail("Not authenticated")
        }

        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return fail("No active season found")
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
                    eq(week2Rosters.user, sessionUser.id),
                    eq(week2Rosters.is_captain, true)
                )
            )
            .limit(1)

        if (!captainEntry) {
            return fail("You were not a captain in Week 2 for this season")
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

        const teamNonCaptainRows = await db
            .select({ male: users.male })
            .from(week2Rosters)
            .innerJoin(users, eq(week2Rosters.user, users.id))
            .where(
                and(
                    eq(week2Rosters.season, config.seasonId),
                    eq(week2Rosters.division, captainEntry.divisionId),
                    eq(week2Rosters.team_number, captainEntry.teamNumber),
                    eq(week2Rosters.is_captain, false)
                )
            )

        const nonMaleCount = teamNonCaptainRows.filter(
            (r) => r.male !== true
        ).length
        // When a team has exactly 1 non-male and both directions apply, that
        // player only needs to be assigned to one direction.
        const canShareNonMale =
            nonMaleCount === 1 && !isTopDivision && !isBottomDivision

        if (!isTopDivision) {
            if (!input.forcedMoveUpMale) {
                return fail("Please select a male player to move up")
            }
            if (
                nonMaleCount > 0 &&
                !canShareNonMale &&
                !input.forcedMoveUpNonMale
            ) {
                return fail("Please select a non-male player to move up")
            }
        }

        if (!isBottomDivision) {
            if (!input.forcedMoveDownMale) {
                return fail("Please select a male player to move down")
            }
            if (
                nonMaleCount > 0 &&
                !canShareNonMale &&
                !input.forcedMoveDownNonMale
            ) {
                return fail("Please select a non-male player to move down")
            }
        }

        if (
            canShareNonMale &&
            !input.forcedMoveUpNonMale &&
            !input.forcedMoveDownNonMale
        ) {
            return fail(
                "Please select your non-male player to move either up or down"
            )
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
                entries.push({
                    player: userId,
                    direction: "up",
                    is_forced: false
                })
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

        await replaceMovingDayPicks(config.seasonId, sessionUser.id, entries)

        // The delete above replaces this submitter's picks wholesale, so the
        // entry records the resulting set rather than the fact of a save.
        await logAuditEntry({
            userId: sessionUser.id,
            action: "submit_week2_homework",
            entityType: "moving_day",
            entityId: config.seasonId,
            summary: `Submitted captain week 2 homework: ${entries.length} moving-day pick(s). Full picks: ${JSON.stringify(entries)}`
        })

        return ok(undefined, "Homework submitted successfully!")
    }
)

export const submitCoachWeek2Homework = withAction(
    async (input: SubmitCoachWeek2HomeworkInput): Promise<ActionResult> => {
        const sessionUser = await getSessionUser()

        if (!sessionUser) {
            return fail("Not authenticated")
        }

        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return fail("No active season found")
        }

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
            return fail("You are not a coach for this season")
        }

        const [indivDiv] = await db
            .select({ coaches: individual_divisions.coaches })
            .from(individual_divisions)
            .where(
                and(
                    eq(individual_divisions.season, config.seasonId),
                    eq(individual_divisions.division, coachTeamEntry.divisionId)
                )
            )
            .limit(1)

        if (!indivDiv?.coaches) {
            return fail("Your division does not use coaches mode")
        }

        const [divisionInfo] = await db
            .select({ level: divisions.level, name: divisions.name })
            .from(divisions)
            .where(eq(divisions.id, coachTeamEntry.divisionId))
            .limit(1)

        const allActiveDivisions = await db
            .select({ level: divisions.level })
            .from(divisions)
            .where(eq(divisions.active, true))

        const levels = allActiveDivisions.map((d) => d.level)
        const minLevel = Math.min(...levels)
        const isTopDivision = divisionInfo?.level === minLevel

        if (!isTopDivision) {
            const divisionTeamNumbers = await db
                .selectDistinct({ teamNumber: week2Rosters.team_number })
                .from(week2Rosters)
                .where(
                    and(
                        eq(week2Rosters.season, config.seasonId),
                        eq(week2Rosters.division, coachTeamEntry.divisionId)
                    )
                )

            const providedTeamNumbers = new Set(
                input.forcedMoveUpByTeam
                    .filter((f) => f.playerId)
                    .map((f) => f.teamNumber)
            )

            for (const { teamNumber } of divisionTeamNumbers) {
                if (!providedTeamNumbers.has(teamNumber)) {
                    return fail(
                        `Please select a player to move up from Team ${formatTryoutTeamLabel(divisionInfo?.name ?? "", teamNumber)}`
                    )
                }
            }
        }

        type Entry = {
            player: string
            direction: "up" | "down"
            is_forced: boolean
        }

        const entries: Entry[] = []

        if (!isTopDivision) {
            for (const { playerId } of input.forcedMoveUpByTeam) {
                if (playerId) {
                    entries.push({
                        player: playerId,
                        direction: "up",
                        is_forced: true
                    })
                }
            }
        }

        for (const userId of input.recommendedMoveUp) {
            if (userId) {
                entries.push({
                    player: userId,
                    direction: "up",
                    is_forced: false
                })
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

        await replaceMovingDayPicks(config.seasonId, sessionUser.id, entries)

        // The delete above replaces this submitter's picks wholesale, so the
        // entry records the resulting set rather than the fact of a save.
        await logAuditEntry({
            userId: sessionUser.id,
            action: "submit_week2_homework",
            entityType: "moving_day",
            entityId: config.seasonId,
            summary: `Submitted coach week 2 homework: ${entries.length} moving-day pick(s). Full picks: ${JSON.stringify(entries)}`
        })

        return ok(undefined, "Homework submitted successfully!")
    }
)
