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
    matches,
    emailTemplates
} from "@/database/schema"
import { eq, and, lt, desc, inArray, asc, or, isNull } from "drizzle-orm"
import { getSeasonConfig, type SeasonConfig } from "@/lib/site-config"
import { logAuditEntry } from "@/lib/audit-log"
import {
    isAdminOrDirectorBySession,
    isCommissionerBySession,
    hasAdministrativeAccessBySession,
    hasCaptainPagesAccessBySession,
    hasPermissionBySession
} from "@/lib/rbac"
import type { SeasonPhase } from "@/lib/season-phases"
import {
    type LexicalEmailTemplateContent,
    normalizeEmailTemplateContent,
    extractPlainTextFromEmailTemplateContent
} from "@/lib/email-template-content"

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

export interface SidebarData {
    showSignupLink: boolean
    isAdmin: boolean
    isCommissioner: boolean
    hasCaptainPagesAccess: boolean
    hasPicturesAccess: boolean
    hasConcernsAccess: boolean
    seasonNav: SeasonNavItem[]
    phase: SeasonPhase | null
}

export async function getSidebarData(): Promise<SidebarData> {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return {
            showSignupLink: false,
            isAdmin: false,
            isCommissioner: false,
            hasCaptainPagesAccess: false,
            hasPicturesAccess: false,
            hasConcernsAccess: false,
            seasonNav: [],
            phase: null
        }
    }

    const config = await getSeasonConfig()
    const seasonId = config.seasonId

    const [
        showSignupLink,
        isAdmin,
        isCommissioner,
        hasCaptainPagesAccess,
        hasPicturesAccess,
        hasConcernsAccess,
        seasonNav
    ] = await Promise.all([
        checkSignupEligibility(session.user.id),
        isAdminOrDirectorBySession(),
        isCommissionerBySession(),
        hasCaptainPagesAccessBySession(),
        seasonId
            ? hasPermissionBySession("pictures:manage", { seasonId })
            : Promise.resolve(false),
        seasonId
            ? hasPermissionBySession("concerns:view", { seasonId })
            : Promise.resolve(false),
        getRecentSeasonsNav()
    ])

    return {
        showSignupLink,
        isAdmin,
        isCommissioner,
        hasCaptainPagesAccess,
        hasPicturesAccess,
        hasConcernsAccess,
        seasonNav,
        phase: seasonId ? config.phase : null
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
    displayName: string
    lastName: string
    email: string
    phone: string | null
}

export interface CaptainWelcomeData {
    teamName: string
    divisionName: string
    divisionLevel: number | null
    seasonLabel: string
    members: CaptainWelcomeMember[]
    emailTemplate: string
    emailTemplateContent: LexicalEmailTemplateContent | null
    emailSubject: string
    seasonConfig: SeasonConfig | null
    currentUserPreferredName: string
    currentUserLastName: string
}

export async function getCaptainWelcomeData(): Promise<CaptainWelcomeData | null> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return null

    const config = await getSeasonConfig()
    if (!config.seasonId) return null

    try {
        const [teamRow] = await db
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

        const draftRows = await db
            .select({
                userId: drafts.user,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                email: users.email,
                phone: users.phone
            })
            .from(drafts)
            .innerJoin(users, eq(drafts.user, users.id))
            .where(eq(drafts.team, teamRow.id))
            .orderBy(asc(users.last_name), asc(users.first_name))

        const members: CaptainWelcomeMember[] = draftRows.map((row) => ({
            displayName: row.preferredName || row.firstName,
            lastName: row.lastName,
            email: row.email,
            phone: row.phone ?? null
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

        return {
            teamName: teamRow.name,
            divisionName: divisionRow?.name ?? "",
            divisionLevel: divisionRow?.level ?? null,
            seasonLabel,
            members,
            emailTemplate,
            emailTemplateContent,
            emailSubject,
            seasonConfig: config,
            currentUserPreferredName:
                currentUserRow?.preferredName ||
                currentUserRow?.firstName ||
                "",
            currentUserLastName: currentUserRow?.lastName || ""
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
    seasonId: number
): Promise<{ status: boolean; message: string }> {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return { status: false, message: "Not authenticated." }
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
}

export async function getNextMatch(
    userId: string,
    seasonId: number
): Promise<NextMatch | null> {
    try {
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

        if (!nextMatchRow || !nextMatchRow.date) return null

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

        return {
            date: nextMatchRow.date,
            time: nextMatchRow.time,
            court: nextMatchRow.court,
            opponentName,
            divisionName: divisionRow[0]?.name ?? "",
            week: nextMatchRow.week
        }
    } catch (error) {
        console.error("Error fetching next match:", error)
        return null
    }
}
