"use server"

import { db } from "@/database/db"
import {
    users,
    signups,
    drafts,
    teams,
    seasons,
    divisions,
    playerRatings,
    playerUnavailability,
    seasonEvents
} from "@/database/schema"
import { and, eq, inArray, desc } from "drizzle-orm"
import {
    getSeasonConfig,
    getEventsByType,
    formatEventDate
} from "@/lib/site-config"
import { hasCaptainPagesAccessBySession, getSessionUserId } from "@/lib/rbac"
import { logAuditEntry } from "@/lib/audit-log"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import {
    getEmptyPlayerRatingAverages,
    type PlayerRatingAverages,
    type PlayerRatingPrivateNote,
    type PlayerRatingSharedNote,
    type PlayerViewerRating
} from "@/lib/player-ratings-shared"
import { getPlayerRatingsSectionData } from "@/lib/player-ratings-summary"
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

export async function checkCaptainPagesAccess(): Promise<boolean> {
    return hasCaptainPagesAccessBySession()
}

export async function getSignupsCsvData(): Promise<{
    status: boolean
    message?: string
    entries: SignupCsvEntry[]
    seasonLabel: string
}> {
    const hasAccess = await checkCaptainPagesAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            entries: [],
            seasonLabel: ""
        }
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return {
                status: false,
                message: "No current season found.",
                entries: [],
                seasonLabel: ""
            }
        }

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
        const sessionUserId = await getSessionUserId()

        // Fetch player unavailability per signup
        const unavailabilityMap = new Map<number, string>()

        if (signupIds.length > 0) {
            const unavailRows = await db
                .select({
                    signupId: playerUnavailability.signup_id,
                    eventDate: seasonEvents.event_date
                })
                .from(playerUnavailability)
                .innerJoin(
                    seasonEvents,
                    eq(seasonEvents.id, playerUnavailability.event_id)
                )
                .where(inArray(playerUnavailability.signup_id, signupIds))

            const bySignup = new Map<number, string[]>()
            for (const row of unavailRows) {
                const dates = bySignup.get(row.signupId) || []
                dates.push(formatEventDate(row.eventDate))
                bySignup.set(row.signupId, dates)
            }
            for (const [sid, dates] of bySignup) {
                unavailabilityMap.set(sid, dates.join(", "))
            }
        }

        // Fetch pair pick user names
        const pairPickIds = signupRows
            .map((r) => r.pairPickId)
            .filter((id): id is string => id !== null)
        const pairPickNames = new Map<string, string>()

        if (pairPickIds.length > 0) {
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
                const preferred = u.preferredName ? ` (${u.preferredName})` : ""
                pairPickNames.set(
                    u.id,
                    `${u.firstName}${preferred} ${u.lastName}`
                )
            }
        }

        // Fetch last draft info (season label, division, captain name)
        const lastDraftInfo = new Map<
            string,
            { season: string; division: string; captain: string }
        >()

        if (userIds.length > 0) {
            const draftData = await db
                .select({
                    userId: drafts.user,
                    seasonYear: seasons.year,
                    seasonName: seasons.season,
                    divisionName: divisions.name,
                    captainFirstName: users.first_name,
                    captainLastName: users.last_name,
                    captainPreferredName: users.preferred_name
                })
                .from(drafts)
                .innerJoin(teams, eq(drafts.team, teams.id))
                .innerJoin(seasons, eq(teams.season, seasons.id))
                .innerJoin(divisions, eq(teams.division, divisions.id))
                .innerJoin(users, eq(teams.captain, users.id))
                .where(inArray(drafts.user, userIds))
                .orderBy(desc(seasons.year), desc(seasons.id))

            const processedUsers = new Set<string>()
            for (const draft of draftData) {
                if (!processedUsers.has(draft.userId)) {
                    const captainPreferred = draft.captainPreferredName
                        ? ` (${draft.captainPreferredName})`
                        : ""
                    const captainName = `${draft.captainFirstName}${captainPreferred} ${draft.captainLastName}`
                    const draftSeasonLabel = `${draft.seasonName.charAt(0).toUpperCase() + draft.seasonName.slice(1)} ${draft.seasonYear}`
                    lastDraftInfo.set(draft.userId, {
                        season: draftSeasonLabel,
                        division: draft.divisionName,
                        captain: captainName
                    })
                    processedUsers.add(draft.userId)
                }
            }
        }

        // Fetch current-season draft assignments
        const draftedInMap = new Map<string, string>()

        if (userIds.length > 0) {
            const draftedRows = await db
                .select({
                    userId: drafts.user,
                    divisionName: divisions.name
                })
                .from(drafts)
                .innerJoin(teams, eq(drafts.team, teams.id))
                .innerJoin(divisions, eq(teams.division, divisions.id))
                .where(
                    and(
                        eq(teams.season, config.seasonId),
                        inArray(drafts.user, userIds)
                    )
                )

            for (const draft of draftedRows) {
                draftedInMap.set(draft.userId, draft.divisionName)
            }
        }

        const viewerRatingsByPlayerId = new Map<
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

        if (userIds.length > 0 && sessionUserId) {
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
                viewerRatingsByPlayerId.set(row.playerId, {
                    overall: row.overall,
                    passing: row.passing,
                    setting: row.setting,
                    hitting: row.hitting,
                    serving: row.serving,
                    sharedNotes: row.sharedNotes?.trim() || null,
                    privateNotes: row.privateNotes?.trim() || null
                })
            }
        }

        // Fetch current-season captain roles
        const captainDivisionMap = new Map<string, string>()

        if (userIds.length > 0) {
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
                captainDivisionMap.set(team.captainId, team.divisionName)
            }
        }

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
                lastDraftSeason: lastDraft?.season ?? null,
                lastDraftDivision: lastDraft?.division ?? null,
                lastDraftCaptain: lastDraft?.captain ?? null,
                captainIn: captainDivisionMap.get(row.userId) ?? null,
                draftedIn: draftedInMap.get(row.userId) ?? null,
                viewerOverallRating: viewerRating?.overall ?? null,
                viewerPassingRating: viewerRating?.passing ?? null,
                viewerSettingRating: viewerRating?.setting ?? null,
                viewerHittingRating: viewerRating?.hitting ?? null,
                viewerServingRating: viewerRating?.serving ?? null,
                viewerSharedNotes: viewerRating?.sharedNotes ?? null,
                viewerPrivateNotes: viewerRating?.privateNotes ?? null
            }
        })

        const session = await auth.api.getSession({ headers: await headers() })
        if (session?.user) {
            await logAuditEntry({
                userId: session.user.id,
                action: "read",
                entityType: "signups",
                summary: `Downloaded signups CSV for season ${config.seasonId}`
            })
        }

        return { status: true, entries, seasonLabel }
    } catch (error) {
        console.error("Error fetching CSV data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            entries: [],
            seasonLabel: ""
        }
    }
}

export interface SeasonInfo {
    id: number
    year: number
    name: string
}

export async function getSignupsData(): Promise<{
    status: boolean
    message?: string
    groups: SignupGroup[]
    allSeasons: SeasonInfo[]
    seasonLabel: string
}> {
    const hasAccess = await checkCaptainPagesAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            groups: [],
            allSeasons: [],
            seasonLabel: ""
        }
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return {
                status: false,
                message: "No current season found.",
                groups: [],
                allSeasons: [],
                seasonLabel: ""
            }
        }

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
            return {
                status: true,
                groups: [],
                allSeasons: [],
                seasonLabel
            }
        }

        const userIds = signupRows.map((r) => r.userId)

        // Fetch last draft information for each user
        const lastDraftMap = new Map<
            string,
            {
                divisionName: string
                divisionLevel: number
            }
        >()

        const draftData = await db
            .select({
                userId: drafts.user,
                seasonId: seasons.id,
                seasonYear: seasons.year,
                divisionName: divisions.name,
                divisionLevel: divisions.level
            })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .innerJoin(seasons, eq(teams.season, seasons.id))
            .innerJoin(divisions, eq(teams.division, divisions.id))
            .where(inArray(drafts.user, userIds))
            .orderBy(desc(seasons.year), desc(seasons.id))

        // Keep only the most recent draft for each user
        const processedUsers = new Set<string>()
        for (const draft of draftData) {
            if (!processedUsers.has(draft.userId)) {
                lastDraftMap.set(draft.userId, {
                    divisionName: draft.divisionName,
                    divisionLevel: draft.divisionLevel
                })
                processedUsers.add(draft.userId)
            }
        }

        // Fetch pair pick names
        const pairPickIds = signupRows
            .map((r) => r.pairPickId)
            .filter((id): id is string => id !== null)
        const pairPickNames = new Map<string, string>()

        if (pairPickIds.length > 0) {
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
                const displayName = u.preferredName
                    ? `${u.preferredName} ${u.lastName}`
                    : `${u.firstName} ${u.lastName}`
                pairPickNames.set(u.id, displayName)
            }
        }

        // Group players by their last drafted division
        const groupMap = new Map<string, SignupPlayer[]>()
        const groupOrderMap = new Map<string, number>()

        for (const row of signupRows) {
            const lastDraft = lastDraftMap.get(row.userId)
            let groupLabel: string
            let divisionOrder: number

            if (lastDraft) {
                groupLabel = lastDraft.divisionName
                divisionOrder = lastDraft.divisionLevel
            } else {
                groupLabel = "New Players"
                divisionOrder = 999
            }

            const displayName = row.preferredName
                ? `${row.preferredName} ${row.lastName}`
                : `${row.firstName} ${row.lastName}`

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

            if (!groupMap.has(groupLabel)) {
                groupMap.set(groupLabel, [])
                groupOrderMap.set(groupLabel, divisionOrder)
            }

            groupMap.get(groupLabel)!.push(player)
        }

        // Sort players within each group by gender, then last name
        for (const group of groupMap.values()) {
            group.sort((a, b) => {
                // Sort by gender first (Male, Non-Male, Unknown)
                const genderOrder = { Male: 0, "Non-Male": 1, Unknown: 2 }
                const genderCompare =
                    genderOrder[a.gender as keyof typeof genderOrder] -
                    genderOrder[b.gender as keyof typeof genderOrder]
                if (genderCompare !== 0) return genderCompare

                // Then sort by last name (extracted from displayName)
                const aLastName = a.displayName.split(" ").pop() || ""
                const bLastName = b.displayName.split(" ").pop() || ""
                return aLastName.localeCompare(bLastName)
            })
        }

        // Convert map to array and sort groups (by division level, "New Players" always first)
        const groups: SignupGroup[] = Array.from(groupMap.entries()).map(
            ([label, players]) => ({
                groupLabel: label,
                seasonOrder: groupOrderMap.get(label)!,
                players
            })
        )

        groups.sort((a, b) => {
            if (a.groupLabel === "New Players") return -1
            if (b.groupLabel === "New Players") return 1
            return a.seasonOrder - b.seasonOrder
        })

        // Fetch all seasons for chart gap detection
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
            status: true,
            groups,
            allSeasons: allSeasonRows.map((s) => ({
                id: s.id,
                year: s.year,
                name: s.name
            })),
            seasonLabel
        }
    } catch (error) {
        console.error("Error fetching signups data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            groups: [],
            allSeasons: [],
            seasonLabel: ""
        }
    }
}

export async function getPlayerDetailsPublic(playerId: string): Promise<{
    status: boolean
    message?: string
    player: AdminPlayerDetails | null
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
}> {
    const hasAccess = await checkCaptainPagesAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            player: null,
            draftHistory: [],
            signupHistory: [],
            ratingAverages: getEmptyPlayerRatingAverages(),
            sharedRatingNotes: [],
            privateRatingNotes: [],
            viewerRating: null,
            pairPickName: null,
            pairReason: null,
            unavailableDates: null,
            playoffDates: []
        }
    }

    try {
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
                picture: users.picture
            })
            .from(users)
            .where(eq(users.id, playerId))
            .limit(1)

        if (!userData) {
            return {
                status: false,
                message: "Player not found.",
                player: null,
                draftHistory: [],
                signupHistory: [],
                ratingAverages: getEmptyPlayerRatingAverages(),
                sharedRatingNotes: [],
                privateRatingNotes: [],
                viewerRating: null,
                pairPickName: null,
                pairReason: null,
                unavailableDates: null,
                playoffDates: []
            }
        }

        const player: AdminPlayerDetails = {
            ...userData,
            old_id: null,
            name: null,
            email: "",
            emailVerified: false,
            phone: null,
            emergency_contact: null,
            role: null,
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
                .from(playerUnavailability)
                .innerJoin(
                    seasonEvents,
                    eq(seasonEvents.id, playerUnavailability.event_id)
                )
                .where(eq(playerUnavailability.signup_id, mostRecentSignup.id))

            if (unavailRows.length > 0) {
                unavailableDates = unavailRows
                    .map((u) => formatEventDate(u.eventDate))
                    .join(", ")
            }
        }

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

        return {
            status: true,
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
        }
    } catch (error) {
        console.error("Error fetching player details:", error)
        return {
            status: false,
            message: "Something went wrong.",
            player: null,
            draftHistory: [],
            signupHistory: [],
            ratingAverages: getEmptyPlayerRatingAverages(),
            sharedRatingNotes: [],
            privateRatingNotes: [],
            viewerRating: null,
            pairPickName: null,
            pairReason: null,
            unavailableDates: null,
            playoffDates: []
        }
    }
}
