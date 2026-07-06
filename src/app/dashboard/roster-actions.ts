"use server"

import type { ActionResult } from "@/lib/action-helpers"
import { withAction, ok, fail } from "@/lib/action-helpers"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    users,
    waitlist,
    seasons,
    teams,
    drafts,
    divisions,
    individual_divisions,
    emailTemplates,
    seasonEvents,
    signups,
    userUnavailability
} from "@/database/schema"
import { eq, and, desc, inArray, asc, gte } from "drizzle-orm"
import { getSeasonConfig, type SeasonConfig } from "@/lib/site-config"
import { logAuditEntry } from "@/lib/audit-log"
import { getActiveWaiver, recordWaiverAcceptance } from "@/lib/waivers"
import {
    isAdminOrDirectorBySession,
    isCommissionerBySession,
    hasCaptainPagesAccessBySession
} from "@/lib/rbac"
import {
    normalizeEmailTemplateContent,
    extractPlainTextFromEmailTemplateContent,
    type LexicalEmailTemplateContent
} from "@/lib/email-template-content"
import { getTeamRosterWithSubs, formatPlayerSummaryName } from "@/lib/roster"

export interface TeamRosterPlayer {
    id: string
    displayName: string
    lastName: string
    isCaptain: boolean
}

export interface TeamRosterData {
    status: boolean
    message?: string
    teamName: string
    players: TeamRosterPlayer[]
}

export async function getTeamRoster(teamId: number): Promise<TeamRosterData> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return {
            status: false,
            message: "Not authenticated.",
            teamName: "",
            players: []
        }
    }

    try {
        const [team] = await db
            .select({
                id: teams.id,
                name: teams.name,
                captain: teams.captain
            })
            .from(teams)
            .where(eq(teams.id, teamId))
            .limit(1)

        if (!team) {
            return {
                status: false,
                message: "Team not found.",
                teamName: "",
                players: []
            }
        }

        const draftRows = await db
            .select({
                userId: drafts.user,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name
            })
            .from(drafts)
            .innerJoin(users, eq(drafts.user, users.id))
            .where(eq(drafts.team, teamId))

        const players: TeamRosterPlayer[] = draftRows.map((row) => ({
            id: row.userId,
            displayName: row.preferredName || row.firstName,
            lastName: row.lastName,
            isCaptain: row.userId === team.captain
        }))

        players.sort((a, b) => {
            const lastCmp = a.lastName
                .toLowerCase()
                .localeCompare(b.lastName.toLowerCase())
            if (lastCmp !== 0) return lastCmp
            return a.displayName
                .toLowerCase()
                .localeCompare(b.displayName.toLowerCase())
        })

        return {
            status: true,
            teamName: team.name,
            players
        }
    } catch (error) {
        console.error("Error fetching team roster:", error)
        return {
            status: false,
            message: "Something went wrong.",
            teamName: "",
            players: []
        }
    }
}

export interface CaptainWelcomeMember {
    userId: string
    displayName: string
    lastName: string
    email: string
    phone: string | null
    // Original draftee whose slot this player is filling, when applicable.
    subForName?: string
}

export interface CaptainSubbedOutOriginal {
    userId: string
    displayName: string
    lastName: string
    originalRound: number
    replacedByName: string
}

export interface CaptainSeasonInfo {
    id: number
    year: number
    name: string
}

export interface CaptainWelcomeData {
    teamName: string
    divisionName: string
    divisionLevel: number | null
    seasonLabel: string
    members: CaptainWelcomeMember[]
    subbedOutOriginals: CaptainSubbedOutOriginal[]
    emailTemplate: string
    emailTemplateContent: LexicalEmailTemplateContent | null
    emailSubject: string
    seasonConfig: SeasonConfig | null
    currentUserPreferredName: string
    currentUserLastName: string
    divisionDraftDate: string | null
    nextMatchAvailability: {
        eventDate: string
        unavailableUserIds: string[]
    } | null
    allSeasons: CaptainSeasonInfo[]
    playerPicUrl: string
}

export async function getCaptainWelcomeData(): Promise<CaptainWelcomeData | null> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return null

    const config = await getSeasonConfig()
    if (!config.seasonId) return null

    try {
        const [primaryTeamRow] = await db
            .select({
                id: teams.id,
                name: teams.name,
                divisionId: teams.division
            })
            .from(teams)
            .where(
                and(
                    eq(teams.season, config.seasonId),
                    eq(teams.captain, session.user.id)
                )
            )
            .limit(1)

        // If not the primary captain, check if this user is a co-coach (captain2)
        // in a coaches-mode division
        let teamRow = primaryTeamRow
        if (!teamRow) {
            const [coachTeamRow] = await db
                .select({
                    id: teams.id,
                    name: teams.name,
                    divisionId: teams.division
                })
                .from(teams)
                .innerJoin(
                    individual_divisions,
                    and(
                        eq(individual_divisions.season, config.seasonId),
                        eq(individual_divisions.division, teams.division),
                        eq(individual_divisions.coaches, true)
                    )
                )
                .where(
                    and(
                        eq(teams.season, config.seasonId),
                        eq(teams.captain2, session.user.id)
                    )
                )
                .limit(1)
            teamRow = coachTeamRow
        }

        if (!teamRow) return null

        const [divisionRow] = await db
            .select({
                name: divisions.name,
                level: divisions.level
            })
            .from(divisions)
            .where(eq(divisions.id, teamRow.divisionId))
            .limit(1)

        const [currentUserRow] = await db
            .select({
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name
            })
            .from(users)
            .where(eq(users.id, session.user.id))
            .limit(1)

        const [seasonRow] = await db
            .select({ year: seasons.year, season: seasons.season })
            .from(seasons)
            .where(eq(seasons.id, config.seasonId))
            .limit(1)

        const seasonLabel = seasonRow
            ? `${seasonRow.season.charAt(0).toUpperCase() + seasonRow.season.slice(1)} ${seasonRow.year}`
            : String(config.seasonId)

        // Sub-aware roster: members reflects the currently-active player on
        // each slot (so a permanent sub takes the original draftee's place
        // and receives the welcome email). Subbed-out originals are surfaced
        // separately as a footnote on the welcome card.
        const rosterEntries = await getTeamRosterWithSubs(
            config.seasonId,
            teamRow.id
        )
        const activeUserIds = rosterEntries.map((e) => e.activeUser.id)
        const contactRows = activeUserIds.length
            ? await db
                  .select({
                      id: users.id,
                      email: users.email,
                      phone: users.phone
                  })
                  .from(users)
                  .where(inArray(users.id, activeUserIds))
            : []
        const contactByUser = new Map(contactRows.map((r) => [r.id, r]))

        const members: CaptainWelcomeMember[] = rosterEntries
            .map((e) => {
                const c = contactByUser.get(e.activeUser.id)
                const isSub = e.chain.length > 0
                return {
                    userId: e.activeUser.id,
                    displayName:
                        e.activeUser.preferredName || e.activeUser.firstName,
                    lastName: e.activeUser.lastName,
                    email: c?.email ?? "",
                    phone: c?.phone ?? null,
                    ...(isSub
                        ? {
                              subForName: formatPlayerSummaryName(
                                  e.originalUser
                              )
                          }
                        : {})
                }
            })
            .sort((a, b) => {
                const lc = a.lastName
                    .toLowerCase()
                    .localeCompare(b.lastName.toLowerCase())
                if (lc !== 0) return lc
                return a.displayName
                    .toLowerCase()
                    .localeCompare(b.displayName.toLowerCase())
            })

        const subbedOutOriginals: CaptainSubbedOutOriginal[] = rosterEntries
            .filter((e) => e.chain.length > 0)
            .map((e) => ({
                userId: e.originalUser.id,
                displayName:
                    e.originalUser.preferredName || e.originalUser.firstName,
                lastName: e.originalUser.lastName,
                originalRound: e.round,
                replacedByName: formatPlayerSummaryName(e.activeUser)
            }))

        let emailTemplate = ""
        let emailTemplateContent: LexicalEmailTemplateContent | null = null
        let emailSubject = ""

        try {
            const [template] = await db
                .select({
                    content: emailTemplates.content,
                    subject: emailTemplates.subject
                })
                .from(emailTemplates)
                .where(eq(emailTemplates.name, "welcome from captains"))
                .limit(1)

            if (template) {
                emailTemplateContent = normalizeEmailTemplateContent(
                    template.content
                )
                emailTemplate = extractPlainTextFromEmailTemplateContent(
                    template.content
                )
                emailSubject = template.subject || ""
            }
        } catch (templateError) {
            console.error(
                "Error fetching welcome from captains template:",
                templateError
            )
        }

        // Find this division's specific draft date
        // Divisions are drafted in ascending level order (lowest level = drafted first)
        // so the division's rank among season divisions maps to the Nth draft event
        let divisionDraftDate: string | null = null
        try {
            const seasonDivisionRows = await db
                .selectDistinct({ divisionId: teams.division })
                .from(teams)
                .where(eq(teams.season, config.seasonId))

            const divisionIds = seasonDivisionRows.map((r) => r.divisionId)

            if (divisionIds.length > 0) {
                const divisionLevelRows = await db
                    .select({ id: divisions.id, level: divisions.level })
                    .from(divisions)
                    .where(inArray(divisions.id, divisionIds))
                    .orderBy(asc(divisions.level))

                const divisionIndex = divisionLevelRows.findIndex(
                    (d) => d.id === teamRow.divisionId
                )

                const draftEventRows = await db
                    .select({ event_date: seasonEvents.event_date })
                    .from(seasonEvents)
                    .where(
                        and(
                            eq(seasonEvents.season_id, config.seasonId),
                            eq(seasonEvents.event_type, "draft")
                        )
                    )
                    .orderBy(asc(seasonEvents.sort_order))

                if (divisionIndex >= 0 && draftEventRows[divisionIndex]) {
                    divisionDraftDate = draftEventRows[divisionIndex].event_date
                }
            }
        } catch (draftDateError) {
            console.error("Error fetching division draft date:", draftDateError)
        }

        // Find next match availability for the team's roster
        let nextMatchAvailability: CaptainWelcomeData["nextMatchAvailability"] =
            null
        try {
            const today = new Date().toISOString().split("T")[0]
            const [nextEvent] = await db
                .select({
                    id: seasonEvents.id,
                    event_date: seasonEvents.event_date
                })
                .from(seasonEvents)
                .where(
                    and(
                        eq(seasonEvents.season_id, config.seasonId),
                        inArray(seasonEvents.event_type, [
                            "regular_season",
                            "playoff"
                        ]),
                        gte(seasonEvents.event_date, today)
                    )
                )
                .orderBy(asc(seasonEvents.sort_order))
                .limit(1)

            if (nextEvent && members.length > 0) {
                const memberIds = members.map((m) => m.userId)
                const signupRows = await db
                    .select({ id: signups.id, player: signups.player })
                    .from(signups)
                    .where(
                        and(
                            eq(signups.season, config.seasonId),
                            inArray(signups.player, memberIds)
                        )
                    )
                const signupToUser = new Map(
                    signupRows.map((s) => [s.id, s.player])
                )
                const signupIds = signupRows.map((s) => s.id)
                let unavailableUserIds: string[] = []
                if (signupIds.length > 0) {
                    const unavailRows = await db
                        .select({
                            signup_id: userUnavailability.signup_id
                        })
                        .from(userUnavailability)
                        .where(
                            and(
                                inArray(
                                    userUnavailability.signup_id,
                                    signupIds
                                ),
                                eq(userUnavailability.event_id, nextEvent.id)
                            )
                        )
                    unavailableUserIds = unavailRows
                        .map((r) => signupToUser.get(r.signup_id!)!)
                        .filter(Boolean)
                }
                nextMatchAvailability = {
                    eventDate: nextEvent.event_date,
                    unavailableUserIds
                }
            }
        } catch (availError) {
            console.error("Error fetching next match availability:", availError)
        }

        const allSeasonRows = await db
            .select({
                id: seasons.id,
                year: seasons.year,
                name: seasons.season
            })
            .from(seasons)
            .orderBy(desc(seasons.id))
            .limit(11)

        return {
            teamName: teamRow.name,
            divisionName: divisionRow?.name ?? "",
            divisionLevel: divisionRow?.level ?? null,
            seasonLabel,
            members,
            subbedOutOriginals,
            emailTemplate,
            emailTemplateContent,
            emailSubject,
            seasonConfig: config,
            currentUserPreferredName:
                currentUserRow?.preferredName ||
                currentUserRow?.firstName ||
                "",
            currentUserLastName: currentUserRow?.lastName || "",
            divisionDraftDate,
            nextMatchAvailability,
            allSeasons: allSeasonRows.map((s) => ({
                id: s.id,
                year: s.year,
                name: s.name
            })),
            playerPicUrl: process.env.PLAYER_PIC_URL || ""
        }
    } catch (error) {
        console.error("Error fetching captain welcome data:", error)
        return null
    }
}

export async function logContactDetailsViewed(): Promise<void> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return

    const config = await getSeasonConfig()
    if (!config.seasonId) return

    const [teamRow] = await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(
            and(
                eq(teams.season, config.seasonId),
                eq(teams.captain, session.user.id)
            )
        )
        .limit(1)

    await logAuditEntry({
        userId: session.user.id,
        action: "view",
        entityType: "teams",
        entityId: teamRow?.id,
        summary: `Captain viewed team contact details for team "${teamRow?.name ?? "unknown"}" (season ${config.seasonId})`
    })
}

export interface PlayerTeamAssignment {
    teamName: string
    divisionName: string
    captainName: string
    captainEmail: string
    roster: { displayName: string; lastName: string; isCaptain: boolean }[]
}

export async function getPlayerTeamAssignment(
    userId: string,
    seasonId: number
): Promise<PlayerTeamAssignment | null> {
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
            .select({
                teamId: teams.id,
                teamName: teams.name,
                captainId: teams.captain,
                divisionId: teams.division
            })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .where(and(eq(drafts.user, userId), eq(teams.season, seasonId)))
            .limit(1)

        if (!draftRecord) return null

        const [divisionRow] = await db
            .select({ name: divisions.name })
            .from(divisions)
            .where(eq(divisions.id, draftRecord.divisionId))
            .limit(1)

        const [captainRow] = await db
            .select({
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                email: users.email
            })
            .from(users)
            .where(eq(users.id, draftRecord.captainId))
            .limit(1)

        const captainName = captainRow
            ? captainRow.preferredName
                ? `${captainRow.preferredName} ${captainRow.lastName}`
                : `${captainRow.firstName} ${captainRow.lastName}`
            : ""

        const rosterRows = await db
            .select({
                userId: drafts.user,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name
            })
            .from(drafts)
            .innerJoin(users, eq(drafts.user, users.id))
            .where(eq(drafts.team, draftRecord.teamId))
            .orderBy(asc(users.last_name), asc(users.first_name))

        const roster = rosterRows.map((row) => ({
            displayName: row.preferredName || row.firstName,
            lastName: row.lastName,
            isCaptain: row.userId === draftRecord.captainId
        }))

        return {
            teamName: draftRecord.teamName,
            divisionName: divisionRow?.name ?? "",
            captainName,
            captainEmail: captainRow?.email ?? "",
            roster
        }
    } catch (error) {
        console.error("Error fetching player team assignment:", error)
        return null
    }
}

export const expressWaitlistInterest = withAction(
    async (
        seasonId: number,
        waiverId: number,
        waiverAgreed: boolean
    ): Promise<ActionResult> => {
        const session = await auth.api.getSession({ headers: await headers() })

        if (!session?.user) {
            return fail("Not authenticated.")
        }

        if (!waiverAgreed) {
            return fail("You must agree to the waiver to join the waitlist.")
        }

        const activeWaiver = await getActiveWaiver()
        if (!activeWaiver || activeWaiver.id !== waiverId) {
            return fail(
                "The waiver was updated while you were submitting. Please reload and re-confirm the current waiver."
            )
        }

        try {
            // Check if user is already on the waitlist for this season
            const [existing] = await db
                .select({ id: waitlist.id })
                .from(waitlist)
                .where(
                    and(
                        eq(waitlist.season, seasonId),
                        eq(waitlist.user, session.user.id)
                    )
                )
                .limit(1)

            if (existing) {
                return fail(
                    "You've already expressed interest for this season."
                )
            }

            await recordWaiverAcceptance(session.user.id, activeWaiver.id)

            await db.insert(waitlist).values({
                season: seasonId,
                user: session.user.id,
                created_at: new Date()
            })

            await logAuditEntry({
                userId: session.user.id,
                action: "create",
                entityType: "waitlist",
                summary: `Expressed waitlist interest for season ${seasonId}`
            })

            return ok(
                undefined,
                "Your interest has been recorded. We'll reach out if a spot opens up!"
            )
        } catch (error) {
            console.error("Failed to express waitlist interest:", error)
            return fail("Something went wrong. Please try again.")
        }
    }
)
