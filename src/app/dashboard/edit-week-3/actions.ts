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
    week3Rosters,
    teams,
    divisions,
    drafts,
    seasons
} from "@/database/schema"
import { and, desc, eq, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { logAuditEntry } from "@/lib/audit-log"
import { fetchPlayerScores, fetchRatingBasedScores } from "@/lib/player-score"
import { site } from "@/config/site"

const resend = new Resend(process.env.RESEND_API_KEY)
const logoContent = readFileSync(join(process.cwd(), "public", "logo.png"))

export interface Week3EditablePlayer {
    id: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    hasPairPick: boolean
    placementScore: number
    ratingScore: number | null
    lastDivisionName: string | null
    seasonsPlayedCount: number
}

export interface Week3EditableSlot {
    id: number
    divisionId: number
    divisionName: string
    teamNumber: number
    userId: string
    isCaptain: boolean
}

export interface Week3RosterEntry {
    divisionId: number
    teamNumber: number
    userId: string
    isCaptain: boolean
}

export async function getEditWeek3Data(): Promise<{
    status: boolean
    message?: string
    seasonId: number
    seasonLabel: string
    players: Week3EditablePlayer[]
    slots: Week3EditableSlot[]
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
        const tryout3 = config.tryout3Date.trim().toLowerCase()

        const [signupPlayersRaw, rosterSlots] = await Promise.all([
            db
                .select({
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preferred_name,
                    male: users.male,
                    datesMissing: signups.dates_missing,
                    pairPick: signups.pair_pick
                })
                .from(signups)
                .innerJoin(users, eq(signups.player, users.id))
                .where(eq(signups.season, config.seasonId))
                .orderBy(users.last_name, users.first_name),
            db
                .select({
                    id: week3Rosters.id,
                    divisionId: week3Rosters.division,
                    divisionName: divisions.name,
                    teamNumber: week3Rosters.team_number,
                    userId: week3Rosters.user,
                    isCaptain: week3Rosters.is_captain
                })
                .from(week3Rosters)
                .innerJoin(divisions, eq(week3Rosters.division, divisions.id))
                .where(eq(week3Rosters.season, config.seasonId))
                .orderBy(
                    divisions.level,
                    week3Rosters.team_number,
                    week3Rosters.id
                )
        ])

        const signupPlayers = signupPlayersRaw.filter((player) => {
            if (!tryout3) {
                return true
            }

            const missingDates = (player.datesMissing || "")
                .split(",")
                .map((value) => value.trim().toLowerCase())
                .filter(Boolean)

            return !missingDates.includes(tryout3)
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

        const existingPlayerIds = userIds.filter((id) =>
            draftRows.some((r) => r.userId === id)
        )
        const ratingScoreByUser =
            existingPlayerIds.length > 0
                ? await fetchRatingBasedScores(
                      existingPlayerIds,
                      config.seasonId
                  )
                : new Map<string, number>()

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
        console.error("Error loading edit week 3 data:", error)
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

export async function updateWeek3Rosters(
    slots: Array<Week3RosterEntry>
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
                .delete(week3Rosters)
                .where(eq(week3Rosters.season, config.seasonId))

            if (filledSlots.length > 0) {
                await tx.insert(week3Rosters).values(
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

        const session = await auth.api.getSession({ headers: await headers() })
        if (session?.user) {
            await logAuditEntry({
                userId: session.user.id,
                action: "update",
                entityType: "week3_rosters",
                summary: `Replaced week 3 rosters for season ${config.seasonId} (${filledSlots.length} slots)`
            })
        }

        return {
            status: true,
            message: "Week 3 rosters saved successfully."
        }
    } catch (error) {
        console.error("Error saving week 3 rosters:", error)
        return {
            status: false,
            message: "Something went wrong while saving week 3 rosters."
        }
    }
}

export async function sendWeek3RosterNotifications(
    assignments: Array<{
        userId: string
        divisionId: number
        divisionName: string
        teamNumber: number
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

    const allUserIds = [
        ...new Set([...assignments.map((a) => a.userId), ...removedUserIds])
    ]
    if (allUserIds.length === 0) {
        return { status: true, message: "No notifications to send." }
    }

    const uniqueDivisionIds = [...new Set(assignments.map((a) => a.divisionId))]

    const config = await getSeasonConfig()

    const [userRows, captainRows, allWeek3Divisions] = await Promise.all([
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
                      divisionId: week3Rosters.division,
                      teamNumber: week3Rosters.team_number,
                      firstName: users.first_name,
                      lastName: users.last_name,
                      preferredName: users.preferred_name
                  })
                  .from(week3Rosters)
                  .innerJoin(users, eq(week3Rosters.user, users.id))
                  .where(
                      and(
                          eq(week3Rosters.season, config.seasonId),
                          eq(week3Rosters.is_captain, true),
                          inArray(week3Rosters.division, uniqueDivisionIds)
                      )
                  )
            : Promise.resolve([]),
        db
            .selectDistinct({
                id: divisions.id,
                level: divisions.level
            })
            .from(week3Rosters)
            .innerJoin(divisions, eq(week3Rosters.division, divisions.id))
            .where(eq(week3Rosters.season, config.seasonId))
            .orderBy(divisions.level)
    ])

    const tryoutDate = config.tryout3Date || null
    const sessionTimes = [
        config.tryout3Session1Time || "TBD",
        config.tryout3Session2Time || "TBD",
        config.tryout3Session3Time || "TBD"
    ]

    const legacyCourtByDivision: Record<string, number> = {
        AA: 1,
        A: 2,
        ABA: 3,
        ABB: 4,
        BB: 7,
        BBB: 8
    }

    // Build captain lookup: `${divisionId}-${teamNumber}` → name
    const captainBySlot = new Map<string, string>()
    for (const row of captainRows) {
        const name = row.preferredName
            ? `${row.preferredName} ${row.lastName}`
            : `${row.firstName} ${row.lastName}`
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
                    subject: `BSD Volleyball: Week 3 Roster Update — ${seasonLabel}`,
                    react: EmailTemplate({
                        heading: "Roster Update",
                        content: React.createElement(
                            React.Fragment,
                            null,
                            React.createElement("p", null, `Hi ${firstName},`),
                            React.createElement(
                                "p",
                                null,
                                `We wanted to let you know that your Week 3 assignment for the ${seasonLabel} season has been removed. If you have questions, please reach out to us.`
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
                const userAssignments = assignmentsByUser.get(userId) || []

                const assignmentBlocks = userAssignments.map((a) => {
                    const divisionIndex = allWeek3Divisions.findIndex(
                        (d) => d.id === a.divisionId
                    )
                    const courtNumber =
                        legacyCourtByDivision[a.divisionName] ??
                        (divisionIndex >= 0 ? divisionIndex + 1 : 1)
                    const matchupIndex = Math.floor((a.teamNumber - 1) / 2)
                    const sessionTime = sessionTimes[matchupIndex] || "TBD"
                    const captainName =
                        captainBySlot.get(`${a.divisionId}-${a.teamNumber}`) ||
                        null

                    const rows = [
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
                                `Court ${courtNumber}`
                            )
                        ),
                        React.createElement(
                            "div",
                            { style: rowStyle, key: "division" },
                            React.createElement(
                                "span",
                                { style: labelStyle },
                                "Division:"
                            ),
                            React.createElement(
                                "span",
                                { style: valueStyle },
                                a.divisionName
                            )
                        ),
                        React.createElement(
                            "div",
                            { style: rowStyle, key: "team" },
                            React.createElement(
                                "span",
                                { style: labelStyle },
                                "Team:"
                            ),
                            React.createElement(
                                "span",
                                { style: valueStyle },
                                `Team ${a.teamNumber}`
                            )
                        ),
                        captainName &&
                            React.createElement(
                                "div",
                                { style: rowStyle, key: "captain" },
                                React.createElement(
                                    "span",
                                    { style: labelStyle },
                                    "Captain:"
                                ),
                                React.createElement(
                                    "span",
                                    { style: valueStyle },
                                    captainName
                                )
                            )
                    ].filter(Boolean)

                    return React.createElement(
                        "div",
                        {
                            key: `${a.divisionId}-${a.teamNumber}`,
                            style: detailsStyle
                        },
                        ...rows
                    )
                })

                await resend.emails.send({
                    from: site.mailFrom,
                    to: user.email,
                    subject: `BSD Volleyball: Your Week 3 Assignment — ${seasonLabel}`,
                    react: EmailTemplate({
                        heading: "Week 3 Roster Assignment",
                        content: React.createElement(
                            React.Fragment,
                            null,
                            React.createElement("p", null, `Hi ${firstName},`),
                            React.createElement(
                                "p",
                                null,
                                `You've been assigned to the Week 3 Pre-Season Tryout for the ${seasonLabel} season. Here are your details:`
                            ),
                            ...assignmentBlocks,
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
                `Failed to send week 3 notification to ${user.email}:`,
                error
            )
        }
    }

    return { status: true, message: `${sent} notification(s) sent.` }
}
