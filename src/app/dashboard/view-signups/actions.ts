"use server"

import { formatSeasonLabel } from "@/lib/season-utils"
import { db } from "@/database/db"
import {
    users,
    signups,
    seasons,
    playerRatings,
    userUnavailability,
    seasonEvents
} from "@/database/schema"
import { and, eq, inArray, desc } from "drizzle-orm"
import {
    getSeasonConfig,
    getEventsByType,
    formatEventDate
} from "@/lib/site-config"
import { getSessionUserId, isCommissionerBySession } from "@/next/session"
import { logAuditEntry } from "@/lib/audit-log"
import {
    type ActionResult,
    fail,
    ok,
    requireCaptainAccess,
    requireSeasonConfig,
    requireSession,
    withAction
} from "@/next/action-helpers"
import type {
    PlayerRatingAverages,
    PlayerRatingPrivateNote,
    PlayerRatingSharedNote,
    PlayerViewerRating
} from "@/lib/player-ratings-shared"
import { getPlayerRatingsSectionData } from "@/lib/player-ratings-summary"
import {
    getCaptainDivisionsByUser,
    getCurrentDraftDivisions,
    getLastDraftInfoByUser,
    getPlayerNamesById,
    getUnavailableDatesBySignup
} from "@/lib/roster"
import { getSeasonHistoryForUser } from "@/lib/player-season-history"
import type {
    PlayerDetails as AdminPlayerDetails,
    PlayerDraftHistory,
    PlayerSignup
} from "@/app/dashboard/player-lookup/actions"

export interface SignupCsvEntry {
    oldId: number
    firstName: string
    lastName: string
    preferredName: string | null
    pairPickName: string | null
    male: boolean | null
    age: string | null
    experience: string | null
    assessment: string | null
    height: number | null
    picture: string | null
    skillPasser: boolean | null
    skillSetter: boolean | null
    skillHitter: boolean | null
    skillOther: boolean | null
    unavailableDates: string | null
    lastDraftSeason: string | null
    lastDraftDivision: string | null
    lastDraftCaptain: string | null
    captainIn: string | null
    draftedIn: string | null
    viewerOverallRating: number | null
    viewerPassingRating: number | null
    viewerSettingRating: number | null
    viewerHittingRating: number | null
    viewerServingRating: number | null
    viewerBlockingRating: number | null
    viewerSharedNotes: string | null
    viewerPrivateNotes: string | null
}

export const getSignupsCsvData = withAction(
    async (): Promise<
        ActionResult<{ entries: SignupCsvEntry[]; seasonLabel: string }>
    > => {
        await requireCaptainAccess()
        const session = await requireSession()
        const config = await requireSeasonConfig()

        const seasonLabel = formatSeasonLabel(config)

        const signupRows = await db
            .select({
                signupId: signups.id,
                userId: signups.player,
                oldId: users.old_id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                male: users.male,
                age: signups.age,
                pairPickId: signups.pair_pick,
                experience: users.experience,
                assessment: users.assessment,
                height: users.height,
                picture: users.picture,
                skillPasser: users.skill_passer,
                skillSetter: users.skill_setter,
                skillHitter: users.skill_hitter,
                skillOther: users.skill_other
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(eq(signups.season, config.seasonId))
            .orderBy(users.last_name, users.first_name)

        const userIds = signupRows.map((r) => r.userId)
        const signupIds = signupRows.map((r) => r.signupId)
        const sessionUserId = session.user.id

        // The per-signup lookups below only depend on signupRows, so they
        // run in parallel instead of as a sequential waterfall.
        const pairPickIds = signupRows
            .map((r) => r.pairPickId)
            .filter((id): id is string => id !== null)

        const [
            unavailabilityMap,
            pairPickNames,
            lastDraftInfo,
            draftedInMap,
            viewerRatingsByPlayerId,
            captainDivisionMap
        ] = await Promise.all([
            // Player unavailability per signup
            getUnavailableDatesBySignup(signupIds),
            // Pair pick user names
            getPlayerNamesById(pairPickIds),
            // Last draft info (season label, division, captain name)
            getLastDraftInfoByUser(userIds),
            // Current-season draft assignments
            getCurrentDraftDivisions(config.seasonId, userIds),
            // The viewer's own ratings for these players
            (async () => {
                const map = new Map<
                    string,
                    {
                        overall: number | null
                        passing: number | null
                        setting: number | null
                        hitting: number | null
                        serving: number | null
                        blocking: number | null
                        sharedNotes: string | null
                        privateNotes: string | null
                    }
                >()
                if (userIds.length === 0 || !sessionUserId) return map
                const ratingRows = await db
                    .select({
                        playerId: playerRatings.player,
                        overall: playerRatings.overall,
                        passing: playerRatings.passing,
                        setting: playerRatings.setting,
                        hitting: playerRatings.hitting,
                        serving: playerRatings.serving,
                        blocking: playerRatings.blocking,
                        sharedNotes: playerRatings.shared_notes,
                        privateNotes: playerRatings.private_notes
                    })
                    .from(playerRatings)
                    .where(
                        and(
                            eq(playerRatings.season, config.seasonId),
                            eq(playerRatings.evaluator, sessionUserId),
                            inArray(playerRatings.player, userIds)
                        )
                    )

                for (const row of ratingRows) {
                    map.set(row.playerId, {
                        overall: row.overall,
                        passing: row.passing,
                        setting: row.setting,
                        hitting: row.hitting,
                        serving: row.serving,
                        blocking: row.blocking,
                        sharedNotes: row.sharedNotes?.trim() || null,
                        privateNotes: row.privateNotes?.trim() || null
                    })
                }
                return map
            })(),
            // Current-season captain roles
            getCaptainDivisionsByUser(config.seasonId, userIds)
        ])

        const entries: SignupCsvEntry[] = signupRows.map((row) => {
            const lastDraft = lastDraftInfo.get(row.userId)
            const viewerRating = viewerRatingsByPlayerId.get(row.userId)
            return {
                oldId: row.oldId,
                firstName: row.firstName,
                lastName: row.lastName,
                preferredName: row.preferredName,
                pairPickName: row.pairPickId
                    ? (pairPickNames.get(row.pairPickId) ?? null)
                    : null,
                male: row.male,
                age: row.age,
                experience: row.experience,
                assessment: row.assessment,
                height: row.height,
                picture: row.picture,
                skillPasser: row.skillPasser,
                skillSetter: row.skillSetter,
                skillHitter: row.skillHitter,
                skillOther: row.skillOther,
                unavailableDates: unavailabilityMap.get(row.signupId) ?? null,
                lastDraftSeason: lastDraft?.seasonLabel ?? null,
                lastDraftDivision: lastDraft?.divisionName ?? null,
                lastDraftCaptain: lastDraft?.captainName ?? null,
                captainIn: captainDivisionMap.get(row.userId) ?? null,
                draftedIn: draftedInMap.get(row.userId)?.divisionName ?? null,
                viewerOverallRating: viewerRating?.overall ?? null,
                viewerPassingRating: viewerRating?.passing ?? null,
                viewerSettingRating: viewerRating?.setting ?? null,
                viewerHittingRating: viewerRating?.hitting ?? null,
                viewerServingRating: viewerRating?.serving ?? null,
                viewerBlockingRating: viewerRating?.blocking ?? null,
                viewerSharedNotes: viewerRating?.sharedNotes ?? null,
                viewerPrivateNotes: viewerRating?.privateNotes ?? null
            }
        })

        await logAuditEntry({
            userId: session.user.id,
            action: "read",
            entityType: "signups",
            summary: `Downloaded signups CSV for season ${config.seasonId}`
        })

        return ok({ entries, seasonLabel })
    }
)

export const getPlayerDetailsPublic = withAction(
    async (
        playerId: string
    ): Promise<
        ActionResult<{
            player: AdminPlayerDetails
            draftHistory: PlayerDraftHistory[]
            signupHistory: PlayerSignup[]
            ratingAverages: PlayerRatingAverages
            sharedRatingNotes: PlayerRatingSharedNote[]
            privateRatingNotes: PlayerRatingPrivateNote[]
            viewerRating: PlayerViewerRating | null
            pairPickName: string | null
            pairReason: string | null
            unavailableDates: string | null
            playoffDates: string[]
        }>
    > => {
        await requireCaptainAccess()

        const [userData] = await db
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

        if (!userData) {
            return fail("Player not found.")
        }

        // Current-season commissioners (and admins) may see contact info;
        // captains and court managers get the redacted sentinels.
        const isCommissioner = await isCommissionerBySession()

        const player: AdminPlayerDetails = {
            ...userData,
            old_id: null,
            name: null,
            email: isCommissioner ? userData.email : "",
            emailVerified: false,
            // Deliverability state stays redacted even for commissioners.
            email_status: "",
            phone: isCommissioner ? userData.phone : null,
            emergency_contact: null,
            onboarding_completed: null,
            seasons_list: "",
            notification_list: "",
            captain_eligible: false,
            createdAt: new Date(0),
            updatedAt: new Date(0)
        }

        const config = await getSeasonConfig()
        const viewerUserId = await getSessionUserId()
        const ratingsSection = await getPlayerRatingsSectionData(
            playerId,
            config.seasonId ?? null,
            viewerUserId
        )

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

        const draftData = await getSeasonHistoryForUser(playerId)

        const playoffDates = getEventsByType(config, "playoff").map((e) =>
            formatEventDate(e.eventDate)
        )

        return ok({
            player,
            draftHistory: draftData,
            signupHistory: [],
            ratingAverages: ratingsSection.averages,
            sharedRatingNotes: ratingsSection.sharedNotes,
            privateRatingNotes: [],
            viewerRating: ratingsSection.viewerRating,
            pairPickName,
            pairReason,
            unavailableDates,
            playoffDates
        })
    }
)
