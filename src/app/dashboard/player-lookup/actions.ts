"use server"

import { withAction, ok, fail } from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"
import { db } from "@/database/db"
import {
    users,
    signups,
    seasons,
    teams,
    userUnavailability,
    seasonEvents,
    substitutions,
    matchSubstitutions,
    matches,
    userRoles,
    divisions,
    notificationLog
} from "@/database/schema"
import { eq, desc, ne, or } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import {
    getSessionUserId,
    isCommissionerBySession,
    isAdminOrDirectorBySession
} from "@/lib/rbac"
import {
    getSeasonConfig,
    getEventsByType,
    formatEventDate
} from "@/lib/site-config"
import { GHOST_CAPTAIN_ID } from "@/lib/ghost-captain"
import type {
    PlayerRatingAverages,
    PlayerRatingPrivateNote,
    PlayerRatingSharedNote,
    PlayerViewerRating
} from "@/lib/player-ratings-shared"
import { getPlayerRatingsSectionData } from "@/lib/player-ratings-summary"
import type { CareerStats } from "@/lib/player-career-stats"
import type { EloHistoryPoint } from "@/lib/player-elo"
import {
    getAllSeasons,
    getPersonalAnalytics,
    type ChampionshipEntry,
    type SeasonInfo
} from "@/lib/player-elo-data"
import { getUserSuppressionState } from "@/lib/notifications/suppressions"
import { getDraftHistoryForUser } from "@/lib/roster"
import { formatDisplayName } from "@/lib/utils"

export interface PlayerListItem {
    id: string
    old_id: number | null
    first_name: string
    last_name: string
    preferred_name: string | null
}

export interface PlayerDetails {
    id: string
    old_id: number | null
    name: string | null
    first_name: string
    last_name: string
    preferred_name: string | null
    email: string
    emailVerified: boolean
    /** 'valid' | 'unsubscribed' | 'bounced' | 'spam_complaint' */
    email_status: string
    phone: string | null
    pronouns: string | null
    emergency_contact: string | null
    experience: string | null
    assessment: string | null
    height: number | null
    skill_setter: boolean | null
    skill_hitter: boolean | null
    skill_passer: boolean | null
    skill_other: boolean | null
    male: boolean | null
    onboarding_completed: boolean | null
    seasons_list: string
    notification_list: string
    captain_eligible: boolean
    picture: string | null
    createdAt: Date
    updatedAt: Date
}

/**
 * One Postmark suppression on a player's address. `streamId` is the Postmark
 * message stream it applies to — suppressions are per-stream, so a player can
 * be blocked from broadcasts while still receiving receipts.
 */
export interface PlayerEmailSuppression {
    streamId: string
    reason: string
    origin: string
    suppressedAt: Date
    canReactivate: boolean
}

/**
 * One message the app sent to this player. Every outbound path writes a row
 * (see src/lib/email/send.ts), so this answers "did they actually get it?"
 * for notifications, receipts, broadcasts and staff mail alike.
 */
export interface PlayerEmailHistoryEntry {
    id: number
    subject: string
    /** notification | transactional | staff | broadcast | reply */
    mode: string
    /** Notification type, or the category for other modes. */
    type: string
    /** claimed | sent | failed */
    status: string
    sentAt: Date
}

export interface PlayerSignup {
    id: number
    seasonId: number
    seasonCode: string
    seasonYear: number
    seasonName: string
    age: string | null
    captain: string | null
    pair: boolean | null
    pairPickId: string | null
    pairPickName: string | null
    pairReason: string | null
    unavailableDates: string | null
    orderId: string | null
    amountPaid: string | null
    createdAt: Date
}

export interface PlayerDraftHistory {
    seasonId: number
    seasonYear: number
    seasonName: string
    divisionName: string
    teamName: string
    round: number
    overall: number
}

export interface PlayerSubHistoryEntry {
    kind: "permanent" | "regular"
    // Was this user the one subbed out, or the sub-in?
    role: "out" | "in"
    seasonLabel: string
    seasonId: number
    teamName: string
    counterpartName: string
    matchDate?: string | null
    occurredAt: Date
    reason?: string | null
    notes?: string | null
}

export const getPlayersForLookup = withAction(
    async (): Promise<ActionResult<PlayerListItem[]>> => {
        const hasAccess = await isCommissionerBySession()
        if (!hasAccess) {
            return fail("You don't have permission to access this page.")
        }

        const allUsers = await db
            .select({
                id: users.id,
                old_id: users.old_id,
                first_name: users.first_name,
                last_name: users.last_name,
                preferred_name: users.preferred_name
            })
            .from(users)
            .where(ne(users.id, GHOST_CAPTAIN_ID))
            .orderBy(users.last_name, users.first_name)

        return ok(allUsers)
    }
)

export interface PlayerDetailsResult {
    player: PlayerDetails
    signupHistory: PlayerSignup[]
    draftHistory: PlayerDraftHistory[]
    ratingAverages: PlayerRatingAverages
    sharedRatingNotes: PlayerRatingSharedNote[]
    privateRatingNotes: PlayerRatingPrivateNote[]
    viewerRating: PlayerViewerRating | null
    playoffDates: string[]
    /** Per-stream Postmark suppressions on this player's address. */
    emailSuppressions: PlayerEmailSuppression[]
    /** Most recent messages sent to this player, newest first. */
    emailHistory: PlayerEmailHistoryEntry[]
}

export const getPlayerDetails = withAction(
    async (playerId: string): Promise<ActionResult<PlayerDetailsResult>> => {
        const hasAccess = await isCommissionerBySession()
        if (!hasAccess) {
            return fail("You don't have permission to access this page.")
        }

        const [player] = await db
            .select({
                id: users.id,
                old_id: users.old_id,
                name: users.name,
                first_name: users.first_name,
                last_name: users.last_name,
                preferred_name: users.preferred_name,
                email: users.email,
                emailVerified: users.emailVerified,
                email_status: users.email_status,
                phone: users.phone,
                pronouns: users.pronouns,
                emergency_contact: users.emergency_contact,
                experience: users.experience,
                assessment: users.assessment,
                height: users.height,
                skill_setter: users.skill_setter,
                skill_hitter: users.skill_hitter,
                skill_passer: users.skill_passer,
                skill_other: users.skill_other,
                male: users.male,
                onboarding_completed: users.onboarding_completed,
                seasons_list: users.seasons_list,
                notification_list: users.notification_list,
                captain_eligible: users.captain_eligible,
                picture: users.picture,
                createdAt: users.createdAt,
                updatedAt: users.updatedAt
            })
            .from(users)
            .where(eq(users.id, playerId))
            .limit(1)

        if (!player) {
            return fail("Player not found.")
        }

        const config = await getSeasonConfig()
        const viewerUserId = await getSessionUserId()
        const ratingsSection = await getPlayerRatingsSectionData(
            playerId,
            config.seasonId ?? null,
            viewerUserId
        )

        // Fetch signup history with season info
        const signupData = await db
            .select({
                id: signups.id,
                seasonId: signups.season,
                seasonCode: seasons.code,
                seasonYear: seasons.year,
                seasonName: seasons.season,
                age: signups.age,
                captain: signups.captain,
                pair: signups.pair,
                pairPickId: signups.pair_pick,
                pairReason: signups.pair_reason,
                orderId: signups.order_id,
                amountPaid: signups.amount_paid,
                createdAt: signups.created_at
            })
            .from(signups)
            .innerJoin(seasons, eq(signups.season, seasons.id))
            .where(eq(signups.player, playerId))
            .orderBy(desc(seasons.id))

        // Fetch pair pick names and unavailability for each signup
        const signupHistory: PlayerSignup[] = await Promise.all(
            signupData.map(async (signup) => {
                let pairPickName: string | null = null
                if (signup.pairPickId) {
                    const [pairUser] = await db
                        .select({
                            first_name: users.first_name,
                            last_name: users.last_name
                        })
                        .from(users)
                        .where(eq(users.id, signup.pairPickId))
                        .limit(1)

                    if (pairUser) {
                        pairPickName = `${pairUser.first_name} ${pairUser.last_name}`
                    }
                }

                const unavailRows = await db
                    .select({
                        eventDate: seasonEvents.event_date
                    })
                    .from(userUnavailability)
                    .innerJoin(
                        seasonEvents,
                        eq(seasonEvents.id, userUnavailability.event_id)
                    )
                    .where(eq(userUnavailability.signup_id, signup.id))

                const unavailableDates =
                    unavailRows.length > 0
                        ? unavailRows
                              .map((u) => formatEventDate(u.eventDate))
                              .join(", ")
                        : null

                return {
                    ...signup,
                    pairPickName,
                    unavailableDates
                }
            })
        )

        // Fetch draft history
        const draftData = await getDraftHistoryForUser(playerId)

        const playoffDates = getEventsByType(config, "playoff").map((e) =>
            formatEventDate(e.eventDate)
        )

        const isAdmin = await isAdminOrDirectorBySession()
        // Non-admin viewers here are current-season commissioners (action
        // guard above), so email and phone stay visible for them.
        const sanitizedPlayer = isAdmin
            ? player
            : {
                  ...player,
                  emailVerified: false,
                  email_status: "",
                  emergency_contact: null,
                  onboarding_completed: null,
                  createdAt: new Date(0),
                  updatedAt: new Date(0)
              }

        const emailSuppressions: PlayerEmailSuppression[] = isAdmin
            ? (await getUserSuppressionState(player.email)).map((row) => ({
                  streamId: row.streamId,
                  reason: row.reason,
                  origin: row.origin,
                  suppressedAt: row.suppressedAt,
                  canReactivate: row.canReactivate
              }))
            : []

        // Matched on user id OR address so mail sent before the account
        // existed (or after a merge) still shows up.
        const emailHistory: PlayerEmailHistoryEntry[] = isAdmin
            ? await db
                  .select({
                      id: notificationLog.id,
                      subject: notificationLog.subject,
                      mode: notificationLog.mode,
                      type: notificationLog.notification_type,
                      status: notificationLog.status,
                      sentAt: notificationLog.created_at
                  })
                  .from(notificationLog)
                  .where(
                      or(
                          eq(notificationLog.user_id, playerId),
                          eq(notificationLog.email, player.email.toLowerCase())
                      )
                  )
                  .orderBy(desc(notificationLog.created_at))
                  .limit(25)
            : []

        return ok({
            player: sanitizedPlayer,
            signupHistory,
            draftHistory: draftData,
            ratingAverages: ratingsSection.averages,
            sharedRatingNotes: ratingsSection.sharedNotes,
            privateRatingNotes: ratingsSection.privateNotes,
            viewerRating: ratingsSection.viewerRating,
            playoffDates,
            emailSuppressions,
            emailHistory
        })
    }
)

export interface PlayerRoleInfo {
    id: number
    role: string
    season_id: number | null
    season_label: string | null
    division_label: string | null
}

/**
 * Returns this player's role assignments with season/division scope labels.
 * Admin-only: the popup hides its Roles section when this comes back empty,
 * so commissioners viewing player details simply never see role data.
 */
export async function getPlayerRoles(
    userId: string
): Promise<PlayerRoleInfo[]> {
    if (!(await isAdminOrDirectorBySession())) return []
    if (typeof userId !== "string" || !userId) return []

    const rows = await db
        .select({
            id: userRoles.id,
            role: userRoles.role,
            season_id: userRoles.season_id,
            season_code: seasons.code,
            season_year: seasons.year,
            season_season: seasons.season,
            division_name: divisions.name
        })
        .from(userRoles)
        .leftJoin(seasons, eq(userRoles.season_id, seasons.id))
        .leftJoin(divisions, eq(userRoles.division_id, divisions.id))
        .where(eq(userRoles.user_id, userId))

    return rows
        .map((r) => ({
            id: r.id,
            role: r.role,
            season_id: r.season_id,
            season_label: r.season_code
                ? `${r.season_code} ${r.season_year} ${r.season_season}`
                : null,
            division_label: r.division_name ?? null
        }))
        .sort(
            (a, b) =>
                (a.season_id === null ? 0 : 1) -
                    (b.season_id === null ? 0 : 1) ||
                a.role.localeCompare(b.role) ||
                (b.season_id ?? 0) - (a.season_id ?? 0)
        )
}

/**
 * Returns this player's substitution history — both permanent (substitutions)
 * and regular (match_substitutions), as either the original (subbed out) or
 * the sub (subbed in). Sorted most-recent first. Admin/commissioner only.
 */
export async function getPlayerSubHistory(
    userId: string
): Promise<PlayerSubHistoryEntry[]> {
    if (!(await isCommissionerBySession())) return []
    if (typeof userId !== "string" || !userId) return []

    const counterpart = alias(users, "counterpart")

    // Permanent subs where user is original_user (role = "out") or sub_user
    // (role = "in"). One join per query keeps the SQL simple.
    const permOut = await db
        .select({
            id: substitutions.id,
            seasonId: teams.season,
            seasonYear: seasons.year,
            seasonName: seasons.season,
            teamName: teams.name,
            counterFirst: counterpart.first_name,
            counterLast: counterpart.last_name,
            counterPreferred: counterpart.preferred_name,
            effectiveAt: substitutions.effective_at,
            reason: substitutions.reason,
            notes: substitutions.notes
        })
        .from(substitutions)
        .innerJoin(teams, eq(substitutions.team, teams.id))
        .innerJoin(seasons, eq(teams.season, seasons.id))
        .innerJoin(counterpart, eq(substitutions.sub_user, counterpart.id))
        .where(eq(substitutions.original_user, userId))

    const permIn = await db
        .select({
            id: substitutions.id,
            seasonId: teams.season,
            seasonYear: seasons.year,
            seasonName: seasons.season,
            teamName: teams.name,
            counterFirst: counterpart.first_name,
            counterLast: counterpart.last_name,
            counterPreferred: counterpart.preferred_name,
            effectiveAt: substitutions.effective_at,
            reason: substitutions.reason,
            notes: substitutions.notes
        })
        .from(substitutions)
        .innerJoin(teams, eq(substitutions.team, teams.id))
        .innerJoin(seasons, eq(teams.season, seasons.id))
        .innerJoin(counterpart, eq(substitutions.original_user, counterpart.id))
        .where(eq(substitutions.sub_user, userId))

    const regOut = await db
        .select({
            id: matchSubstitutions.id,
            seasonId: teams.season,
            seasonYear: seasons.year,
            seasonName: seasons.season,
            teamName: teams.name,
            counterFirst: counterpart.first_name,
            counterLast: counterpart.last_name,
            counterPreferred: counterpart.preferred_name,
            createdAt: matchSubstitutions.created_at,
            matchDate: matches.date,
            notes: matchSubstitutions.notes
        })
        .from(matchSubstitutions)
        .innerJoin(teams, eq(matchSubstitutions.team, teams.id))
        .innerJoin(seasons, eq(teams.season, seasons.id))
        .innerJoin(matches, eq(matchSubstitutions.match, matches.id))
        .innerJoin(counterpart, eq(matchSubstitutions.sub_user, counterpart.id))
        .where(eq(matchSubstitutions.original_user, userId))

    const regIn = await db
        .select({
            id: matchSubstitutions.id,
            seasonId: teams.season,
            seasonYear: seasons.year,
            seasonName: seasons.season,
            teamName: teams.name,
            counterFirst: counterpart.first_name,
            counterLast: counterpart.last_name,
            counterPreferred: counterpart.preferred_name,
            createdAt: matchSubstitutions.created_at,
            matchDate: matches.date,
            notes: matchSubstitutions.notes
        })
        .from(matchSubstitutions)
        .innerJoin(teams, eq(matchSubstitutions.team, teams.id))
        .innerJoin(seasons, eq(teams.season, seasons.id))
        .innerJoin(matches, eq(matchSubstitutions.match, matches.id))
        .innerJoin(
            counterpart,
            eq(matchSubstitutions.original_user, counterpart.id)
        )
        .where(eq(matchSubstitutions.sub_user, userId))

    function seasonLabel(name: string, year: number): string {
        return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`
    }

    const entries: PlayerSubHistoryEntry[] = [
        ...permOut.map(
            (r): PlayerSubHistoryEntry => ({
                kind: "permanent",
                role: "out",
                seasonLabel: seasonLabel(r.seasonName, r.seasonYear),
                seasonId: r.seasonId,
                teamName: r.teamName,
                counterpartName: formatDisplayName(
                    r.counterFirst,
                    r.counterLast,
                    r.counterPreferred
                ),
                occurredAt: r.effectiveAt,
                reason: r.reason,
                notes: r.notes
            })
        ),
        ...permIn.map(
            (r): PlayerSubHistoryEntry => ({
                kind: "permanent",
                role: "in",
                seasonLabel: seasonLabel(r.seasonName, r.seasonYear),
                seasonId: r.seasonId,
                teamName: r.teamName,
                counterpartName: formatDisplayName(
                    r.counterFirst,
                    r.counterLast,
                    r.counterPreferred
                ),
                occurredAt: r.effectiveAt,
                reason: r.reason,
                notes: r.notes
            })
        ),
        ...regOut.map(
            (r): PlayerSubHistoryEntry => ({
                kind: "regular",
                role: "out",
                seasonLabel: seasonLabel(r.seasonName, r.seasonYear),
                seasonId: r.seasonId,
                teamName: r.teamName,
                counterpartName: formatDisplayName(
                    r.counterFirst,
                    r.counterLast,
                    r.counterPreferred
                ),
                matchDate: r.matchDate,
                occurredAt: r.createdAt,
                notes: r.notes
            })
        ),
        ...regIn.map(
            (r): PlayerSubHistoryEntry => ({
                kind: "regular",
                role: "in",
                seasonLabel: seasonLabel(r.seasonName, r.seasonYear),
                seasonId: r.seasonId,
                teamName: r.teamName,
                counterpartName: formatDisplayName(
                    r.counterFirst,
                    r.counterLast,
                    r.counterPreferred
                ),
                matchDate: r.matchDate,
                occurredAt: r.createdAt,
                notes: r.notes
            })
        )
    ]

    entries.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    return entries
}

export interface PlayerAnalyticsResult {
    eloHistory: EloHistoryPoint[]
    currentRating: number | null
    careerStats: CareerStats
    championships: ChampionshipEntry[]
    allSeasons: SeasonInfo[]
}

/**
 * Skill rating trend plus career match/set/playoff records for one player.
 * Same computation the personal analytics page uses, exposed to admins for any
 * player. Admin/commissioner only.
 */
export const getPlayerAnalytics = withAction(
    async (playerId: string): Promise<ActionResult<PlayerAnalyticsResult>> => {
        const hasAccess = await isCommissionerBySession()
        if (!hasAccess) {
            return fail("You don't have permission to access this page.")
        }
        if (typeof playerId !== "string" || !playerId) {
            return fail("Invalid player.")
        }

        const [personal, allSeasons] = await Promise.all([
            getPersonalAnalytics(playerId),
            getAllSeasons()
        ])

        return ok({
            eloHistory: personal.eloHistory,
            currentRating: personal.currentRating,
            careerStats: personal.careerStats,
            championships: personal.championships,
            allSeasons
        })
    }
)
