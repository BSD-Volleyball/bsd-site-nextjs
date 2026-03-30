"use server"

import { db } from "@/database/db"
import {
    users,
    signups,
    seasons,
    drafts,
    teams,
    divisions,
    playerUnavailability,
    seasonEvents
} from "@/database/schema"
import { eq, desc, ne } from "drizzle-orm"
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
import {
    getEmptyPlayerRatingAverages,
    type PlayerRatingAverages,
    type PlayerRatingPrivateNote,
    type PlayerRatingSharedNote,
    type PlayerViewerRating
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
    role: string | null
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

async function checkAdminOrCommissionerAccess(): Promise<boolean> {
    return isCommissionerBySession()
}

export async function getPlayersForLookup(): Promise<{
    status: boolean
    message?: string
    players: PlayerListItem[]
}> {
    const hasAccess = await checkAdminOrCommissionerAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            players: []
        }
    }

    try {
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

        return {
            status: true,
            players: allUsers
        }
    } catch (error) {
        console.error("Error fetching players:", error)
        return {
            status: false,
            message: "Something went wrong.",
            players: []
        }
    }
}

export async function getPlayerDetails(playerId: string): Promise<{
    status: boolean
    message?: string
    player: PlayerDetails | null
    signupHistory: PlayerSignup[]
    draftHistory: PlayerDraftHistory[]
    ratingAverages: PlayerRatingAverages
    sharedRatingNotes: PlayerRatingSharedNote[]
    privateRatingNotes: PlayerRatingPrivateNote[]
    viewerRating: PlayerViewerRating | null
    playoffDates: string[]
}> {
    const hasAccess = await checkAdminOrCommissionerAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            player: null,
            signupHistory: [],
            draftHistory: [],
            ratingAverages: getEmptyPlayerRatingAverages(),
            sharedRatingNotes: [],
            privateRatingNotes: [],
            viewerRating: null,
            playoffDates: []
        }
    }

    try {
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
                role: users.role,
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
            return {
                status: false,
                message: "Player not found.",
                player: null,
                signupHistory: [],
                draftHistory: [],
                ratingAverages: getEmptyPlayerRatingAverages(),
                sharedRatingNotes: [],
                privateRatingNotes: [],
                viewerRating: null,
                playoffDates: []
            }
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
                    .from(playerUnavailability)
                    .innerJoin(
                        seasonEvents,
                        eq(seasonEvents.id, playerUnavailability.event_id)
                    )
                    .where(eq(playerUnavailability.signup_id, signup.id))

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
                  role: null,
                  onboarding_completed: null,
                  createdAt: new Date(0),
                  updatedAt: new Date(0)
              }

        return {
            status: true,
            player: sanitizedPlayer,
            signupHistory,
            draftHistory: draftData,
            ratingAverages: ratingsSection.averages,
            sharedRatingNotes: ratingsSection.sharedNotes,
            privateRatingNotes: ratingsSection.privateNotes,
            viewerRating: ratingsSection.viewerRating,
            playoffDates
        }
    } catch (error) {
        console.error("Error fetching player details:", error)
        return {
            status: false,
            message: "Something went wrong.",
            player: null,
            signupHistory: [],
            draftHistory: [],
            ratingAverages: getEmptyPlayerRatingAverages(),
            sharedRatingNotes: [],
            privateRatingNotes: [],
            viewerRating: null,
            playoffDates: []
        }
    }
}
