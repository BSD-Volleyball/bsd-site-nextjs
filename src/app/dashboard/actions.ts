"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { checkSignupEligibility } from "@/lib/site-config"
import { db } from "@/database/db"
import {
    users,
    waitlist,
    seasons,
    teams,
    drafts,
    divisions,
    individual_divisions,
    matches,
    emailTemplates,
    seasonEvents,
    signups,
    userUnavailability,
    playoffMatchesMeta
} from "@/database/schema"
import { eq, and, lt, desc, inArray, asc, or, isNull, gte } from "drizzle-orm"
import { getSeasonConfig, type SeasonConfig } from "@/lib/site-config"
import {
    parseSourceToken,
    sourceContainsTeam,
    resolveOpponentLabel,
    type ParsedSource,
    type PlayoffNode,
    type ResolutionContext
} from "@/lib/playoff-resolution"
import {
    FOUR_TEAM_PLAYOFF,
    SIX_TEAM_PLAYOFF
} from "@/app/dashboard/create-schedule/schedule-constants"
import { logAuditEntry } from "@/lib/audit-log"
import { getActiveWaiver, recordWaiverAcceptance } from "@/lib/waivers"
import {
    isAdminOrDirectorBySession,
    isCommissionerBySession,
    hasAdministrativeAccessBySession,
    hasCaptainPagesAccessBySession,
    hasPermissionBySession
} from "@/lib/rbac"
import { formatMatchTime } from "@/lib/season-utils"
import type { SeasonPhase } from "@/lib/season-phases"
import {
    type LexicalEmailTemplateContent,
    normalizeEmailTemplateContent,
    extractPlainTextFromEmailTemplateContent
} from "@/lib/email-template-content"
import { getTeamRosterWithSubs, formatPlayerSummaryName } from "@/lib/roster"

export async function getSignupEligibility(): Promise<boolean> {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return false
    }

    return checkSignupEligibility(session.user.id)
}

export async function getIsAdminOrDirector(): Promise<boolean> {
    return isAdminOrDirectorBySession()
}

export async function getIsCommissioner(): Promise<boolean> {
    return isCommissionerBySession()
}

export async function getHasAdministrativeAccess(): Promise<boolean> {
    return hasAdministrativeAccessBySession()
}

export async function getHasCaptainPagesAccess(): Promise<boolean> {
    return hasCaptainPagesAccessBySession()
}

export async function getHasPicturesAccess(): Promise<boolean> {
    const config = await getSeasonConfig()
    if (!config.seasonId) return false
    return hasPermissionBySession("pictures:manage", {
        seasonId: config.seasonId
    })
}

export async function getHasConcernsAccess(): Promise<boolean> {
    const config = await getSeasonConfig()
    if (!config.seasonId) return false
    return hasPermissionBySession("concerns:view", {
        seasonId: config.seasonId
    })
}

export async function getSeasonPhase(): Promise<SeasonPhase | null> {
    const config = await getSeasonConfig()
    if (!config.seasonId) return null
    return config.phase
}

export interface SeasonNavDivision {
    id: number
    name: string
    level: number
}

export interface SeasonNavItem {
    id: number
    year: number
    season: string
    divisions: SeasonNavDivision[]
}

export async function getRecentSeasonsNav(): Promise<SeasonNavItem[]> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return []
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return []
        }

        const recentSeasons = await db
            .select({
                id: seasons.id,
                year: seasons.year,
                season: seasons.season
            })
            .from(seasons)
            .where(lt(seasons.id, config.seasonId))
            .orderBy(desc(seasons.id))
            .limit(3)

        if (recentSeasons.length === 0) {
            return []
        }

        const seasonIds = recentSeasons.map((s) => s.id)

        const divisionsWithDrafts = await db
            .selectDistinct({
                seasonId: teams.season,
                divisionId: divisions.id,
                divisionName: divisions.name,
                divisionLevel: divisions.level
            })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .innerJoin(divisions, eq(teams.division, divisions.id))
            .where(inArray(teams.season, seasonIds))
            .orderBy(divisions.level)

        const divisionsBySeasonId = new Map<number, SeasonNavDivision[]>()
        for (const row of divisionsWithDrafts) {
            const arr = divisionsBySeasonId.get(row.seasonId) || []
            arr.push({
                id: row.divisionId,
                name: row.divisionName,
                level: row.divisionLevel
            })
            divisionsBySeasonId.set(row.seasonId, arr)
        }

        return recentSeasons
            .filter((s) => divisionsBySeasonId.has(s.id))
            .map((s) => ({
                id: s.id,
                year: s.year,
                season: s.season,
                divisions: divisionsBySeasonId.get(s.id) || []
            }))
    } catch (error) {
        console.error("Error fetching recent seasons nav:", error)
        return []
    }
}

export interface TournamentSidebarInfo {
    tournamentId: number
    name: string
    phase: string
    canSignUp: boolean
    isCaptain: boolean
    isRostered: boolean
    showPoolTools: boolean
    showBracketTools: boolean
}

export interface SidebarData {
    showSignupLink: boolean
    hasCurrentSeasonSignup: boolean
    isAdmin: boolean
    isCommissioner: boolean
    hasCaptainPagesAccess: boolean
    isCoach: boolean
    hasPicturesAccess: boolean
    hasScoresAccess: boolean
    hasConcernsAccess: boolean
    isReferee: boolean
    isRefCoordinator: boolean
    seasonNav: SeasonNavItem[]
    phase: SeasonPhase | null
    tournament: TournamentSidebarInfo | null
}

export async function getSidebarData(): Promise<SidebarData> {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return {
            showSignupLink: false,
            hasCurrentSeasonSignup: false,
            isAdmin: false,
            isCommissioner: false,
            hasCaptainPagesAccess: false,
            isCoach: false,
            hasPicturesAccess: false,
            hasScoresAccess: false,
            hasConcernsAccess: false,
            isReferee: false,
            isRefCoordinator: false,
            seasonNav: [],
            phase: null,
            tournament: null
        }
    }

    const config = await getSeasonConfig()
    const seasonId = config.seasonId

    const [
        showSignupLink,
        hasCurrentSeasonSignup,
        isAdmin,
        isCommissioner,
        hasCaptainPagesAccess,
        hasPicturesAccess,
        hasScoresAccess,
        hasConcernsAccess,
        isReferee,
        isRefCoordinator,
        seasonNav,
        isCoach
    ] = await Promise.all([
        checkSignupEligibility(session.user.id),
        seasonId
            ? (async () => {
                  const [signup] = await db
                      .select({ id: signups.id })
                      .from(signups)
                      .where(
                          and(
                              eq(signups.season, seasonId),
                              eq(signups.player, session.user.id)
                          )
                      )
                      .limit(1)
                  return !!signup
              })()
            : Promise.resolve(false),
        isAdminOrDirectorBySession(),
        isCommissionerBySession(),
        hasCaptainPagesAccessBySession(),
        seasonId
            ? hasPermissionBySession("pictures:manage", { seasonId })
            : Promise.resolve(false),
        seasonId
            ? hasPermissionBySession("scores:enter", { seasonId })
            : Promise.resolve(false),
        seasonId
            ? hasPermissionBySession("concerns:view", { seasonId })
            : Promise.resolve(false),
        seasonId
            ? hasPermissionBySession("schedule:view", { seasonId })
            : Promise.resolve(false),
        seasonId
            ? hasPermissionBySession("schedule:manage", { seasonId })
            : Promise.resolve(false),
        getRecentSeasonsNav(),
        seasonId
            ? (async () => {
                  const [coachEntry] = await db
                      .select({ id: teams.id })
                      .from(teams)
                      .innerJoin(
                          individual_divisions,
                          and(
                              eq(individual_divisions.season, seasonId),
                              eq(individual_divisions.division, teams.division),
                              eq(individual_divisions.coaches, true)
                          )
                      )
                      .where(
                          and(
                              eq(teams.season, seasonId),
                              or(
                                  eq(teams.captain, session.user.id),
                                  eq(teams.captain2, session.user.id)
                              )
                          )
                      )
                      .limit(1)
                  return !!coachEntry
              })()
            : Promise.resolve(false)
    ])

    const tournament = await getTournamentSidebarInfo(session.user.id)

    return {
        showSignupLink,
        hasCurrentSeasonSignup,
        isAdmin,
        isCommissioner,
        hasCaptainPagesAccess,
        isCoach,
        hasPicturesAccess,
        hasScoresAccess,
        hasConcernsAccess,
        isReferee,
        isRefCoordinator,
        seasonNav,
        phase: seasonId ? config.phase : null,
        tournament
    }
}

async function getTournamentSidebarInfo(
    userId: string
): Promise<TournamentSidebarInfo | null> {
    const {
        getTournamentAvailability,
        getTournamentConfig,
        isRegistrationClosed
    } = await import("@/lib/tournament-config")
    const { TOURNAMENT_PHASE_CONFIG } = await import("@/lib/tournament-phases")
    const { tournamentRoster, tournamentTeams } = await import(
        "@/database/schema"
    )

    const config = await getTournamentConfig()
    if (!config) return null

    const [rosterRow] = await db
        .select({ teamId: tournamentRoster.team_id })
        .from(tournamentRoster)
        .where(
            and(
                eq(tournamentRoster.tournament_id, config.tournamentId),
                eq(tournamentRoster.user_id, userId)
            )
        )
        .limit(1)
    const isRostered = !!rosterRow

    let isCaptain = false
    if (rosterRow) {
        const [team] = await db
            .select({ captain: tournamentTeams.captain_user_id })
            .from(tournamentTeams)
            .where(eq(tournamentTeams.id, rosterRow.teamId))
            .limit(1)
        isCaptain = team?.captain === userId
    }

    const phaseCfg =
        TOURNAMENT_PHASE_CONFIG[
            config.phase as keyof typeof TOURNAMENT_PHASE_CONFIG
        ]
    const registrationOpen =
        phaseCfg?.showRegistration === true && !isRegistrationClosed(config)
    const allDivisionsFull = registrationOpen
        ? (await getTournamentAvailability(config)).allDivisionsFull
        : false
    const canSignUp = registrationOpen && !isRostered && !allDivisionsFull

    return {
        tournamentId: config.tournamentId,
        name: config.name,
        phase: config.phase,
        canSignUp,
        isCaptain,
        isRostered,
        showPoolTools: phaseCfg?.showPoolTools === true,
        showBracketTools: phaseCfg?.showBracketTools === true
    }
}

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

export async function expressWaitlistInterest(
    seasonId: number,
    waiverId: number,
    waiverAgreed: boolean
): Promise<{ status: boolean; message: string }> {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return { status: false, message: "Not authenticated." }
    }

    if (!waiverAgreed) {
        return {
            status: false,
            message: "You must agree to the waiver to join the waitlist."
        }
    }

    const activeWaiver = await getActiveWaiver()
    if (!activeWaiver || activeWaiver.id !== waiverId) {
        return {
            status: false,
            message:
                "The waiver was updated while you were submitting. Please reload and re-confirm the current waiver."
        }
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
            return {
                status: false,
                message: "You've already expressed interest for this season."
            }
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

        return {
            status: true,
            message:
                "Your interest has been recorded. We'll reach out if a spot opens up!"
        }
    } catch (error) {
        console.error("Failed to express waitlist interest:", error)
        return {
            status: false,
            message: "Something went wrong. Please try again."
        }
    }
}

export interface NextMatch {
    date: string
    time: string | null
    court: number | null
    opponentName: string
    divisionName: string
    week: number
    isUnavailable: boolean
}

export async function getNextMatch(
    userId: string,
    seasonId: number
): Promise<NextMatch | null> {
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

        const [nextMatchRow] = await db
            .select({
                id: matches.id,
                date: matches.date,
                time: matches.time,
                court: matches.court,
                week: matches.week,
                playoff: matches.playoff,
                homeTeamId: matches.home_team,
                awayTeamId: matches.away_team,
                divisionId: matches.division
            })
            .from(matches)
            .where(
                and(
                    eq(matches.season, seasonId),
                    // Unplayed matches: no score entered via either scoring mode
                    isNull(matches.home_score),
                    isNull(matches.home_set1_score),
                    or(
                        eq(matches.home_team, draftRecord.teamId),
                        eq(matches.away_team, draftRecord.teamId)
                    )
                )
            )
            .orderBy(matches.week, matches.time)
            .limit(1)

        if (!nextMatchRow) return null

        // Always resolve the season event by week so we can check availability.
        // The match.date column may be set directly, but availability is stored
        // against season_events entries — so we need matchEventId regardless.
        let matchDate: string | null = nextMatchRow.date
        let matchEventId: number | null = null
        const eventType = nextMatchRow.playoff ? "playoff" : "regular_season"
        const seasonEventsForType = await db
            .select({
                eventDate: seasonEvents.event_date,
                id: seasonEvents.id
            })
            .from(seasonEvents)
            .where(
                and(
                    eq(seasonEvents.season_id, seasonId),
                    eq(seasonEvents.event_type, eventType)
                )
            )
            .orderBy(asc(seasonEvents.event_date))
        const weekEvent = seasonEventsForType[nextMatchRow.week - 1]
        if (weekEvent) {
            matchEventId = weekEvent.id
            if (!matchDate) {
                matchDate = weekEvent.eventDate
            }
        }

        if (!matchDate) return null

        const opponentTeamId =
            nextMatchRow.homeTeamId === draftRecord.teamId
                ? nextMatchRow.awayTeamId
                : nextMatchRow.homeTeamId

        if (opponentTeamId === null) return null

        const [opponentTeam, divisionRow] = await Promise.all([
            db
                .select({
                    id: teams.id,
                    number: teams.number,
                    name: teams.name,
                    divisionId: teams.division
                })
                .from(teams)
                .where(eq(teams.id, opponentTeamId))
                .limit(1),
            db
                .select({ name: divisions.name })
                .from(divisions)
                .where(eq(divisions.id, nextMatchRow.divisionId))
                .limit(1)
        ])

        const opponent = opponentTeam[0]
        if (!opponent) return null

        // Check if opponent's division is drafted
        const [draftedCheck] = await db
            .select({ teamId: drafts.team })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .where(eq(teams.division, opponent.divisionId))
            .limit(1)

        const isDivisionDrafted = !!draftedCheck
        const opponentName = isDivisionDrafted
            ? opponent.name
            : opponent.number !== null
              ? `Team ${opponent.number}`
              : opponent.name

        // Check if player has marked themselves unavailable for this match's event
        let isUnavailable = false
        if (matchEventId !== null) {
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
                            eq(userUnavailability.event_id, matchEventId)
                        )
                    )
                    .limit(1)
                isUnavailable = !!unavailRecord
            }
        }

        return {
            date: matchDate,
            time: formatMatchTime(nextMatchRow.time),
            court: nextMatchRow.court,
            opponentName,
            divisionName: divisionRow[0]?.name ?? "",
            week: nextMatchRow.week,
            isUnavailable
        }
    } catch (error) {
        console.error("Error fetching next match:", error)
        return null
    }
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

function decideMatchOutcome(row: {
    homeTeamId: number | null
    awayTeamId: number | null
    homeScore: number | null
    awayScore: number | null
    homeSet1: number | null
    awaySet1: number | null
    homeSet2: number | null
    awaySet2: number | null
    homeSet3: number | null
    awaySet3: number | null
    winnerTeamId: number | null
}): { winnerTeamId: number | null; loserTeamId: number | null } {
    if (row.homeTeamId === null || row.awayTeamId === null) {
        return { winnerTeamId: null, loserTeamId: null }
    }

    let winnerTeamId = row.winnerTeamId
    if (winnerTeamId === null) {
        let homeWins = row.homeScore
        let awayWins = row.awayScore
        if (homeWins === null || awayWins === null) {
            let h = 0
            let a = 0
            const sets: Array<[number | null, number | null]> = [
                [row.homeSet1, row.awaySet1],
                [row.homeSet2, row.awaySet2],
                [row.homeSet3, row.awaySet3]
            ]
            let played = 0
            for (const [hs, as] of sets) {
                if (hs === null || as === null) continue
                played++
                if (hs > as) h++
                else if (as > hs) a++
            }
            if (played > 0) {
                homeWins = h
                awayWins = a
            }
        }
        if (homeWins !== null && awayWins !== null) {
            if (homeWins > awayWins) winnerTeamId = row.homeTeamId
            else if (awayWins > homeWins) winnerTeamId = row.awayTeamId
        }
    }

    if (winnerTeamId === null) {
        return { winnerTeamId: null, loserTeamId: null }
    }
    const loserTeamId =
        winnerTeamId === row.homeTeamId ? row.awayTeamId : row.homeTeamId
    return { winnerTeamId, loserTeamId }
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

        // Teams in this division, ordered by rank (rank=1 is the top seed).
        const divisionTeams = await db
            .select({
                id: teams.id,
                number: teams.number,
                name: teams.name,
                rank: teams.rank
            })
            .from(teams)
            .where(
                and(eq(teams.season, seasonId), eq(teams.division, divisionId))
            )

        const seedTeamIdByNumber = new Map<number, number>()
        for (const t of divisionTeams) {
            if (t.rank !== null) seedTeamIdByNumber.set(t.rank, t.id)
        }
        const teamLabelById = new Map<number, string>()
        const teamNumberById = new Map<number, number>()
        for (const t of divisionTeams) {
            teamLabelById.set(
                t.id,
                t.number !== null ? `#${t.number} ${t.name}` : t.name
            )
            if (t.number !== null) teamNumberById.set(t.id, t.number)
        }

        const [indivDivRow] = await db
            .select({ teamCount: individual_divisions.teams })
            .from(individual_divisions)
            .where(
                and(
                    eq(individual_divisions.season, seasonId),
                    eq(individual_divisions.division, divisionId)
                )
            )
            .limit(1)
        const teamCount = indivDivRow?.teamCount ?? null
        const template =
            teamCount === 4
                ? FOUR_TEAM_PLAYOFF
                : teamCount === 6
                  ? SIX_TEAM_PLAYOFF
                  : null
        const workSourceByMatchNum = new Map<number, string | null>(
            template?.map((t) => [t.matchNum, t.workTeam]) ?? []
        )

        // All playoff matches + their meta for this division.
        const metaRows = await db
            .select({
                matchId: playoffMatchesMeta.match_id,
                matchNum: playoffMatchesMeta.match_num,
                week: playoffMatchesMeta.week,
                homeSource: playoffMatchesMeta.home_source,
                awaySource: playoffMatchesMeta.away_source,
                workSource: playoffMatchesMeta.work_source,
                workTeamId: playoffMatchesMeta.work_team
            })
            .from(playoffMatchesMeta)
            .where(
                and(
                    eq(playoffMatchesMeta.season, seasonId),
                    eq(playoffMatchesMeta.division, divisionId)
                )
            )

        const matchIds = metaRows
            .map((r) => r.matchId)
            .filter((id): id is number => id !== null)
        const matchRows = matchIds.length
            ? await db
                  .select({
                      id: matches.id,
                      week: matches.week,
                      date: matches.date,
                      time: matches.time,
                      court: matches.court,
                      homeTeamId: matches.home_team,
                      awayTeamId: matches.away_team,
                      homeScore: matches.home_score,
                      awayScore: matches.away_score,
                      homeSet1: matches.home_set1_score,
                      awaySet1: matches.away_set1_score,
                      homeSet2: matches.home_set2_score,
                      awaySet2: matches.away_set2_score,
                      homeSet3: matches.home_set3_score,
                      awaySet3: matches.away_set3_score,
                      winnerTeamId: matches.winner
                  })
                  .from(matches)
                  .where(inArray(matches.id, matchIds))
            : []
        const matchById = new Map(matchRows.map((m) => [m.id, m]))

        // Build PlayoffNode graph keyed by matchNum.
        const nodeByMatchNum = new Map<number, PlayoffNode>()
        for (const meta of metaRows) {
            const m = meta.matchId !== null ? matchById.get(meta.matchId) : null
            const effectiveWorkSource =
                meta.workSource ??
                workSourceByMatchNum.get(meta.matchNum) ??
                null
            const outcome = m
                ? decideMatchOutcome(m)
                : { winnerTeamId: null, loserTeamId: null }
            nodeByMatchNum.set(meta.matchNum, {
                matchNum: meta.matchNum,
                week: meta.week,
                homeSource: parseSourceToken(meta.homeSource),
                awaySource: parseSourceToken(meta.awaySource),
                workSource: parseSourceToken(effectiveWorkSource),
                homeTeamId: m?.homeTeamId ?? null,
                awayTeamId: m?.awayTeamId ?? null,
                workTeamId: meta.workTeamId ?? null,
                winnerTeamId: outcome.winnerTeamId,
                loserTeamId: outcome.loserTeamId
            })
        }

        const ctx: ResolutionContext = {
            seedTeamIdByNumber,
            nodeByMatchNum,
            teamNumberById
        }

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
        for (const node of nodeByMatchNum.values()) {
            const m =
                metaRows.find((r) => r.matchNum === node.matchNum)?.matchId !==
                null
                    ? (matchRows.find(
                          (mr) =>
                              mr.id ===
                              metaRows.find((r) => r.matchNum === node.matchNum)
                                  ?.matchId
                      ) ?? null)
                    : null
            const isFinished = node.winnerTeamId !== null
            const playHome = sourceContainsTeam(node.homeSource, teamId, ctx)
            const playAway = sourceContainsTeam(node.awaySource, teamId, ctx)
            const work = sourceContainsTeam(node.workSource, teamId, ctx)
            void m
            matchInvolvement.set(node.matchNum, {
                node,
                playHome,
                playAway,
                work,
                isFinished
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
        const formatCondition = (
            playOrWork: { contains: boolean; condition: string | null } | null,
            sideCondition?: string | null
        ): string | null => {
            const c = playOrWork?.condition ?? null
            if (c) return c
            return sideCondition ?? null
        }
        for (const mi of matchInvolvement.values()) {
            if (mi.node.week !== targetWeek) continue
            if (mi.isFinished) continue

            const matchRow = (() => {
                const meta = metaRows.find(
                    (r) => r.matchNum === mi.node.matchNum
                )
                return meta?.matchId
                    ? (matchById.get(meta.matchId) ?? null)
                    : null
            })()
            const date = matchRow?.date ?? targetWeekDate
            const time = matchRow?.time ?? null
            const court = matchRow?.court ?? null

            // Play row: home or away resolves to team.
            if (mi.playHome.contains || mi.playAway.contains) {
                const teamSide = mi.playHome.contains ? "home" : "away"
                const otherSource: ParsedSource =
                    teamSide === "home"
                        ? mi.node.awaySource
                        : mi.node.homeSource
                const opponentLabel = resolveOpponentLabel(
                    otherSource,
                    ctx,
                    teamLabelById
                )
                items.push({
                    role: "play",
                    matchNum: mi.node.matchNum,
                    week: mi.node.week,
                    date,
                    time: formatMatchTime(time),
                    court,
                    opponentLabel,
                    isUnavailable,
                    condition: formatCondition(
                        teamSide === "home" ? mi.playHome : mi.playAway
                    )
                })
            }

            // Work row.
            if (mi.work.contains) {
                items.push({
                    role: "work",
                    matchNum: mi.node.matchNum,
                    week: mi.node.week,
                    date,
                    time: formatMatchTime(time),
                    court,
                    opponentLabel: null,
                    isUnavailable: false,
                    condition: formatCondition(mi.work)
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
        console.error("Error fetching playoff next matches:", error)
        return null
    }
}
