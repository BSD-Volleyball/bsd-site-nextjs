"use server"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { revalidateCalendarFeeds } from "@/next/calendar-invalidation"
import {
    withAction,
    ok,
    fail,
    requireSeasonConfig
} from "@/next/action-helpers"
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
import { signups, users, week1Rosters } from "@/database/schema"
import { and, eq, inArray } from "drizzle-orm"
import {
    getSeasonConfig,
    getEventsByType,
    formatEventDate,
    formatEventTime
} from "@/lib/site-config"

import { logAuditEntry } from "@/lib/audit-log"
import { getSessionUserId, isAdminOrDirectorBySession } from "@/next/session"

export interface Week1RosterEntry {
    sessionNumber: number
    courtNumber: number
    userId: string
}

export const updateWeek1Rosters = withAction(
    async (slots: Array<Week1RosterEntry>): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("You don't have permission to perform this action.")
        }

        const config = await requireSeasonConfig()

        const filledSlots = slots.filter((s) => s.userId)
        const userIds = filledSlots.map((s) => s.userId)
        const uniqueUserIds = new Set(userIds)

        if (uniqueUserIds.size !== userIds.length) {
            return fail("A player cannot be assigned to multiple week 1 slots.")
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
                return fail(
                    "All selected players must be signed up for the current season."
                )
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

            const actorId = await getSessionUserId()
            if (actorId) {
                await logAuditEntry({
                    userId: actorId,
                    action: "update",
                    entityType: "week1_rosters",
                    // The delete above drops every week 1 row for the season,
                    // so a count alone leaves nothing to restore from. Record
                    // the placements themselves — this entry is replayable.
                    summary: `Replaced week 1 rosters for season ${config.seasonId} (${filledSlots.length} slots). Full roster: ${JSON.stringify(filledSlots)}`
                })
            }

            revalidateCalendarFeeds()
            return ok(undefined, "Week 1 rosters saved successfully.")
        } catch (error) {
            logger.error("Error saving week 1 rosters", undefined, error)
            return fail("Something went wrong while saving week 1 rosters.")
        }
    }
)

export const sendWeek1RosterNotifications = withAction(
    async (
        assignments: Array<{
            userId: string
            sessionNumber: number
            courtNumber: number
        }>,
        removedUserIds: string[],
        seasonLabel: string
    ): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("You don't have permission to perform this action.")
        }

        const allUserIds = [
            ...assignments.map((a) => a.userId),
            ...removedUserIds
        ]
        if (allUserIds.length === 0) {
            return ok(undefined, "No notifications to send.")
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
        const assignmentByUserId = new Map(
            assignments.map((a) => [a.userId, a])
        )
        const removedSet = new Set(removedUserIds)

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
                        weekLabel: "Week 1",
                        seasonLabel
                    })
                )
                removalRecipients.push(recipient)
                continue
            }

            const assignment = assignmentByUserId.get(userId)
            if (!assignment) continue

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

            htmlByUserId.set(
                userId,
                buildRosterAssignmentHtml({
                    firstName,
                    weekLabel: "Week 1",
                    seasonLabel,
                    introText: `You've been assigned to the Week 1 Pre-Season Tryout for the ${seasonLabel} season. Here are your details:`,
                    detailBlocks: [renderDetailsBlock(detailRows)],
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
            subject: `Week 1 Roster Update — ${seasonLabel}`,
            htmlBody: htmlFor,
            tag: "roster-update"
        })
        const assignmentResult = await dispatchNotification({
            type: "tryout_roster",
            recipients: assignmentRecipients,
            subject: `Your Week 1 Assignment — ${seasonLabel}`,
            htmlBody: htmlFor,
            tag: "roster-assignment"
        })

        const sent = removalResult.sent + assignmentResult.sent
        const skipped = removalResult.skipped + assignmentResult.skipped

        // Mass mail to players is attributable everywhere else (send-email
        // logs email_broadcast); this path should be no different.
        const actorId = await getSessionUserId()
        if (actorId) {
            await logAuditEntry({
                userId: actorId,
                action: "send_roster_notifications",
                entityType: "week1_rosters",
                entityId: config.seasonId ?? undefined,
                summary: `Sent week 1 roster emails for ${seasonLabel}: ${assignmentRecipients.length} assignment, ${removalRecipients.length} removal (${sent} sent, ${skipped} skipped)`
            })
        }

        return ok(
            undefined,
            `${sent} notification(s) sent${skipped > 0 ? `, ${skipped} skipped (opted out or unreachable)` : ""}.`
        )
    }
)
