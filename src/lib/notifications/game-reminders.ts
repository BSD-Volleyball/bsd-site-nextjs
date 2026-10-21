/**
 * game-reminders.ts — Day-before match reminder engine, driven by the
 * /api/cron/game-reminders route.
 *
 * Every player on a team with something to do on the target date gets ONE
 * email listing all of it: regular-season matches, and on a playoff night
 * every bracket match the team plays or works, including the ones that hang
 * on an earlier result ("If you win match 1" plays match 2, "If you lose
 * match 1" works it), worked out by the same bracket resolution as the
 * dashboard's next-match card. Rosters honor permanent-sub chains via
 * getTeamRosterWithSubs. Assigned referees get one email per match.
 *
 * Each dispatch carries a dedupe key (per night for players, per match for
 * referees), so a re-fired cron — or overlapping invocations — cannot
 * double-send: the claim insert in notification_log is the idempotency gate.
 */

import { eq, inArray } from "drizzle-orm"
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
import { buildGameReminderHtml, type GameReminderItem } from "@/lib/email-html"
import { loadPlayoffDivisionGraph } from "@/lib/playoff-graph"
import {
    resolveOpponentLabel,
    teamItemsForNode
} from "@/lib/playoff-resolution"
import { dispatchNotification } from "./dispatch"
import type { NotificationRecipient } from "./dispatch"
import { getTeamRosterWithSubs } from "@/lib/roster"

interface GameReminderRunResult {
    date: string
    matches: number
    playersSent: number
    playersSkipped: number
    refereesSent: number
    refereesSkipped: number
    failed: number
}

/** One thing a team does tonight, before it is rendered for the email. */
interface TeamNightItem {
    role: "play" | "work"
    time: string | null
    court: number | null
    matchupLabel: string
    matchNum: number | null
    condition: string | null
}

const homeTeams = aliasedTable(teams, "home_teams")
const awayTeams = aliasedTable(teams, "away_teams")

function teamName(name: string | null, number: number | null): string {
    return name || (number != null ? `Team ${number}` : "TBD")
}

function toEmailItem(item: TeamNightItem): GameReminderItem {
    return {
        role: item.role,
        timeLabel: item.time ? formatMatchTime(item.time) : "TBD",
        courtLabel: item.court != null ? `Court ${item.court}` : "TBD",
        matchupLabel: item.matchupLabel,
        matchNum: item.matchNum,
        condition: item.condition
    }
}

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

    // Every match that night, including playoff matches whose teams are
    // still "Winner of M1": those happen whatever the result.
    const matchRows = await db
        .select({
            id: matches.id,
            season: matches.season,
            divisionId: matches.division,
            playoff: matches.playoff,
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
        .leftJoin(homeTeams, eq(matches.home_team, homeTeams.id))
        .leftJoin(awayTeams, eq(matches.away_team, awayTeams.id))
        .innerJoin(divisions, eq(matches.division, divisions.id))
        .where(eq(matches.date, date))
    result.matches = matchRows.length
    if (matchRows.length === 0) return result

    const itemsByTeam = new Map<number, TeamNightItem[]>()
    const addItem = (teamId: number, item: TeamNightItem) => {
        const list = itemsByTeam.get(teamId) ?? []
        list.push(item)
        itemsByTeam.set(teamId, list)
    }
    const teamNameById = new Map<number, string>()
    const matchupLabelById = new Map<number, string>()

    // Playoff nights: walk each division's bracket for every team in it.
    const handledMatchIds = new Set<number>()
    const playoffDivisions = new Map<string, [number, number, string]>()
    for (const m of matchRows) {
        if (!m.playoff) continue
        playoffDivisions.set(`${m.season}:${m.divisionId}`, [
            m.season,
            m.divisionId,
            m.divisionName
        ])
    }
    for (const [
        seasonId,
        divisionId,
        divisionName
    ] of playoffDivisions.values()) {
        const { ctx, teamLabelById, slotByMatchNum } =
            await loadPlayoffDivisionGraph(seasonId, divisionId)
        const tonight = [...ctx.nodeByMatchNum.values()].filter(
            (node) =>
                node.winnerTeamId === null &&
                slotByMatchNum.get(node.matchNum)?.date === date
        )
        for (const node of tonight) {
            const slot = slotByMatchNum.get(node.matchNum)
            if (!slot) continue
            handledMatchIds.add(slot.matchId)
            const home = resolveOpponentLabel(
                node.homeSource,
                ctx,
                teamLabelById
            )
            const away = resolveOpponentLabel(
                node.awaySource,
                ctx,
                teamLabelById
            )
            matchupLabelById.set(
                slot.matchId,
                `${home} vs ${away} (${divisionName})`
            )
            for (const [teamId, label] of teamLabelById) {
                teamNameById.set(teamId, label)
                for (const item of teamItemsForNode(
                    node,
                    teamId,
                    ctx,
                    teamLabelById
                )) {
                    addItem(teamId, {
                        role: item.role,
                        time: slot.time,
                        court: slot.court,
                        matchupLabel:
                            item.role === "play"
                                ? `${label} vs ${item.opponentLabel ?? "TBD"} (${divisionName})`
                                : `${home} vs ${away} (${divisionName})`,
                        matchNum: node.matchNum,
                        condition: item.condition
                    })
                }
            }
        }
    }

    // Everything else (regular season, or a playoff match with no bracket
    // row): the two teams on the match play it.
    for (const m of matchRows) {
        if (handledMatchIds.has(m.id)) continue
        const home = teamName(m.homeTeamName, m.homeTeamNumber)
        const away = teamName(m.awayTeamName, m.awayTeamNumber)
        const matchupLabel = `${home} vs ${away} (${m.divisionName})`
        matchupLabelById.set(m.id, matchupLabel)
        for (const [teamId, name] of [
            [m.homeTeamId, home],
            [m.awayTeamId, away]
        ] as Array<[number | null, string]>) {
            if (teamId == null) continue
            teamNameById.set(teamId, name)
            addItem(teamId, {
                role: "play",
                time: m.time,
                court: m.court,
                matchupLabel,
                matchNum: null,
                condition: null
            })
        }
    }

    // Rosters and recipient details for the whole night up front: one roster
    // load per season and one user query.
    const activeIdsByTeam = new Map<number, string[]>()
    for (const seasonId of new Set(matchRows.map((m) => m.season))) {
        for (const entry of await getTeamRosterWithSubs(seasonId)) {
            const ids = activeIdsByTeam.get(entry.teamId) ?? []
            if (!ids.includes(entry.activeUser.id)) {
                ids.push(entry.activeUser.id)
            }
            activeIdsByTeam.set(entry.teamId, ids)
        }
    }
    const teamIdsByUser = new Map<string, number[]>()
    for (const teamId of itemsByTeam.keys()) {
        for (const userId of activeIdsByTeam.get(teamId) ?? []) {
            const list = teamIdsByUser.get(userId) ?? []
            list.push(teamId)
            teamIdsByUser.set(userId, list)
        }
    }

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

    const playerIds = [...teamIdsByUser.keys()]
    const userById = new Map(
        (playerIds.length > 0
            ? await db
                  .select({
                      id: users.id,
                      email: users.email,
                      firstName: users.first_name,
                      preferredName: users.preferred_name
                  })
                  .from(users)
                  .where(inArray(users.id, playerIds))
            : []
        ).map((u) => [u.id, u])
    )

    const dateLabel = formatEventDate(date)

    // Players: one email each for the whole night.
    const nightByUser = new Map<
        string,
        { teamName: string; items: GameReminderItem[] }
    >()
    const playerRecipients: NotificationRecipient[] = []
    for (const [userId, teamIds] of teamIdsByUser) {
        const u = userById.get(userId)
        if (!u) continue
        const items = teamIds
            .flatMap((id) => itemsByTeam.get(id) ?? [])
            .sort(
                (a, b) =>
                    (a.time ?? "99").localeCompare(b.time ?? "99") ||
                    (a.matchNum ?? 0) - (b.matchNum ?? 0) ||
                    (a.role === b.role ? 0 : a.role === "play" ? -1 : 1)
            )
        nightByUser.set(userId, {
            teamName: teamIds
                .map((id) => teamNameById.get(id) ?? "")
                .filter(Boolean)
                .join(", "),
            items: items.map(toEmailItem)
        })
        playerRecipients.push({
            userId: u.id,
            email: u.email,
            firstName: u.preferredName || u.firstName
        })
    }

    if (playerRecipients.length > 0) {
        const playerResult = await dispatchNotification({
            type: "game_reminder_player",
            recipients: playerRecipients,
            subject: (r) => {
                const first = nightByUser.get(r.userId)?.items[0]
                return `Match reminder — ${dateLabel} at ${first?.timeLabel ?? "TBD"}`
            },
            htmlBody: (r) => {
                const night = nightByUser.get(r.userId)
                return buildGameReminderHtml({
                    firstName: r.firstName ?? "there",
                    role: "player",
                    dateLabel,
                    teamName: night?.teamName || null,
                    items: night?.items ?? []
                })
            },
            tag: "game-reminder",
            dedupeKey: `night-${date}`
        })
        result.playersSent += playerResult.sent
        result.playersSkipped += playerResult.skipped
        result.failed += playerResult.failed
    }

    // Referees: one email per assigned match, as before.
    for (const match of matchRows) {
        const matchRefs = refRows.filter((r) => r.matchId === match.id)
        if (matchRefs.length === 0) continue
        const timeLabel = match.time ? formatMatchTime(match.time) : "TBD"
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
                    teamName: null,
                    items: [
                        {
                            role: "play",
                            timeLabel,
                            courtLabel:
                                match.court != null
                                    ? `Court ${match.court}`
                                    : "TBD",
                            matchupLabel:
                                matchupLabelById.get(match.id) ??
                                match.divisionName,
                            matchNum: null,
                            condition: null
                        }
                    ]
                }),
            tag: "game-reminder-ref",
            dedupeKey: `match-${match.id}-${date}`
        })
        result.refereesSent += refResult.sent
        result.refereesSkipped += refResult.skipped
        result.failed += refResult.failed
    }

    return result
}
