"use server"

import { db } from "@/database/db"
import {
    users,
    signups,
    seasons,
    userUnavailability,
    seasonEvents
} from "@/database/schema"
import { eq, desc } from "drizzle-orm"
import { getSessionUserId, isCommissionerBySession } from "@/lib/rbac"
import {
    withAction,
    ok,
    fail,
    requireCaptainAccess
} from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"
import {
    getSeasonConfig,
    getEventsByType,
    formatEventDate
} from "@/lib/site-config"
import type {
    PlayerRatingAverages,
    PlayerRatingPrivateNote,
    PlayerRatingSharedNote,
    PlayerViewerRating
} from "@/lib/player-ratings-shared"
import { getPlayerRatingsSectionData } from "@/lib/player-ratings-summary"
import {
    getSeasonHistoryForUser,
    type SeasonHistoryEntry
} from "@/lib/player-season-history"

export interface PlayerListItem {
    id: string
    old_id: number | null
    first_name: string
    last_name: string
    preferred_name: string | null
}

export interface SeasonInfo {
    id: number
    year: number
    name: string
}

export const getSignedUpPlayers = withAction(
    async (): Promise<
        ActionResult<{ players: PlayerListItem[]; allSeasons: SeasonInfo[] }>
    > => {
        await requireCaptainAccess()

        const config = await getSeasonConfig()
        if (!config.seasonId) {
            return fail("No current season found.")
        }

        const signupRows = await db
            .select({
                id: users.id,
                old_id: users.old_id,
                first_name: users.first_name,
                last_name: users.last_name,
                preferred_name: users.preferred_name
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(eq(signups.season, config.seasonId))
            .orderBy(users.last_name, users.first_name)

        const allSeasonRows = await db
            .select({
                id: seasons.id,
                year: seasons.year,
                name: seasons.season
            })
            .from(seasons)
            .orderBy(desc(seasons.id))
            .limit(11)

        return ok({
            players: signupRows,
            allSeasons: allSeasonRows.map((s) => ({
                id: s.id,
                year: s.year,
                name: s.name
            }))
        })
    }
)

export interface PlayerDetails {
    id: string
    first_name: string
    last_name: string
    preferred_name: string | null
    pronouns: string | null
    experience: string | null
    assessment: string | null
    height: number | null
    skill_setter: boolean | null
    skill_hitter: boolean | null
    skill_passer: boolean | null
    skill_other: boolean | null
    male: boolean | null
    picture: string | null
    email: string | null
    phone: string | null
}

/** Draft placement plus that season's record — see getSeasonHistoryForUser. */
export type PlayerDraftHistory = SeasonHistoryEntry

export interface PlayerDetailsForSignups {
    player: PlayerDetails
    pairPickName: string | null
    pairReason: string | null
    unavailableDates: string | null
    playoffDates: string[]
    draftHistory: PlayerDraftHistory[]
    ratingAverages: PlayerRatingAverages
    sharedRatingNotes: PlayerRatingSharedNote[]
    privateRatingNotes: PlayerRatingPrivateNote[]
    viewerRating: PlayerViewerRating | null
}

export const getPlayerDetailsForSignups = withAction(
    async (
        playerId: string
    ): Promise<ActionResult<PlayerDetailsForSignups>> => {
        await requireCaptainAccess()

        const [playerRow] = await db
            .select({
                id: users.id,
                first_name: users.first_name,
                last_name: users.last_name,
                preferred_name: users.preferred_name,
                pronouns: users.pronouns,
                experience: users.experience,
                assessment: users.assessment,
                height: users.height,
                skill_setter: users.skill_setter,
                skill_hitter: users.skill_hitter,
                skill_passer: users.skill_passer,
                skill_other: users.skill_other,
                male: users.male,
                picture: users.picture,
                email: users.email,
                phone: users.phone
            })
            .from(users)
            .where(eq(users.id, playerId))
            .limit(1)

        if (!playerRow) {
            return fail("Player not found.")
        }

        // Current-season commissioners (and admins) may see contact info;
        // captains and court managers get the redacted sentinels.
        const isCommissioner = await isCommissionerBySession()
        const player: PlayerDetails = {
            ...playerRow,
            email: isCommissioner ? playerRow.email : null,
            phone: isCommissioner ? playerRow.phone : null
        }

        const config = await getSeasonConfig()
        const viewerUserId = await getSessionUserId()
        const ratingsSection = await getPlayerRatingsSectionData(
            playerId,
            config.seasonId ?? null,
            viewerUserId
        )

        // Get pair info from most recent signup
        let pairPickName: string | null = null
        let pairReason: string | null = null
        let unavailableDates: string | null = null

        const [mostRecentSignup] = await db
            .select({
                id: signups.id,
                pairPickId: signups.pair_pick,
                pairReason: signups.pair_reason
            })
            .from(signups)
            .innerJoin(seasons, eq(signups.season, seasons.id))
            .where(eq(signups.player, playerId))
            .orderBy(desc(seasons.id))
            .limit(1)

        if (mostRecentSignup?.pairPickId) {
            const [pairUser] = await db
                .select({
                    first_name: users.first_name,
                    last_name: users.last_name
                })
                .from(users)
                .where(eq(users.id, mostRecentSignup.pairPickId))
                .limit(1)

            if (pairUser) {
                pairPickName = `${pairUser.first_name} ${pairUser.last_name}`
            }
        }

        if (mostRecentSignup?.pairReason) {
            pairReason = mostRecentSignup.pairReason
        }

        if (mostRecentSignup) {
            const unavailRows = await db
                .select({
                    eventDate: seasonEvents.event_date
                })
                .from(userUnavailability)
                .innerJoin(
                    seasonEvents,
                    eq(seasonEvents.id, userUnavailability.event_id)
                )
                .where(eq(userUnavailability.signup_id, mostRecentSignup.id))

            if (unavailRows.length > 0) {
                unavailableDates = unavailRows
                    .map((u) => formatEventDate(u.eventDate))
                    .join(", ")
            }
        }

        // Fetch draft history
        const draftData = await getSeasonHistoryForUser(playerId)

        const playoffDates = getEventsByType(config, "playoff").map((e) =>
            formatEventDate(e.eventDate)
        )

        return ok({
            player,
            pairPickName,
            pairReason,
            unavailableDates,
            playoffDates,
            draftHistory: draftData,
            ratingAverages: ratingsSection.averages,
            sharedRatingNotes: ratingsSection.sharedNotes,
            privateRatingNotes: ratingsSection.privateNotes,
            viewerRating: ratingsSection.viewerRating
        })
    }
)
