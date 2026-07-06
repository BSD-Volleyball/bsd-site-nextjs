"use server"

import { withAction, ok, fail } from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"
import { db } from "@/database/db"
import {
    users,
    signups,
    seasons,
    drafts,
    teams,
    divisions,
    userUnavailability,
    seasonEvents,
    substitutions,
    matchSubstitutions,
    matches
} from "@/database/schema"
import { eq, desc, ne } from "drizzle-orm"
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
        const draftData = await db
            .select({
                seasonId: seasons.id,
                seasonYear: seasons.year,
                seasonName: seasons.season,
                divisionName: divisions.name,
                teamName: teams.name,
                round: drafts.round,
                overall: drafts.overall
            })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .innerJoin(seasons, eq(teams.season, seasons.id))
            .innerJoin(divisions, eq(teams.division, divisions.id))
            .where(eq(drafts.user, playerId))
            .orderBy(seasons.year, seasons.id)

        const playoffDates = getEventsByType(config, "playoff").map((e) =>
            formatEventDate(e.eventDate)
        )

        const isAdmin = await isAdminOrDirectorBySession()
        const sanitizedPlayer = isAdmin
            ? player
            : {
                  ...player,
                  email: "",
                  emailVerified: false,
                  phone: null,
                  emergency_contact: null,
                  onboarding_completed: null,
                  createdAt: new Date(0),
                  updatedAt: new Date(0)
              }

        return ok({
            player: sanitizedPlayer,
            signupHistory,
            draftHistory: draftData,
            ratingAverages: ratingsSection.averages,
            sharedRatingNotes: ratingsSection.sharedNotes,
            privateRatingNotes: ratingsSection.privateNotes,
            viewerRating: ratingsSection.viewerRating,
            playoffDates
        })
    }
)

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

    function makeName(
        first: string,
        last: string,
        preferred: string | null
    ): string {
        return preferred ? `${preferred} ${last}` : `${first} ${last}`
    }
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
                counterpartName: makeName(
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
                counterpartName: makeName(
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
                counterpartName: makeName(
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
                counterpartName: makeName(
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
