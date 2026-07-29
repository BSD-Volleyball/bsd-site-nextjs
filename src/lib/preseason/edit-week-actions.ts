// Shared implementations for the edit-week-2/3 roster actions. The route
// actions.ts files are thin "use server" wrappers that enforce authorization
// and delegate here with their week's config. Server-only.

import "server-only"

import { headers } from "next/headers"
import { and, desc, eq, inArray } from "drizzle-orm"
import type { ActionResult } from "@/lib/action-helpers"
import { ok, fail, requireSeasonConfig } from "@/lib/action-helpers"
import { auth } from "@/lib/auth"
import {
    dispatchNotification,
    type NotificationRecipient
} from "@/lib/notifications/dispatch"
import {
    buildRosterAssignmentHtml,
    buildRosterRemovalHtml,
    renderDetailRow,
    renderDetailsBlock
} from "@/lib/email-html"
import { db } from "@/database/db"
import {
    signups,
    users,
    week2Rosters,
    week3Rosters,
    teams,
    divisions,
    individual_divisions,
    drafts,
    seasons
} from "@/database/schema"
import {
    getSeasonConfig,
    getEventsByType,
    formatEventDate,
    formatEventTime
} from "@/lib/site-config"
import { logAuditEntry } from "@/lib/audit-log"
import { fetchPlayerScores } from "@/lib/player-score"
import {
    getUnavailableSignupIdsForEvent,
    fetchRatingScoresForReturningPlayers
} from "@/lib/week-rosters"
import { formatDisplayName } from "@/lib/utils"
import { LEGACY_COURT_BY_DIVISION } from "@/lib/courts"
import type {
    EditWeekAssignment,
    EditWeekPlayer,
    EditWeekRosterEntry,
    EditWeekSlot
} from "@/components/edit-week-roster/edit-week-roster-form"

export interface EditWeekActionConfig {
    week: 2 | 3
    /** Index into the season's tryout events (week 2 → 1, week 3 → 2). */
    tryoutEventIndex: 1 | 2
    /**
     * Week 2: a slot flagged captain must hold a player who captains that
     * division (coach divisions exempt). Week 3 lets admins assign captain
     * flags freely.
     */
    validateCaptains: boolean
}

export const EDIT_WEEK_2: EditWeekActionConfig = {
    week: 2,
    tryoutEventIndex: 1,
    validateCaptains: true
}

export const EDIT_WEEK_3: EditWeekActionConfig = {
    week: 3,
    tryoutEventIndex: 2,
    validateCaptains: false
}

// week2Rosters and week3Rosters share an identical column set; the cast
// gives us one code path (same trick as src/lib/pdf/*).
function rosterTableFor(week: 2 | 3) {
    return (week === 2 ? week2Rosters : week3Rosters) as typeof week2Rosters
}

export interface EditWeekData {
    status: boolean
    message?: string
    seasonId: number
    seasonLabel: string
    players: EditWeekPlayer[]
    slots: EditWeekSlot[]
}

/** Data loader shared by the edit pages. Caller must be authorized. */
export async function getEditWeekData(
    actionConfig: EditWeekActionConfig
): Promise<EditWeekData> {
    const rosterTable = rosterTableFor(actionConfig.week)

    try {
        const config = await getSeasonConfig()
        if (!config.seasonId) {
            return {
                status: false,
                message: "No current season found.",
                seasonId: 0,
                seasonLabel: "",
                players: [],
                slots: []
            }
        }

        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`
        const tryouts = getEventsByType(config, "tryout")
        const tryoutEvent = tryouts[actionConfig.tryoutEventIndex] ?? null

        const [signupPlayersRaw, rosterSlots] = await Promise.all([
            db
                .select({
                    signupId: signups.id,
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preferred_name,
                    male: users.male,
                    pairPick: signups.pair_pick
                })
                .from(signups)
                .innerJoin(users, eq(signups.player, users.id))
                .where(eq(signups.season, config.seasonId))
                .orderBy(users.last_name, users.first_name),
            db
                .select({
                    id: rosterTable.id,
                    divisionId: rosterTable.division,
                    divisionName: divisions.name,
                    teamNumber: rosterTable.team_number,
                    userId: rosterTable.user,
                    isCaptain: rosterTable.is_captain
                })
                .from(rosterTable)
                .innerJoin(divisions, eq(rosterTable.division, divisions.id))
                .where(eq(rosterTable.season, config.seasonId))
                .orderBy(
                    divisions.level,
                    rosterTable.team_number,
                    rosterTable.id
                )
        ])

        const unavailableSignupIds = tryoutEvent
            ? await getUnavailableSignupIdsForEvent(
                  tryoutEvent.id,
                  signupPlayersRaw.map((p) => p.signupId)
              )
            : new Set<number>()

        const signupPlayers = signupPlayersRaw.filter((player) => {
            if (!tryoutEvent) {
                return true
            }

            return !unavailableSignupIds.has(player.signupId)
        })

        const userIds = signupPlayers.map((p) => p.id)

        const [draftRows, scoreByUser] = await Promise.all([
            userIds.length > 0
                ? db
                      .select({
                          userId: drafts.user,
                          seasonId: seasons.id,
                          divisionName: divisions.name
                      })
                      .from(drafts)
                      .innerJoin(teams, eq(drafts.team, teams.id))
                      .innerJoin(seasons, eq(teams.season, seasons.id))
                      .innerJoin(divisions, eq(teams.division, divisions.id))
                      .where(inArray(drafts.user, userIds))
                      .orderBy(desc(seasons.id), drafts.overall)
                : Promise.resolve([]),
            userIds.length > 0
                ? fetchPlayerScores(userIds, config.seasonId)
                : Promise.resolve(new Map<string, number>())
        ])

        const ratingScoreByUser = await fetchRatingScoresForReturningPlayers(
            userIds,
            (id) => draftRows.some((r) => r.userId === id),
            config.seasonId
        )

        const lastDivisionByUser = new Map<string, string>()
        const seasonsCountByUser = new Map<string, Set<number>>()
        for (const row of draftRows) {
            if (!lastDivisionByUser.has(row.userId)) {
                lastDivisionByUser.set(row.userId, row.divisionName)
            }
            const seasonSet = seasonsCountByUser.get(row.userId) || new Set()
            seasonSet.add(row.seasonId)
            seasonsCountByUser.set(row.userId, seasonSet)
        }

        return {
            status: true,
            seasonId: config.seasonId,
            seasonLabel,
            players: signupPlayers.map((player) => ({
                id: player.id,
                firstName: player.firstName,
                lastName: player.lastName,
                preferredName: player.preferredName,
                male: player.male,
                hasPairPick: !!player.pairPick,
                placementScore: scoreByUser.get(player.id) ?? 200,
                ratingScore: ratingScoreByUser.get(player.id) ?? null,
                lastDivisionName: lastDivisionByUser.get(player.id) ?? null,
                seasonsPlayedCount: seasonsCountByUser.get(player.id)?.size ?? 0
            })),
            slots: rosterSlots
        }
    } catch (error) {
        console.error(
            `Error loading edit week ${actionConfig.week} data:`,
            error
        )
        return {
            status: false,
            message: "Something went wrong while loading data.",
            seasonId: 0,
            seasonLabel: "",
            players: [],
            slots: []
        }
    }
}

/** Roster replacement shared by the edit pages. Caller must be authorized. */
export async function updateEditWeekRosters(
    actionConfig: EditWeekActionConfig,
    slots: EditWeekRosterEntry[]
): Promise<ActionResult> {
    const rosterTable = rosterTableFor(actionConfig.week)
    const config = await requireSeasonConfig()

    const filledSlots = slots.filter((s) => s.userId)
    const uniqueUserIds = new Set(filledSlots.map((s) => s.userId))

    if (uniqueUserIds.size > 0) {
        const signedUpRows = await db
            .select({ playerId: signups.player })
            .from(signups)
            .where(
                and(
                    eq(signups.season, config.seasonId),
                    inArray(signups.player, [...uniqueUserIds])
                )
            )

        if (signedUpRows.length !== uniqueUserIds.size) {
            return fail(
                "All selected players must be signed up for the current season."
            )
        }

        if (actionConfig.validateCaptains) {
            const captainRows = await db
                .select({
                    userId: teams.captain,
                    divisionId: teams.division,
                    divisionName: divisions.name,
                    isCoachDiv: individual_divisions.coaches
                })
                .from(teams)
                .innerJoin(divisions, eq(teams.division, divisions.id))
                .leftJoin(
                    individual_divisions,
                    and(
                        eq(individual_divisions.division, teams.division),
                        eq(individual_divisions.season, config.seasonId)
                    )
                )
                .where(eq(teams.season, config.seasonId))

            const captainDivisionByUser = new Map<string, number>()
            const divisionNameById = new Map<number, string>()
            for (const row of captainRows) {
                divisionNameById.set(row.divisionId, row.divisionName)
                if (!row.isCoachDiv) {
                    captainDivisionByUser.set(row.userId, row.divisionId)
                }
            }

            for (const slot of filledSlots) {
                if (slot.isCaptain) {
                    const expectedDivision = captainDivisionByUser.get(
                        slot.userId
                    )
                    if (
                        !expectedDivision ||
                        expectedDivision !== slot.divisionId
                    ) {
                        const slotDivisionName =
                            divisionNameById.get(slot.divisionId) ??
                            `Division ${slot.divisionId}`
                        return fail(
                            `Captain slot in ${slotDivisionName} Team ${slot.teamNumber} does not contain a captain assigned to that division.`
                        )
                    }
                }
            }
        }
    }

    try {
        await db.transaction(async (tx) => {
            await tx
                .delete(rosterTable)
                .where(eq(rosterTable.season, config.seasonId))

            if (filledSlots.length > 0) {
                await tx.insert(rosterTable).values(
                    filledSlots.map((slot) => ({
                        season: config.seasonId,
                        user: slot.userId,
                        division: slot.divisionId,
                        team_number: slot.teamNumber,
                        is_captain: slot.isCaptain
                    }))
                )
            }
        })

        const session = await auth.api.getSession({
            headers: await headers()
        })
        if (session?.user) {
            await logAuditEntry({
                userId: session.user.id,
                action: "update",
                entityType: `week${actionConfig.week}_rosters`,
                summary: `Replaced week ${actionConfig.week} rosters for season ${config.seasonId} (${filledSlots.length} slots)`
            })
        }

        return ok(
            undefined,
            `Week ${actionConfig.week} rosters saved successfully.`
        )
    } catch (error) {
        console.error(`Error saving week ${actionConfig.week} rosters:`, error)
        return fail(
            `Something went wrong while saving week ${actionConfig.week} rosters.`
        )
    }
}

/** Notification emails shared by the edit pages. Caller must be authorized. */
export async function sendEditWeekRosterNotifications(
    actionConfig: EditWeekActionConfig,
    assignments: EditWeekAssignment[],
    removedUserIds: string[],
    seasonLabel: string
): Promise<ActionResult> {
    const rosterTable = rosterTableFor(actionConfig.week)
    const weekLabel = `Week ${actionConfig.week}`

    const allUserIds = [
        ...new Set([...assignments.map((a) => a.userId), ...removedUserIds])
    ]
    if (allUserIds.length === 0) {
        return ok(undefined, "No notifications to send.")
    }

    const uniqueDivisionIds = [...new Set(assignments.map((a) => a.divisionId))]

    const config = await getSeasonConfig()

    const [userRows, captainRows, allWeekDivisions] = await Promise.all([
        db
            .select({
                id: users.id,
                firstName: users.first_name,
                preferredName: users.preferred_name,
                email: users.email
            })
            .from(users)
            .where(inArray(users.id, allUserIds)),
        uniqueDivisionIds.length > 0
            ? db
                  .select({
                      divisionId: rosterTable.division,
                      teamNumber: rosterTable.team_number,
                      firstName: users.first_name,
                      lastName: users.last_name,
                      preferredName: users.preferred_name
                  })
                  .from(rosterTable)
                  .innerJoin(users, eq(rosterTable.user, users.id))
                  .where(
                      and(
                          eq(rosterTable.season, config.seasonId),
                          eq(rosterTable.is_captain, true),
                          inArray(rosterTable.division, uniqueDivisionIds)
                      )
                  )
            : Promise.resolve([]),
        db
            .selectDistinct({
                id: divisions.id,
                level: divisions.level
            })
            .from(rosterTable)
            .innerJoin(divisions, eq(rosterTable.division, divisions.id))
            .where(eq(rosterTable.season, config.seasonId))
            .orderBy(divisions.level)
    ])

    const tryouts = getEventsByType(config, "tryout")
    const tryoutEvent = tryouts[actionConfig.tryoutEventIndex] ?? null
    const tryoutDate = tryoutEvent
        ? formatEventDate(tryoutEvent.eventDate)
        : null
    const sessionTimes = [
        tryoutEvent?.timeSlots[0]?.startTime
            ? formatEventTime(tryoutEvent.timeSlots[0].startTime)
            : "TBD",
        tryoutEvent?.timeSlots[1]?.startTime
            ? formatEventTime(tryoutEvent.timeSlots[1].startTime)
            : "TBD",
        tryoutEvent?.timeSlots[2]?.startTime
            ? formatEventTime(tryoutEvent.timeSlots[2].startTime)
            : "TBD"
    ]

    // Build captain lookup: `${divisionId}-${teamNumber}` → name
    const captainBySlot = new Map<string, string>()
    for (const row of captainRows) {
        const name = formatDisplayName(
            row.firstName,
            row.lastName,
            row.preferredName
        )
        captainBySlot.set(`${row.divisionId}-${row.teamNumber}`, name)
    }

    const userById = new Map(userRows.map((u) => [u.id, u]))
    const removedSet = new Set(removedUserIds)

    // Group enriched assignments by userId
    const assignmentsByUser = new Map<
        string,
        Array<{
            divisionId: number
            divisionName: string
            teamNumber: number
        }>
    >()
    for (const a of assignments) {
        const list = assignmentsByUser.get(a.userId) || []
        list.push({
            divisionId: a.divisionId,
            divisionName: a.divisionName,
            teamNumber: a.teamNumber
        })
        assignmentsByUser.set(a.userId, list)
    }

    const removalRecipients: NotificationRecipient[] = []
    const assignmentRecipients: NotificationRecipient[] = []
    const htmlByUserId = new Map<string, string>()

    for (const userId of allUserIds) {
        const user = userById.get(userId)
        if (!user?.email) continue
        const firstName =
            user.preferredName || user.firstName || user.email.split("@")[0]
        const recipient = { userId, email: user.email, firstName }

        if (removedSet.has(userId)) {
            htmlByUserId.set(
                userId,
                buildRosterRemovalHtml({
                    firstName,
                    weekLabel,
                    seasonLabel
                })
            )
            removalRecipients.push(recipient)
            continue
        }

        const userAssignments = assignmentsByUser.get(userId) || []

        const assignmentBlocks = userAssignments.map((a) => {
            const divisionIndex = allWeekDivisions.findIndex(
                (d) => d.id === a.divisionId
            )
            const courtNumber =
                LEGACY_COURT_BY_DIVISION[a.divisionName] ??
                (divisionIndex >= 0 ? divisionIndex + 1 : 1)
            const matchupIndex = Math.floor((a.teamNumber - 1) / 2)
            const sessionTime = sessionTimes[matchupIndex] || "TBD"
            const captainName =
                captainBySlot.get(`${a.divisionId}-${a.teamNumber}`) || null

            const rows = [
                tryoutDate ? renderDetailRow("Date:", tryoutDate) : "",
                renderDetailRow("Time:", sessionTime),
                renderDetailRow("Court:", `Court ${courtNumber}`),
                renderDetailRow("Division:", a.divisionName),
                renderDetailRow("Team:", `Team ${a.teamNumber}`),
                captainName ? renderDetailRow("Captain:", captainName) : ""
            ].filter(Boolean)

            return renderDetailsBlock(rows)
        })

        htmlByUserId.set(
            userId,
            buildRosterAssignmentHtml({
                firstName,
                weekLabel,
                seasonLabel,
                introText: `You've been assigned to the ${weekLabel} Pre-Season Tryout for the ${seasonLabel} season. Here are your details:`,
                detailBlocks: assignmentBlocks,
                footnote: "Please plan to arrive 10 minutes early."
            })
        )
        assignmentRecipients.push(recipient)
    }

    const htmlFor = (r: NotificationRecipient) =>
        htmlByUserId.get(r.userId) ?? ""

    const removalResult = await dispatchNotification({
        type: "tryout_roster",
        recipients: removalRecipients,
        subject: `BSD Volleyball: ${weekLabel} Roster Update — ${seasonLabel}`,
        htmlBody: htmlFor,
        tag: "roster-update"
    })
    const assignmentResult = await dispatchNotification({
        type: "tryout_roster",
        recipients: assignmentRecipients,
        subject: `BSD Volleyball: Your ${weekLabel} Assignment — ${seasonLabel}`,
        htmlBody: htmlFor,
        tag: "roster-assignment"
    })

    const sent = removalResult.sent + assignmentResult.sent
    const skipped = removalResult.skipped + assignmentResult.skipped
    return ok(
        undefined,
        `${sent} notification(s) sent${skipped > 0 ? `, ${skipped} skipped (opted out or unreachable)` : ""}.`
    )
}
