/**
 * game-reminders.ts — Day-before match reminder engine, driven by the
 * /api/cron/game-reminders route.
 *
 * For every match on the target date, emails the active roster of both teams
 * (permanent-sub chains honored via getTeamRosterWithSubs) and any assigned
 * referees. Each dispatch carries a per-match dedupe key, so a re-fired cron
 * — or overlapping invocations — cannot double-send: the claim insert in
 * notification_log is the idempotency gate.
 */

import { and, eq, inArray, isNotNull } from "drizzle-orm"
import { aliasedTable } from "drizzle-orm"
import { db } from "@/database/db"
import {
    divisions,
    matchReferees,
    matches,
    teams,
    users
} from "@/database/schema"
import { formatEventDate, formatMatchTime } from "@/lib/date-utils"
import { buildGameReminderHtml } from "@/lib/email-html"
import { dispatchNotification } from "./dispatch"
import type { NotificationRecipient } from "./dispatch"
import { getTeamRosterWithSubs } from "@/lib/roster"

export interface GameReminderRunResult {
    date: string
    matches: number
    playersSent: number
    playersSkipped: number
    refereesSent: number
    refereesSkipped: number
    failed: number
}

const homeTeams = aliasedTable(teams, "home_teams")
const awayTeams = aliasedTable(teams, "away_teams")

export async function sendGameRemindersForDate(
    date: string
): Promise<GameReminderRunResult> {
    const result: GameReminderRunResult = {
        date,
        matches: 0,
        playersSent: 0,
        playersSkipped: 0,
        refereesSent: 0,
        refereesSkipped: 0,
        failed: 0
    }

    const matchRows = await db
        .select({
            id: matches.id,
            season: matches.season,
            date: matches.date,
            time: matches.time,
            court: matches.court,
            homeTeamId: matches.home_team,
            awayTeamId: matches.away_team,
            homeTeamName: homeTeams.name,
            homeTeamNumber: homeTeams.number,
            awayTeamName: awayTeams.name,
            awayTeamNumber: awayTeams.number,
            divisionName: divisions.name
        })
        .from(matches)
        .innerJoin(homeTeams, eq(matches.home_team, homeTeams.id))
        .innerJoin(awayTeams, eq(matches.away_team, awayTeams.id))
        .innerJoin(divisions, eq(matches.division, divisions.id))
        .where(
            and(
                eq(matches.date, date),
                isNotNull(matches.home_team),
                isNotNull(matches.away_team)
            )
        )
    result.matches = matchRows.length
    if (matchRows.length === 0) return result

    const refRows = await db
        .select({
            matchId: matchReferees.match_id,
            userId: users.id,
            email: users.email,
            firstName: users.first_name,
            preferredName: users.preferred_name
        })
        .from(matchReferees)
        .innerJoin(users, eq(matchReferees.referee_id, users.id))
        .where(
            inArray(
                matchReferees.match_id,
                matchRows.map((m) => m.id)
            )
        )

    for (const match of matchRows) {
        const teamName = (name: string | null, number: number | null) =>
            name || (number != null ? `Team ${number}` : "TBD")
        const home = teamName(match.homeTeamName, match.homeTeamNumber)
        const away = teamName(match.awayTeamName, match.awayTeamNumber)
        const matchupLabel = `${home} vs ${away} (${match.divisionName})`
        const dateLabel = match.date ? formatEventDate(match.date) : date
        const timeLabel = match.time ? formatMatchTime(match.time) : "TBD"
        const courtLabel = match.court != null ? `Court ${match.court}` : "TBD"
        const dedupeKey = `match-${match.id}-${date}`

        // Active players on both rosters, tagged with their team's name.
        const playerRecipients: Array<
            NotificationRecipient & { teamName: string }
        > = []
        for (const [teamId, name] of [
            [match.homeTeamId, home],
            [match.awayTeamId, away]
        ] as Array<[number | null, string]>) {
            if (teamId == null) continue
            const roster = await getTeamRosterWithSubs(match.season, teamId)
            const activeIds = [
                ...new Set(roster.map((entry) => entry.activeUser.id))
            ]
            if (activeIds.length === 0) continue
            const userRows = await db
                .select({
                    id: users.id,
                    email: users.email,
                    firstName: users.first_name,
                    preferredName: users.preferred_name
                })
                .from(users)
                .where(inArray(users.id, activeIds))
            for (const u of userRows) {
                playerRecipients.push({
                    userId: u.id,
                    email: u.email,
                    firstName: u.preferredName || u.firstName,
                    teamName: name
                })
            }
        }

        const teamNameByUserId = new Map(
            playerRecipients.map((r) => [r.userId, r.teamName])
        )
        const playerResult = await dispatchNotification({
            type: "game_reminder_player",
            recipients: playerRecipients,
            subject: `Match reminder — ${dateLabel} at ${timeLabel}`,
            htmlBody: (r) =>
                buildGameReminderHtml({
                    firstName: r.firstName ?? "there",
                    role: "player",
                    dateLabel,
                    timeLabel,
                    courtLabel,
                    matchupLabel,
                    teamName: teamNameByUserId.get(r.userId) ?? null
                }),
            tag: "game-reminder",
            dedupeKey
        })
        result.playersSent += playerResult.sent
        result.playersSkipped += playerResult.skipped
        result.failed += playerResult.failed

        const matchRefs = refRows.filter((r) => r.matchId === match.id)
        if (matchRefs.length > 0) {
            const refResult = await dispatchNotification({
                type: "game_reminder_referee",
                recipients: matchRefs.map((r) => ({
                    userId: r.userId,
                    email: r.email,
                    firstName: r.preferredName || r.firstName
                })),
                subject: `Reffing reminder — ${dateLabel} at ${timeLabel}`,
                htmlBody: (r) =>
                    buildGameReminderHtml({
                        firstName: r.firstName ?? "there",
                        role: "referee",
                        dateLabel,
                        timeLabel,
                        courtLabel,
                        matchupLabel,
                        teamName: null
                    }),
                tag: "game-reminder-ref",
                dedupeKey
            })
            result.refereesSent += refResult.sent
            result.refereesSkipped += refResult.skipped
            result.failed += refResult.failed
        }
    }

    return result
}
