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
 * getTeamRosterWithSubs. Each player email also shows the recipient's own
 * availability and who on their team is (and isn't) coming that night,
 * one-night subs included. A one-night sub gets the same email for the team
 * they cover: the matches they are booked on, and on a playoff night every
 * bracket match that team has (a sub can only be booked on a match whose
 * teams are set, so the conditional later ones never carry a sub row).
 * Assigned referees get one email listing every
 * match they referee that night.
 *
 * Each dispatch carries a per-night dedupe key, so a re-fired cron — or
 * overlapping invocations — cannot double-send: the claim insert in
 * notification_log is the idempotency gate.
 */

import { and, eq, inArray } from "drizzle-orm"
import { aliasedTable } from "drizzle-orm"
import { db } from "@/database/db"
import {
    divisions,
    matchReferees,
    matchSubstitutions,
    matches,
    seasonEvents,
    teams,
    userUnavailability,
    users
} from "@/database/schema"
import { formatEventDate, formatMatchTime } from "@/lib/date-utils"
import {
    buildGameReminderHtml,
    type GameReminderItem,
    type PlayerNightStatus,
    type TeamNightAvailability
} from "@/lib/email-html"
import { loadPlayoffDivisionGraph } from "@/lib/playoff-graph"
import {
    resolveOpponentLabel,
    teamItemsForNode
} from "@/lib/playoff-resolution"
import { dispatchNotification } from "./dispatch"
import type { NotificationRecipient } from "./dispatch"
import {
    formatPlayerSummaryName,
    getTeamRosterWithSubs,
    type PlayerSummary
} from "@/lib/roster"
import { formatDisplayName, splitByGender } from "@/lib/utils"

interface GameReminderRunResult {
    date: string
    matches: number
    playersSent: number
    playersSkipped: number
    refereesSent: number
    refereesSkipped: number
    failed: number
}

/** One thing a team (or referee) does tonight, before it is rendered. */
interface TeamNightItem {
    role: "play" | "work" | "ref"
    matchId: number
    time: string | null
    court: number | null
    matchupLabel: string
    matchNum: number | null
    condition: string | null
    /** One-night subs only: "Casey Covered (Home Heroes)". */
    subFor?: string
}

const homeTeams = aliasedTable(teams, "home_teams")
const awayTeams = aliasedTable(teams, "away_teams")

function teamName(name: string | null, number: number | null): string {
    return name || (number != null ? `Team ${number}` : "TBD")
}

function byStartTime(a: TeamNightItem, b: TeamNightItem): number {
    return (
        (a.time ?? "99").localeCompare(b.time ?? "99") ||
        (a.matchNum ?? 0) - (b.matchNum ?? 0) ||
        (a.role === b.role ? 0 : a.role === "play" ? -1 : 1)
    )
}

function toEmailItem(item: TeamNightItem): GameReminderItem {
    return {
        role: item.role,
        timeLabel: item.time ? formatMatchTime(item.time) : "TBD",
        courtLabel: item.court != null ? `Court ${item.court}` : "TBD",
        matchupLabel: item.matchupLabel,
        matchNum: item.matchNum,
        condition: item.condition,
        subFor: item.subFor
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
    const matchNumById = new Map<number, number>()
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
            matchNumById.set(slot.matchId, node.matchNum)
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
                        matchId: slot.matchId,
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
                matchId: m.id,
                time: m.time,
                court: m.court,
                matchupLabel,
                matchNum: null,
                condition: null
            })
        }
    }

    // Rosters for the whole night up front: one roster load per season.
    const activeByTeam = new Map<number, PlayerSummary[]>()
    for (const seasonId of new Set(matchRows.map((m) => m.season))) {
        for (const entry of await getTeamRosterWithSubs(seasonId)) {
            const list = activeByTeam.get(entry.teamId) ?? []
            if (!list.some((p) => p.id === entry.activeUser.id)) {
                list.push(entry.activeUser)
            }
            activeByTeam.set(entry.teamId, list)
        }
    }
    const teamIdsByUser = new Map<string, number[]>()
    for (const teamId of itemsByTeam.keys()) {
        for (const player of activeByTeam.get(teamId) ?? []) {
            const list = teamIdsByUser.get(player.id) ?? []
            list.push(teamId)
            teamIdsByUser.set(player.id, list)
        }
    }

    const matchIds = matchRows.map((m) => m.id)
    const [refRows, unavailableRows, matchSubRows] = await Promise.all([
        db
            .select({
                matchId: matchReferees.match_id,
                userId: users.id,
                email: users.email,
                firstName: users.first_name,
                preferredName: users.preferred_name
            })
            .from(matchReferees)
            .innerJoin(users, eq(matchReferees.referee_id, users.id))
            .where(inArray(matchReferees.match_id, matchIds)),
        // Availability is per league night: the season event on this date.
        db
            .select({ userId: userUnavailability.user_id })
            .from(userUnavailability)
            .innerJoin(
                seasonEvents,
                eq(userUnavailability.event_id, seasonEvents.id)
            )
            .where(
                and(
                    eq(seasonEvents.event_date, date),
                    inArray(seasonEvents.season_id, [
                        ...new Set(matchRows.map((m) => m.season))
                    ])
                )
            ),
        db
            .select({
                matchId: matchSubstitutions.match,
                teamId: matchSubstitutions.team,
                originalUserId: matchSubstitutions.original_user,
                subUserId: matchSubstitutions.sub_user
            })
            .from(matchSubstitutions)
            .where(inArray(matchSubstitutions.match, matchIds))
    ])
    const unavailableIds = new Set(unavailableRows.map((r) => r.userId))

    // One-night subs, per sub: the teams they cover tonight and for whom.
    const subbingByUser = new Map<
        string,
        Map<number, { forUserIds: string[]; matchIds: Set<number> }>
    >()
    for (const r of matchSubRows) {
        if (!itemsByTeam.has(r.teamId)) continue
        const byTeam = subbingByUser.get(r.subUserId) ?? new Map()
        const entry = byTeam.get(r.teamId) ?? {
            forUserIds: [],
            matchIds: new Set<number>()
        }
        if (!entry.forUserIds.includes(r.originalUserId)) {
            entry.forUserIds.push(r.originalUserId)
        }
        entry.matchIds.add(r.matchId)
        byTeam.set(r.teamId, entry)
        subbingByUser.set(r.subUserId, byTeam)
    }
    const subTeamIds = [
        ...new Set([...subbingByUser.values()].flatMap((m) => [...m.keys()]))
    ]
    const captainByTeam = new Map(
        (subTeamIds.length > 0
            ? await db
                  .select({ id: teams.id, captain: teams.captain })
                  .from(teams)
                  .where(inArray(teams.id, subTeamIds))
            : []
        ).map((t) => [t.id, t.captain])
    )

    const playerIds = [
        ...new Set([...teamIdsByUser.keys(), ...subbingByUser.keys()])
    ]
    const lookupIds = [
        ...new Set([
            ...playerIds,
            ...matchSubRows.flatMap((r) => [r.originalUserId, r.subUserId]),
            ...captainByTeam.values()
        ])
    ]
    const userById = new Map(
        (lookupIds.length > 0
            ? await db
                  .select({
                      id: users.id,
                      email: users.email,
                      firstName: users.first_name,
                      lastName: users.last_name,
                      preferredName: users.preferred_name,
                      male: users.male
                  })
                  .from(users)
                  .where(inArray(users.id, lookupIds))
            : []
        ).map((u) => [u.id, u])
    )
    const nameOf = (userId: string) => {
        const u = userById.get(userId)
        return u
            ? formatDisplayName(u.firstName, u.lastName, u.preferredName)
            : ""
    }

    // Who each team can expect tonight. A one-night sub (match_substitutions)
    // takes the place of the player they cover on that team's matches.
    const availabilityByTeam = new Map<number, TeamNightAvailability>()
    for (const teamId of itemsByTeam.keys()) {
        const subs = new Map<string, string>() // sub user id → covered user id
        for (const r of matchSubRows) {
            if (r.teamId === teamId) subs.set(r.subUserId, r.originalUserId)
        }
        const coveredIds = new Set(subs.values())
        const roster = activeByTeam.get(teamId) ?? []
        const available = roster.filter(
            (p) => !unavailableIds.has(p.id) && !coveredIds.has(p.id)
        )
        const subbingIn = [...subs].map(([subId, coveredId]) => ({
            name: nameOf(subId),
            forName: nameOf(coveredId),
            male: userById.get(subId)?.male ?? null
        }))
        const { males, nonMales } = splitByGender([...available, ...subbingIn])
        availabilityByTeam.set(teamId, {
            teamName: teamNameById.get(teamId) ?? "Your team",
            available: available.map(formatPlayerSummaryName),
            subbingIn: subbingIn.map((s) => ({
                name: s.name,
                forName: s.forName
            })),
            unavailable: roster
                .filter((p) => unavailableIds.has(p.id) || coveredIds.has(p.id))
                .map(formatPlayerSummaryName),
            maleCount: males.length,
            nonMaleCount: nonMales.length
        })
    }

    const dateLabel = formatEventDate(date)

    // Players: one email each for the whole night.
    const nightByUser = new Map<
        string,
        {
            teamName: string
            items: GameReminderItem[]
            teams: TeamNightAvailability[]
            you: PlayerNightStatus
        }
    >()
    const playerRecipients: NotificationRecipient[] = []
    for (const userId of playerIds) {
        const u = userById.get(userId)
        if (!u) continue
        const teamIds = teamIdsByUser.get(userId) ?? []
        const subbing = [...(subbingByUser.get(userId) ?? [])]
        const items = [
            ...teamIds.flatMap((id) => itemsByTeam.get(id) ?? []),
            ...subbing.flatMap(([teamId, entry]) => {
                const subFor = `${entry.forUserIds.map(nameOf).join(" & ")} (${teamNameById.get(teamId) ?? "TBD"})`
                return (itemsByTeam.get(teamId) ?? [])
                    .filter(
                        (item) =>
                            entry.matchIds.has(item.matchId) ||
                            item.matchNum !== null
                    )
                    .map((item) => ({ ...item, subFor }))
            })
        ].sort(byStartTime)
        if (items.length === 0) continue
        const coveredBy = matchSubRows.find(
            (r) => r.originalUserId === userId && teamIds.includes(r.teamId)
        )
        const you: PlayerNightStatus = coveredBy
            ? { status: "subbed_out", subName: nameOf(coveredBy.subUserId) }
            : teamIds.length === 0
              ? {
                    status: "subbing",
                    teams: subbing.map(([teamId, entry]) => {
                        const captainId = captainByTeam.get(teamId)
                        return {
                            teamName: teamNameById.get(teamId) ?? "TBD",
                            forName: entry.forUserIds.map(nameOf).join(" & "),
                            captainName: captainId ? nameOf(captainId) : null
                        }
                    })
                }
              : unavailableIds.has(userId)
                ? { status: "unavailable" }
                : { status: "available" }
        nightByUser.set(userId, {
            teamName: teamIds
                .map((id) => teamNameById.get(id) ?? "")
                .filter(Boolean)
                .join(", "),
            items: items.map(toEmailItem),
            teams: [...teamIds, ...subbing.map(([teamId]) => teamId)].flatMap(
                (id) => availabilityByTeam.get(id) ?? []
            ),
            you
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
                    items: night?.items ?? [],
                    you: night?.you,
                    teams: night?.teams
                })
            },
            tag: "game-reminder",
            dedupeKey: `night-${date}`
        })
        result.playersSent += playerResult.sent
        result.playersSkipped += playerResult.skipped
        result.failed += playerResult.failed
    }

    // Referees: one email each for every match they referee that night.
    const matchById = new Map(matchRows.map((m) => [m.id, m]))
    const refMatchesByUser = new Map<string, TeamNightItem[]>()
    const refRecipients = new Map<string, NotificationRecipient>()
    for (const r of refRows) {
        const match = matchById.get(r.matchId)
        if (!match) continue
        refRecipients.set(r.userId, {
            userId: r.userId,
            email: r.email,
            firstName: r.preferredName || r.firstName
        })
        const list = refMatchesByUser.get(r.userId) ?? []
        list.push({
            role: "ref",
            matchId: match.id,
            time: match.time,
            court: match.court,
            matchupLabel: matchupLabelById.get(match.id) ?? match.divisionName,
            matchNum: matchNumById.get(match.id) ?? null,
            condition: null
        })
        refMatchesByUser.set(r.userId, list)
    }
    const refItemsByUser = new Map(
        [...refMatchesByUser].map(([userId, list]) => [
            userId,
            list.sort(byStartTime).map(toEmailItem)
        ])
    )

    if (refRecipients.size > 0) {
        const refResult = await dispatchNotification({
            type: "game_reminder_referee",
            recipients: [...refRecipients.values()],
            subject: (r) => {
                const first = refItemsByUser.get(r.userId)?.[0]
                return `Reffing reminder — ${dateLabel} at ${first?.timeLabel ?? "TBD"}`
            },
            htmlBody: (r) =>
                buildGameReminderHtml({
                    firstName: r.firstName ?? "there",
                    role: "referee",
                    dateLabel,
                    teamName: null,
                    items: refItemsByUser.get(r.userId) ?? []
                }),
            tag: "game-reminder-ref",
            dedupeKey: `night-${date}`
        })
        result.refereesSent += refResult.sent
        result.refereesSkipped += refResult.skipped
        result.failed += refResult.failed
    }

    return result
}
