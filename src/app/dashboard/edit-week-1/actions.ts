"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Resend } from "resend"
import { EmailTemplate } from "@daveyplate/better-auth-ui/server"
import React from "react"
import { db } from "@/database/db"
import {
    signups,
    users,
    week1Rosters,
    drafts,
    teams,
    seasons
} from "@/database/schema"
import { and, desc, eq, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { fetchPlayerScores } from "@/lib/player-score"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { logAuditEntry } from "@/lib/audit-log"
import { site } from "@/config/site"

const resend = new Resend(process.env.RESEND_API_KEY)
const logoContent = readFileSync(join(process.cwd(), "public", "logo.png"))

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
                    preferredName: users.preffered_name,
                    male: users.male,
                    playFirstWeek: signups.play_1st_week,
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

        const signupPlayers: Week1EditablePlayer[] = signupPlayersRaw.map(
            (p) => ({
                id: p.id,
                firstName: p.firstName,
                lastName: p.lastName,
                preferredName: p.preferredName,
                male: p.male,
                playFirstWeek: p.playFirstWeek ?? false,
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
                preferredName: users.preffered_name,
                email: users.email
            })
            .from(users)
            .where(inArray(users.id, allUserIds))
    ])

    const tryoutDate = config.tryout1Date || null
    const sessionTimes = [
        config.tryout1Session1Time || "TBD",
        config.tryout1Session2Time || "TBD"
    ]

    const userById = new Map(userRows.map((u) => [u.id, u]))
    const assignmentByUserId = new Map(assignments.map((a) => [a.userId, a]))
    const removedSet = new Set(removedUserIds)

    const detailsStyle = {
        fontSize: "14px",
        color: "#444",
        backgroundColor: "#f9f9f9",
        border: "1px solid #e5e7eb",
        borderRadius: "6px",
        padding: "12px 16px",
        margin: "8px 0"
    }
    const rowStyle = {
        display: "flex",
        justifyContent: "space-between",
        padding: "3px 0"
    }
    const labelStyle = { color: "#6b7280" }
    const valueStyle = {
        fontWeight: "600" as const,
        textAlign: "right" as const
    }

    let sent = 0
    for (const userId of allUserIds) {
        const user = userById.get(userId)
        if (!user?.email) continue
        const firstName =
            user.preferredName || user.firstName || user.email.split("@")[0]
        const isRemoved = removedSet.has(userId)

        try {
            if (isRemoved) {
                await resend.emails.send({
                    from: site.mailFrom,
                    to: user.email,
                    subject: `BSD Volleyball: Week 1 Roster Update — ${seasonLabel}`,
                    react: EmailTemplate({
                        heading: "Roster Update",
                        content: React.createElement(
                            React.Fragment,
                            null,
                            React.createElement("p", null, `Hi ${firstName},`),
                            React.createElement(
                                "p",
                                null,
                                `We wanted to let you know that your Week 1 assignment for the ${seasonLabel} season has been removed. If you have questions about this change, please reach out to us.`
                            ),
                            React.createElement(
                                "p",
                                null,
                                "If you believe this is an error, contact us at ",
                                React.createElement(
                                    "a",
                                    { href: `mailto:${site.mailSupport}` },
                                    site.mailSupport
                                ),
                                "."
                            )
                        ),
                        action: "Go to Dashboard",
                        url: `${site.url}/dashboard`,
                        siteName: site.name,
                        baseUrl: site.url,
                        imageUrl: "cid:logo"
                    }),
                    attachments: [
                        {
                            filename: "logo.png",
                            content: logoContent,
                            contentType: "image/png",
                            inlineContentId: "logo"
                        }
                    ]
                })
            } else {
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
                    tryoutDate &&
                        React.createElement(
                            "div",
                            { style: rowStyle, key: "date" },
                            React.createElement(
                                "span",
                                { style: labelStyle },
                                "Date:"
                            ),
                            React.createElement(
                                "span",
                                { style: valueStyle },
                                tryoutDate
                            )
                        ),
                    React.createElement(
                        "div",
                        { style: rowStyle, key: "session" },
                        React.createElement(
                            "span",
                            { style: labelStyle },
                            "Session:"
                        ),
                        React.createElement(
                            "span",
                            { style: valueStyle },
                            sessionLabel
                        )
                    ),
                    React.createElement(
                        "div",
                        { style: rowStyle, key: "time" },
                        React.createElement(
                            "span",
                            { style: labelStyle },
                            "Time:"
                        ),
                        React.createElement(
                            "span",
                            { style: valueStyle },
                            sessionTime
                        )
                    ),
                    !isAlternate &&
                        React.createElement(
                            "div",
                            { style: rowStyle, key: "court" },
                            React.createElement(
                                "span",
                                { style: labelStyle },
                                "Court:"
                            ),
                            React.createElement(
                                "span",
                                { style: valueStyle },
                                `Court ${assignment.courtNumber}`
                            )
                        )
                ].filter(Boolean)

                await resend.emails.send({
                    from: site.mailFrom,
                    to: user.email,
                    subject: `BSD Volleyball: Your Week 1 Assignment — ${seasonLabel}`,
                    react: EmailTemplate({
                        heading: "Week 1 Roster Assignment",
                        content: React.createElement(
                            React.Fragment,
                            null,
                            React.createElement("p", null, `Hi ${firstName},`),
                            React.createElement(
                                "p",
                                null,
                                `You've been assigned to the Week 1 Pre-Season Tryout for the ${seasonLabel} season. Here are your details:`
                            ),
                            React.createElement(
                                "div",
                                { style: detailsStyle },
                                ...detailRows
                            ),
                            React.createElement(
                                "p",
                                {
                                    style: {
                                        fontSize: "13px",
                                        color: "#6b7280"
                                    }
                                },
                                "Please plan to arrive 10 minutes early."
                            ),
                            React.createElement(
                                "p",
                                null,
                                "Questions? Reach out at ",
                                React.createElement(
                                    "a",
                                    { href: `mailto:${site.mailSupport}` },
                                    site.mailSupport
                                ),
                                "."
                            )
                        ),
                        action: "Go to Dashboard",
                        url: `${site.url}/dashboard`,
                        siteName: site.name,
                        baseUrl: site.url,
                        imageUrl: "cid:logo"
                    }),
                    attachments: [
                        {
                            filename: "logo.png",
                            content: logoContent,
                            contentType: "image/png",
                            inlineContentId: "logo"
                        }
                    ]
                })
            }
            sent++
        } catch (error) {
            console.error(
                `Failed to send week 1 notification to ${user.email}:`,
                error
            )
        }
    }

    return { status: true, message: `${sent} notification(s) sent.` }
}
