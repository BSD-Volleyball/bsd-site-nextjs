"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { sendEmail, STREAM_OUTBOUND } from "@/lib/postmark"
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
    week1Rosters,
    drafts,
    teams,
    seasons,
    userUnavailability
} from "@/database/schema"
import { and, desc, eq, inArray } from "drizzle-orm"
import {
    getSeasonConfig,
    getEventsByType,
    formatEventDate,
    formatEventTime
} from "@/lib/site-config"
import { fetchPlayerScores } from "@/lib/player-score"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { logAuditEntry } from "@/lib/audit-log"
import { site } from "@/config/site"

export interface Week1EditablePlayer {
    id: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    placementScore: number
    playFirstWeek: boolean
    seasonsPlayed: number
    hasPairPick: boolean
}

export interface Week1EditableSlot {
    id: number
    sessionNumber: number
    courtNumber: number
    userId: string
}

export interface Week1RosterEntry {
    sessionNumber: number
    courtNumber: number
    userId: string
}

export async function getEditWeek1Data(): Promise<{
    status: boolean
    message?: string
    seasonId: number
    seasonLabel: string
    players: Week1EditablePlayer[]
    slots: Week1EditableSlot[]
}> {
    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            seasonId: 0,
            seasonLabel: "",
            players: [],
            slots: []
        }
    }

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

        const [signupPlayersRaw, rosterSlots] = await Promise.all([
            db
                .select({
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preferred_name,
                    male: users.male,
                    signupId: signups.id,
                    pairPick: signups.pair_pick
                })
                .from(signups)
                .innerJoin(users, eq(signups.player, users.id))
                .where(eq(signups.season, config.seasonId))
                .orderBy(users.last_name, users.first_name),
            db
                .select({
                    id: week1Rosters.id,
                    sessionNumber: week1Rosters.session_number,
                    courtNumber: week1Rosters.court_number,
                    userId: week1Rosters.user
                })
                .from(week1Rosters)
                .where(eq(week1Rosters.season, config.seasonId))
                .orderBy(
                    week1Rosters.session_number,
                    week1Rosters.court_number,
                    week1Rosters.id
                )
        ])

        const userIds = signupPlayersRaw.map((p) => p.id)

        const draftRows =
            userIds.length > 0
                ? await db
                      .select({
                          userId: drafts.user,
                          seasonId: seasons.id,
                          overall: drafts.overall
                      })
                      .from(drafts)
                      .innerJoin(teams, eq(drafts.team, teams.id))
                      .innerJoin(seasons, eq(teams.season, seasons.id))
                      .where(inArray(drafts.user, userIds))
                      .orderBy(desc(seasons.id))
                : []

        const seasonsPlayedByUser = new Map<string, Set<number>>()
        for (const row of draftRows) {
            const played =
                seasonsPlayedByUser.get(row.userId) || new Set<number>()
            played.add(row.seasonId)
            seasonsPlayedByUser.set(row.userId, played)
        }

        const scoreByUser = await fetchPlayerScores(userIds, config.seasonId)

        const tryouts = getEventsByType(config, "tryout")
        const tryout1Event = tryouts[0] ?? null

        const signupIds = signupPlayersRaw.map((p) => p.signupId)
        const unavailableForTryout1 = new Set<number>()
        if (tryout1Event && signupIds.length > 0) {
            const unavailRows = await db
                .select({
                    signupId: userUnavailability.signup_id
                })
                .from(userUnavailability)
                .where(
                    and(
                        inArray(userUnavailability.signup_id, signupIds),
                        eq(userUnavailability.event_id, tryout1Event.id)
                    )
                )
            for (const row of unavailRows) {
                unavailableForTryout1.add(row.signupId!)
            }
        }

        const signupPlayers: Week1EditablePlayer[] = signupPlayersRaw.map(
            (p) => ({
                id: p.id,
                firstName: p.firstName,
                lastName: p.lastName,
                preferredName: p.preferredName,
                male: p.male,
                playFirstWeek:
                    !tryout1Event || !unavailableForTryout1.has(p.signupId),
                seasonsPlayed: seasonsPlayedByUser.get(p.id)?.size ?? 0,
                placementScore: scoreByUser.get(p.id) ?? 200,
                hasPairPick: !!p.pairPick
            })
        )

        return {
            status: true,
            seasonId: config.seasonId,
            seasonLabel,
            players: signupPlayers,
            slots: rosterSlots
        }
    } catch (error) {
        console.error("Error loading edit week 1 data:", error)
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

export async function updateWeek1Rosters(
    slots: Array<Week1RosterEntry>
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to perform this action."
        }
    }

    const config = await getSeasonConfig()
    if (!config.seasonId) {
        return {
            status: false,
            message: "No current season found."
        }
    }

    const filledSlots = slots.filter((s) => s.userId)
    const userIds = filledSlots.map((s) => s.userId)
    const uniqueUserIds = new Set(userIds)

    if (uniqueUserIds.size !== userIds.length) {
        return {
            status: false,
            message: "A player cannot be assigned to multiple week 1 slots."
        }
    }

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
            return {
                status: false,
                message:
                    "All selected players must be signed up for the current season."
            }
        }
    }

    try {
        await db.transaction(async (tx) => {
            await tx
                .delete(week1Rosters)
                .where(eq(week1Rosters.season, config.seasonId))

            if (filledSlots.length > 0) {
                await tx.insert(week1Rosters).values(
                    filledSlots.map((slot) => ({
                        season: config.seasonId,
                        user: slot.userId,
                        session_number: slot.sessionNumber,
                        court_number: slot.courtNumber
                    }))
                )
            }
        })

        const session = await auth.api.getSession({ headers: await headers() })
        if (session?.user) {
            await logAuditEntry({
                userId: session.user.id,
                action: "update",
                entityType: "week1_rosters",
                summary: `Replaced week 1 rosters for season ${config.seasonId} (${filledSlots.length} slots)`
            })
        }

        return {
            status: true,
            message: "Week 1 rosters saved successfully."
        }
    } catch (error) {
        console.error("Error saving week 1 rosters:", error)
        return {
            status: false,
            message: "Something went wrong while saving week 1 rosters."
        }
    }
}

export async function sendWeek1RosterNotifications(
    assignments: Array<{
        userId: string
        sessionNumber: number
        courtNumber: number
    }>,
    removedUserIds: string[],
    seasonLabel: string
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to perform this action."
        }
    }

    const allUserIds = [...assignments.map((a) => a.userId), ...removedUserIds]
    if (allUserIds.length === 0) {
        return { status: true, message: "No notifications to send." }
    }

    const [config, userRows] = await Promise.all([
        getSeasonConfig(),
        db
            .select({
                id: users.id,
                firstName: users.first_name,
                preferredName: users.preferred_name,
                email: users.email
            })
            .from(users)
            .where(inArray(users.id, allUserIds))
    ])

    const tryouts = getEventsByType(config, "tryout")
    const tryout1Event = tryouts[0] ?? null
    const tryoutDate = tryout1Event
        ? formatEventDate(tryout1Event.eventDate)
        : null
    const sessionTimes = [
        tryout1Event?.timeSlots[0]?.startTime
            ? formatEventTime(tryout1Event.timeSlots[0].startTime)
            : "TBD",
        tryout1Event?.timeSlots[1]?.startTime
            ? formatEventTime(tryout1Event.timeSlots[1].startTime)
            : "TBD"
    ]

    const userById = new Map(userRows.map((u) => [u.id, u]))
    const assignmentByUserId = new Map(assignments.map((a) => [a.userId, a]))
    const removedSet = new Set(removedUserIds)

    const emailResults = await Promise.allSettled(
        allUserIds
            .filter((userId) => {
                const user = userById.get(userId)
                if (!user?.email) return false
                return (
                    removedSet.has(userId) || !!assignmentByUserId.get(userId)
                )
            })
            .map((userId) => {
                const user = userById.get(userId)!
                const firstName =
                    user.preferredName ||
                    user.firstName ||
                    user.email!.split("@")[0]
                const isRemoved = removedSet.has(userId)

                if (isRemoved) {
                    return sendEmail({
                        from: site.mailFrom,
                        to: user.email!,
                        subject: `BSD Volleyball: Week 1 Roster Update — ${seasonLabel}`,
                        htmlBody: buildRosterRemovalHtml({
                            firstName,
                            weekLabel: "Week 1",
                            seasonLabel
                        }),
                        stream: STREAM_OUTBOUND,
                        tag: "roster-update"
                    })
                }

                const assignment = assignmentByUserId.get(userId)!

                const isAlternate = assignment.sessionNumber === 3
                const sessionLabel = isAlternate
                    ? "Alternate"
                    : `Session ${assignment.sessionNumber}`
                const sessionTime = isAlternate
                    ? "TBD"
                    : sessionTimes[assignment.sessionNumber - 1] || "TBD"

                const detailRows = [
                    tryoutDate ? renderDetailRow("Date:", tryoutDate) : "",
                    renderDetailRow("Session:", sessionLabel),
                    renderDetailRow("Time:", sessionTime),
                    !isAlternate
                        ? renderDetailRow(
                              "Court:",
                              `Court ${assignment.courtNumber}`
                          )
                        : ""
                ].filter(Boolean)

                return sendEmail({
                    from: site.mailFrom,
                    to: user.email!,
                    subject: `BSD Volleyball: Your Week 1 Assignment — ${seasonLabel}`,
                    htmlBody: buildRosterAssignmentHtml({
                        firstName,
                        weekLabel: "Week 1",
                        seasonLabel,
                        introText: `You've been assigned to the Week 1 Pre-Season Tryout for the ${seasonLabel} season. Here are your details:`,
                        detailBlocks: [renderDetailsBlock(detailRows)],
                        footnote: "Please plan to arrive 10 minutes early."
                    }),
                    stream: STREAM_OUTBOUND,
                    tag: "roster-assignment"
                })
            })
    )
    const sent = emailResults.filter((r) => r.status === "fulfilled").length
    emailResults
        .filter((r) => r.status === "rejected")
        .forEach((r, i) => {
            console.error(
                `Failed to send week 1 email (index ${i}):`,
                (r as PromiseRejectedResult).reason
            )
        })

    return { status: true, message: `${sent} notification(s) sent.` }
}
