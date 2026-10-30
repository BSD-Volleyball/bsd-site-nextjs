import "server-only"

import { logger } from "@/lib/logger"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    teams,
    drafts,
    divisions,
    seasonEvents,
    signups,
    userUnavailability
} from "@/database/schema"
import { eq, and, asc } from "drizzle-orm"
import { getNextMatchForUser, type NextMatch } from "@/lib/next-match"
import { loadPlayoffDivisionGraph } from "@/lib/playoff-graph"
import {
    sourceContainsTeam,
    teamItemsForNode,
    type PlayoffNode
} from "@/lib/playoff-resolution"
import {
    isAdminOrDirectorBySession,
    isCommissionerBySession,
    hasCaptainPagesAccessBySession
} from "@/next/session"
import { formatMatchTime } from "@/lib/season-utils"

export type { NextMatch } from "@/lib/next-match"

export async function getNextMatch(
    userId: string,
    seasonId: number
): Promise<NextMatch | null> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) return null
    if (session.user.id !== userId) {
        const allowed =
            (await isAdminOrDirectorBySession()) ||
            (await isCommissionerBySession()) ||
            (await hasCaptainPagesAccessBySession())
        if (!allowed) return null
    }

    return getNextMatchForUser(userId, seasonId)
}

export interface PlayoffNextMatchItem {
    role: "play" | "work"
    matchNum: number
    week: number
    date: string | null
    time: string | null
    court: number | null
    opponentLabel: string | null
    isUnavailable: boolean
    condition: string | null
    /** The match may not be played at all: "Match #11 (if needed)". */
    ifNeeded: boolean
}

export interface PlayoffNextMatchData {
    week: number
    date: string | null
    divisionName: string
    items: PlayoffNextMatchItem[]
    // "upcoming": items describe a genuine future touchpoint.
    // "pending_results": the team's last playoff night has already passed but
    // its matches are unscored, so the next match cannot be determined yet.
    status: "upcoming" | "pending_results"
}

export async function getPlayoffNextMatches(
    userId: string,
    seasonId: number
): Promise<PlayoffNextMatchData | null> {
    try {
        const session = await auth.api.getSession({ headers: await headers() })
        if (!session) return null
        if (session.user.id !== userId) {
            const allowed =
                (await isAdminOrDirectorBySession()) ||
                (await isCommissionerBySession()) ||
                (await hasCaptainPagesAccessBySession())
            if (!allowed) return null
        }

        const [draftRecord] = await db
            .select({ teamId: teams.id, divisionId: teams.division })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .where(and(eq(drafts.user, userId), eq(teams.season, seasonId)))
            .limit(1)
        if (!draftRecord) return null

        const teamId = draftRecord.teamId
        const divisionId = draftRecord.divisionId

        const { ctx, teamLabelById, slotByMatchNum } =
            await loadPlayoffDivisionGraph(seasonId, divisionId)

        // Determine target week: lowest week where the team has a possible
        // touchpoint AND at least one such match is unfinished.
        const matchInvolvement = new Map<
            number,
            {
                node: PlayoffNode
                playHome: ReturnType<typeof sourceContainsTeam>
                playAway: ReturnType<typeof sourceContainsTeam>
                work: ReturnType<typeof sourceContainsTeam>
                isFinished: boolean
            }
        >()
        for (const node of ctx.nodeByMatchNum.values()) {
            matchInvolvement.set(node.matchNum, {
                node,
                playHome: sourceContainsTeam(node.homeSource, teamId, ctx),
                playAway: sourceContainsTeam(node.awaySource, teamId, ctx),
                work: sourceContainsTeam(node.workSource, teamId, ctx),
                isFinished: node.winnerTeamId !== null
            })
        }

        const weeks = [
            ...new Set([...matchInvolvement.values()].map((mi) => mi.node.week))
        ].sort((a, b) => a - b)
        let targetWeek: number | null = null
        for (const w of weeks) {
            const involvedInWeek = [...matchInvolvement.values()].filter(
                (mi) =>
                    mi.node.week === w &&
                    (mi.playHome.contains ||
                        mi.playAway.contains ||
                        mi.work.contains)
            )
            if (involvedInWeek.length === 0) continue
            const anyUnfinished = involvedInWeek.some((mi) => !mi.isFinished)
            if (anyUnfinished) {
                targetWeek = w
                break
            }
        }
        if (targetWeek === null) return null

        // Resolve playoff event date for the target week.
        const seasonEventsForType = await db
            .select({
                eventDate: seasonEvents.event_date,
                id: seasonEvents.id
            })
            .from(seasonEvents)
            .where(
                and(
                    eq(seasonEvents.season_id, seasonId),
                    eq(seasonEvents.event_type, "playoff")
                )
            )
            .orderBy(asc(seasonEvents.event_date))
        const weekEvent = seasonEventsForType[targetWeek - 1]
        const targetWeekDate = weekEvent?.eventDate ?? null
        const targetWeekEventId = weekEvent?.id ?? null

        // Look up signup for unavailability checks.
        let isUnavailable = false
        if (targetWeekEventId !== null) {
            const [signup] = await db
                .select({ id: signups.id })
                .from(signups)
                .where(
                    and(
                        eq(signups.player, userId),
                        eq(signups.season, seasonId)
                    )
                )
                .limit(1)
            if (signup) {
                const [unavailRecord] = await db
                    .select({ id: userUnavailability.id })
                    .from(userUnavailability)
                    .where(
                        and(
                            eq(userUnavailability.signup_id, signup.id),
                            eq(userUnavailability.event_id, targetWeekEventId)
                        )
                    )
                    .limit(1)
                isUnavailable = !!unavailRecord
            }
        }

        const items: PlayoffNextMatchItem[] = []
        for (const mi of matchInvolvement.values()) {
            if (mi.node.week !== targetWeek) continue
            if (mi.isFinished) continue

            const slot = slotByMatchNum.get(mi.node.matchNum)
            for (const item of teamItemsForNode(
                mi.node,
                teamId,
                ctx,
                teamLabelById
            )) {
                items.push({
                    role: item.role,
                    matchNum: mi.node.matchNum,
                    week: mi.node.week,
                    date: slot?.date ?? targetWeekDate,
                    time: formatMatchTime(slot?.time ?? null),
                    court: slot?.court ?? null,
                    opponentLabel: item.opponentLabel,
                    isUnavailable: item.role === "play" && isUnavailable,
                    condition: item.condition,
                    ifNeeded: item.ifNeeded
                })
            }
        }

        items.sort((a, b) => {
            if (a.matchNum !== b.matchNum) return a.matchNum - b.matchNum
            if (a.role !== b.role) return a.role === "play" ? -1 : 1
            return 0
        })

        const [divisionRow] = await db
            .select({ name: divisions.name })
            .from(divisions)
            .where(eq(divisions.id, divisionId))
            .limit(1)

        // If the target playoff night has already passed but its matches are
        // still unscored, the team's outcome — and therefore its next match —
        // can't be known yet. Surface a "results pending" state instead of
        // presenting last night's matches as the upcoming one. Once scores are
        // entered the target week advances (or the card drops out entirely for
        // an eliminated team).
        const todayStr = new Date().toLocaleDateString("en-CA", {
            timeZone: "America/New_York"
        })
        const itemDates = items
            .map((it) => it.date)
            .filter((d): d is string => d !== null)
            .sort()
        const targetNightDate =
            targetWeekDate ?? itemDates[itemDates.length - 1] ?? null
        const status: PlayoffNextMatchData["status"] =
            targetNightDate !== null && targetNightDate < todayStr
                ? "pending_results"
                : "upcoming"

        return {
            week: targetWeek,
            date: targetWeekDate,
            divisionName: divisionRow?.name ?? "",
            items,
            status
        }
    } catch (error) {
        logger.error("Error fetching playoff next matches", undefined, error)
        return null
    }
}
