"use server"

import { db } from "@/database/db"
import {
    users,
    signups,
    teams,
    seasons,
    divisions,
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
import {
    hasCaptainPagesAccessBySession,
    getSessionUserId,
    isCommissionerBySession
} from "@/lib/rbac"
import { logAuditEntry } from "@/lib/audit-log"
import {
    type ActionResult,
    fail,
    ok,
    requireCaptainAccess,
    requireSeasonConfig,
    requireSession,
    withAction
} from "@/lib/action-helpers"
import type {
    PlayerRatingAverages,
    PlayerRatingPrivateNote,
    PlayerRatingSharedNote,
    PlayerViewerRating
} from "@/lib/player-ratings-shared"
import { getPlayerRatingsSectionData } from "@/lib/player-ratings-summary"
import {
    getLastDraftInfoByUser,
    getCurrentDraftDivisions,
    getDraftHistoryForUser
} from "@/lib/roster"
import type {
    PlayerDetails as AdminPlayerDetails,
    PlayerDraftHistory,
    PlayerSignup
} from "@/app/dashboard/player-lookup/actions"
import { formatDisplayName, formatPlayerName } from "@/lib/utils"

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
    viewerSharedNotes: string | null
    viewerPrivateNotes: string | null
}

export interface SignupPlayer {
    userId: string
    displayName: string
    pairedWith: string | null
    pairedWithId: string | null
    gender: string
    age: string | null
    height: number | null
}

export interface SignupGroup {
    groupLabel: string
    seasonOrder: number
    players: SignupPlayer[]
}

export const getSignupsCsvData = withAction(
    async (): Promise<
        ActionResult<{ entries: SignupCsvEntry[]; seasonLabel: string }>
    > => {
        await requireCaptainAccess()
        const session = await requireSession()
        const config = await requireSeasonConfig()

        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

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
            (async () => {
                const map = new Map<number, string>()
                if (signupIds.length === 0) return map
                const unavailRows = await db
                    .select({
                        signupId: userUnavailability.signup_id,
                        eventDate: seasonEvents.event_date
                    })
                    .from(userUnavailability)
                    .innerJoin(
                        seasonEvents,
                        eq(seasonEvents.id, userUnavailability.event_id)
                    )
                    .where(inArray(userUnavailability.signup_id, signupIds))

                const bySignup = new Map<number, string[]>()
                for (const row of unavailRows) {
                    const dates = bySignup.get(row.signupId!) || []
                    dates.push(formatEventDate(row.eventDate))
                    bySignup.set(row.signupId!, dates)
                }
                for (const [sid, dates] of bySignup) {
                    map.set(sid, dates.join(", "))
                }
                return map
            })(),
            // Pair pick user names
            (async () => {
                const map = new Map<string, string>()
                if (pairPickIds.length === 0) return map
                const pairPickUsers = await db
                    .select({
                        id: users.id,
                        firstName: users.first_name,
                        lastName: users.last_name,
                        preferredName: users.preferred_name
                    })
                    .from(users)
                    .where(inArray(users.id, pairPickIds))

                for (const u of pairPickUsers) {
                    map.set(
                        u.id,
                        formatPlayerName(
                            u.firstName,
                            u.lastName,
                            u.preferredName
                        )
                    )
                }
                return map
            })(),
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
                        sharedNotes: row.sharedNotes?.trim() || null,
                        privateNotes: row.privateNotes?.trim() || null
                    })
                }
                return map
            })(),
            // Current-season captain roles
            (async () => {
                const map = new Map<string, string>()
                if (userIds.length === 0) return map
                const captainTeams = await db
                    .select({
                        captainId: teams.captain,
                        divisionName: divisions.name
                    })
                    .from(teams)
                    .innerJoin(divisions, eq(teams.division, divisions.id))
                    .where(
                        and(
                            eq(teams.season, config.seasonId),
                            inArray(teams.captain, userIds)
                        )
                    )

                for (const team of captainTeams) {
                    map.set(team.captainId, team.divisionName)
                }
                return map
            })()
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

export interface SeasonInfo {
    id: number
    year: number
    name: string
}

export const getSignupsData = withAction(
    async (): Promise<
        ActionResult<{
            undraftedGroups: SignupGroup[]
            draftedGroups: SignupGroup[]
            allSeasons: SeasonInfo[]
            seasonLabel: string
        }>
    > => {
        const hasAccess = await hasCaptainPagesAccessBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        const config = await requireSeasonConfig()

        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

        // Fetch all signups for the current season
        const signupRows = await db
            .select({
                userId: signups.player,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                male: users.male,
                age: signups.age,
                height: users.height,
                pairPickId: signups.pair_pick
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(eq(signups.season, config.seasonId))
            .orderBy(users.last_name, users.first_name)

        if (signupRows.length === 0) {
            return ok({
                undraftedGroups: [],
                draftedGroups: [],
                allSeasons: [],
                seasonLabel
            })
        }

        const userIds = signupRows.map((r) => r.userId)

        // These lookups only depend on signupRows — run them in parallel
        const pairPickIds = signupRows
            .map((r) => r.pairPickId)
            .filter((id): id is string => id !== null)

        const [lastDraftMap, pairPickUsers, draftedInMap, allSeasonRows] =
            await Promise.all([
                // Last draft information for each user
                getLastDraftInfoByUser(userIds),
                // Pair pick names
                pairPickIds.length > 0
                    ? db
                          .select({
                              id: users.id,
                              firstName: users.first_name,
                              lastName: users.last_name,
                              preferredName: users.preferred_name
                          })
                          .from(users)
                          .where(inArray(users.id, pairPickIds))
                    : Promise.resolve([]),
                // Current-season draft assignments with division level
                getCurrentDraftDivisions(config.seasonId, userIds),
                // All seasons for chart gap detection
                db
                    .select({
                        id: seasons.id,
                        year: seasons.year,
                        name: seasons.season
                    })
                    .from(seasons)
                    .orderBy(desc(seasons.id))
                    .limit(11)
            ])

        const pairPickNames = new Map<string, string>()
        for (const u of pairPickUsers) {
            const displayName = formatDisplayName(
                u.firstName,
                u.lastName,
                u.preferredName
            )
            pairPickNames.set(u.id, displayName)
        }

        // Group undrafted players by their last drafted division,
        // and drafted players by their current-season division
        const undraftedGroupMap = new Map<string, SignupPlayer[]>()
        const undraftedGroupOrderMap = new Map<string, number>()
        const draftedGroupMap = new Map<string, SignupPlayer[]>()
        const draftedGroupOrderMap = new Map<string, number>()

        function sortGroupPlayers(players: SignupPlayer[]) {
            players.sort((a, b) => {
                const genderOrder = { Male: 0, "Non-Male": 1, Unknown: 2 }
                const genderCompare =
                    genderOrder[a.gender as keyof typeof genderOrder] -
                    genderOrder[b.gender as keyof typeof genderOrder]
                if (genderCompare !== 0) return genderCompare
                const aLastName = a.displayName.split(" ").pop() || ""
                const bLastName = b.displayName.split(" ").pop() || ""
                return aLastName.localeCompare(bLastName)
            })
        }

        for (const row of signupRows) {
            const displayName = formatDisplayName(
                row.firstName,
                row.lastName,
                row.preferredName
            )

            const gender =
                row.male === null ? "Unknown" : row.male ? "Male" : "Non-Male"

            const player: SignupPlayer = {
                userId: row.userId,
                displayName,
                pairedWith: row.pairPickId
                    ? (pairPickNames.get(row.pairPickId) ?? null)
                    : null,
                pairedWithId: row.pairPickId,
                gender,
                age: row.age,
                height: row.height
            }

            const currentDraft = draftedInMap.get(row.userId)

            if (currentDraft) {
                const { divisionName, divisionLevel } = currentDraft
                if (!draftedGroupMap.has(divisionName)) {
                    draftedGroupMap.set(divisionName, [])
                    draftedGroupOrderMap.set(divisionName, divisionLevel)
                }
                draftedGroupMap.get(divisionName)!.push(player)
            } else {
                const lastDraft = lastDraftMap.get(row.userId)
                const groupLabel = lastDraft
                    ? lastDraft.divisionName
                    : "New Players"
                const divisionOrder = lastDraft ? lastDraft.divisionLevel : 999

                if (!undraftedGroupMap.has(groupLabel)) {
                    undraftedGroupMap.set(groupLabel, [])
                    undraftedGroupOrderMap.set(groupLabel, divisionOrder)
                }
                undraftedGroupMap.get(groupLabel)!.push(player)
            }
        }

        for (const group of undraftedGroupMap.values()) sortGroupPlayers(group)
        for (const group of draftedGroupMap.values()) sortGroupPlayers(group)

        const undraftedGroups: SignupGroup[] = Array.from(
            undraftedGroupMap.entries()
        ).map(([label, players]) => ({
            groupLabel: label,
            seasonOrder: undraftedGroupOrderMap.get(label)!,
            players
        }))
        undraftedGroups.sort((a, b) => {
            if (a.groupLabel === "New Players") return -1
            if (b.groupLabel === "New Players") return 1
            return a.seasonOrder - b.seasonOrder
        })

        const draftedGroups: SignupGroup[] = Array.from(
            draftedGroupMap.entries()
        ).map(([label, players]) => ({
            groupLabel: label,
            seasonOrder: draftedGroupOrderMap.get(label)!,
            players
        }))
        draftedGroups.sort((a, b) => a.seasonOrder - b.seasonOrder)

        return ok({
            undraftedGroups,
            draftedGroups,
            allSeasons: allSeasonRows.map((s) => ({
                id: s.id,
                year: s.year,
                name: s.name
            })),
            seasonLabel
        })
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

        const draftData = await getDraftHistoryForUser(playerId)

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
