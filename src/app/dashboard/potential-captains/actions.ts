"use server"

import { db } from "@/database/db"
import {
    users,
    seasons,
    divisions,
    signups,
    teams,
    drafts,
    emailTemplates
} from "@/database/schema"
import { eq, inArray, notInArray, desc } from "drizzle-orm"
import { getIsCommissioner } from "@/app/dashboard/actions"

export interface PotentialCaptainPlayerDetails {
    id: string
    first_name: string
    last_name: string
    preffered_name: string | null
    pronouns: string | null
    male: boolean | null
    experience: string | null
    assessment: string | null
    height: number | null
    skill_setter: boolean | null
    skill_hitter: boolean | null
    skill_passer: boolean | null
    skill_other: boolean | null
    picture: string | null
}

export interface PotentialCaptainDraftHistory {
    seasonId: number
    seasonYear: number
    seasonName: string
    divisionName: string
    teamName: string
    round: number
    overall: number
}

interface PotentialCaptain {
    id: string
    displayName: string
    lastName: string
    email: string
    consecutiveSeasons: number
    captainInterest: "yes" | "only_if_needed" | "no"
}

interface CaptainList {
    title: string
    description: string
    players: PotentialCaptain[]
}

interface DivisionCaptains {
    id: number
    name: string
    level: number
    lists: CaptainList[]
}

interface SeasonInfo {
    id: number
    year: number
    name: string
}

interface PotentialCaptainsData {
    status: boolean
    message?: string
    seasonLabel: string
    divisions: DivisionCaptains[]
    allSeasons: SeasonInfo[]
    emailTemplate?: string
    emailSubject?: string
}

export async function getPotentialCaptainPlayerDetails(
    playerId: string
): Promise<{
    status: boolean
    message?: string
    player: PotentialCaptainPlayerDetails | null
    draftHistory: PotentialCaptainDraftHistory[]
    pairPickName: string | null
    pairReason: string | null
}> {
    const hasAccess = await getIsCommissioner()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            player: null,
            draftHistory: [],
            pairPickName: null,
            pairReason: null
        }
    }

    try {
        const [player] = await db
            .select({
                id: users.id,
                first_name: users.first_name,
                last_name: users.last_name,
                preffered_name: users.preffered_name,
                pronouns: users.pronouns,
                male: users.male,
                experience: users.experience,
                assessment: users.assessment,
                height: users.height,
                skill_setter: users.skill_setter,
                skill_hitter: users.skill_hitter,
                skill_passer: users.skill_passer,
                skill_other: users.skill_other,
                picture: users.picture
            })
            .from(users)
            .where(eq(users.id, playerId))
            .limit(1)

        if (!player) {
            return {
                status: false,
                message: "Player not found.",
                player: null,
                draftHistory: [],
                pairPickName: null,
                pairReason: null
            }
        }

        const draftHistory = await db
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

        let pairPickName: string | null = null
        let pairReason: string | null = null

        const [mostRecentSignup] = await db
            .select({
                pairPickId: signups.pair_pick,
                pairReason: signups.pair_reason
            })
            .from(signups)
            .where(eq(signups.player, playerId))
            .orderBy(desc(signups.season), desc(signups.id))
            .limit(1)

        if (mostRecentSignup) {
            pairReason = mostRecentSignup.pairReason

            if (mostRecentSignup.pairPickId) {
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
        }

        return {
            status: true,
            player,
            draftHistory,
            pairPickName,
            pairReason
        }
    } catch (error) {
        console.error("Error fetching potential captain player details:", error)
        return {
            status: false,
            message: "Something went wrong.",
            player: null,
            draftHistory: [],
            pairPickName: null,
            pairReason: null
        }
    }
}

export async function getPotentialCaptainsData(): Promise<PotentialCaptainsData> {
    const hasAccess = await getIsCommissioner()

    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            seasonLabel: "",
            divisions: [],
            allSeasons: []
        }
    }

    try {
        // 1. Get current season
        const [currentSeason] = await db
            .select({
                id: seasons.id,
                year: seasons.year,
                season: seasons.season
            })
            .from(seasons)
            .where(notInArray(seasons.phase, ["off_season", "complete"]))
            .limit(1)

        let targetSeason = currentSeason
        if (!targetSeason) {
            const [mostRecent] = await db
                .select({
                    id: seasons.id,
                    year: seasons.year,
                    season: seasons.season
                })
                .from(seasons)
                .orderBy(desc(seasons.id))
                .limit(1)
            targetSeason = mostRecent
        }

        if (!targetSeason) {
            return {
                status: false,
                message: "No season found.",
                seasonLabel: "",
                divisions: [],
                allSeasons: []
            }
        }

        const seasonLabel = `${targetSeason.season.charAt(0).toUpperCase() + targetSeason.season.slice(1)} ${targetSeason.year}`

        // 2. Get all signups for current season
        const signupRows = await db
            .select({
                playerId: signups.player,
                captain: signups.captain,
                captainEligible: users.captain_eligible,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preffered_name,
                email: users.email
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(eq(signups.season, targetSeason.id))

        if (signupRows.length === 0) {
            return {
                status: true,
                seasonLabel,
                divisions: [],
                allSeasons: []
            }
        }

        // 3. Get all seasons ordered by ID (newest first)
        // Exclude the current signup season since it hasn't been played yet
        const allSeasons = await db
            .select({
                id: seasons.id,
                year: seasons.year,
                name: seasons.season
            })
            .from(seasons)
            .orderBy(desc(seasons.id))
            .limit(11)

        const seasonIds = allSeasons
            .map((s) => s.id)
            .filter((id) => id !== targetSeason.id)

        // 4. Get draft history for all signed-up players
        const playerIds = signupRows.map((s) => s.playerId)
        const draftHistory = await db
            .select({
                playerId: drafts.user,
                seasonId: teams.season,
                divisionId: divisions.id,
                divisionName: divisions.name,
                divisionLevel: divisions.level
            })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .innerJoin(divisions, eq(teams.division, divisions.id))
            .where(inArray(drafts.user, playerIds))

        // 5. Build player history map
        type PlayerHistory = {
            mostRecentDivisionId: number | null
            mostRecent4Drafts: Array<{ divisionId: number; seasonId: number }>
        }

        const playerHistoryMap = new Map<string, PlayerHistory>()

        for (const playerId of playerIds) {
            const playerDrafts = draftHistory.filter(
                (d) => d.playerId === playerId
            )

            // Find most recent division
            let mostRecentDivisionId: number | null = null
            for (const seasonId of seasonIds) {
                const draft = playerDrafts.find((d) => d.seasonId === seasonId)
                if (draft) {
                    mostRecentDivisionId = draft.divisionId
                    break
                }
            }

            // Get most recent 4 drafts (sorted by season ID, newest first)
            const sortedDrafts = playerDrafts
                .filter((d) => seasonIds.includes(d.seasonId))
                .sort((a, b) => {
                    const aIndex = seasonIds.indexOf(a.seasonId)
                    const bIndex = seasonIds.indexOf(b.seasonId)
                    return aIndex - bIndex
                })
                .slice(0, 4)
                .map((d) => ({
                    divisionId: d.divisionId,
                    seasonId: d.seasonId
                }))

            playerHistoryMap.set(playerId, {
                mostRecentDivisionId,
                mostRecent4Drafts: sortedDrafts
            })
        }

        // 6. Helper function to count consecutive seasons in a specific division
        // Counts from the first season the player played in that division (most recent backward)
        function countConsecutiveSeasonsInDivision(
            playerDrafts: Array<{ divisionId: number; seasonId: number }>,
            divisionId: number,
            allSeasonIds: number[]
        ): number {
            let count = 0
            let started = false
            for (const seasonId of allSeasonIds) {
                const playedInDivision = playerDrafts.some(
                    (d) =>
                        d.seasonId === seasonId && d.divisionId === divisionId
                )
                if (playedInDivision) {
                    started = true
                    count++
                } else if (started) {
                    // Found a gap after we started counting
                    break
                }
            }
            return count
        }

        // Helper function to check if most recent 4 drafts were all in the same division
        function wereMostRecent4InDivision(
            mostRecent4: Array<{ divisionId: number; seasonId: number }>,
            divisionId: number
        ): boolean {
            if (mostRecent4.length < 4) return false
            return mostRecent4.every((draft) => draft.divisionId === divisionId)
        }

        // 7. Get all divisions
        const allDivisions = await db
            .select({
                id: divisions.id,
                name: divisions.name,
                level: divisions.level
            })
            .from(divisions)
            .where(eq(divisions.active, true))
            .orderBy(divisions.level)

        // 8. Build division data
        const divisionData: DivisionCaptains[] = []

        for (const division of allDivisions) {
            // List 1: "yes" captain + played in this division last season
            const list1Players: PotentialCaptain[] = []

            // List 2: "only_if_needed" captain + played in this division last season
            const list2Players: PotentialCaptain[] = []

            // List 3: "no" captain + played in this division in past 4 seasons
            const list3Players: PotentialCaptain[] = []

            // List 4: "no" captain + 1-3 consecutive seasons in this division
            const list4Players: PotentialCaptain[] = []

            for (const signup of signupRows) {
                if (!signup.captainEligible) continue

                const history = playerHistoryMap.get(signup.playerId)
                if (!history) continue

                // Get all drafts for this player
                const playerDrafts = draftHistory
                    .filter((d) => d.playerId === signup.playerId)
                    .filter((d) => seasonIds.includes(d.seasonId))
                    .map((d) => ({
                        divisionId: d.divisionId,
                        seasonId: d.seasonId
                    }))

                // Skip if player has no history in this division
                const hasHistoryInDivision = playerDrafts.some(
                    (d) => d.divisionId === division.id
                )
                if (!hasHistoryInDivision) continue

                const consecutiveSeasons = countConsecutiveSeasonsInDivision(
                    playerDrafts,
                    division.id,
                    seasonIds
                )
                const playedLastSeason =
                    history.mostRecentDivisionId === division.id
                const mostRecent4InThisDivision = wereMostRecent4InDivision(
                    history.mostRecent4Drafts,
                    division.id
                )

                const displayName = signup.preferredName || signup.firstName

                if (signup.captain === "yes" && playedLastSeason) {
                    list1Players.push({
                        id: signup.playerId,
                        displayName,
                        lastName: signup.lastName,
                        email: signup.email,
                        consecutiveSeasons,
                        captainInterest: "yes"
                    })
                } else if (
                    signup.captain === "only_if_needed" &&
                    playedLastSeason
                ) {
                    list2Players.push({
                        id: signup.playerId,
                        displayName,
                        lastName: signup.lastName,
                        email: signup.email,
                        consecutiveSeasons,
                        captainInterest: "only_if_needed"
                    })
                } else if (
                    signup.captain === "no" &&
                    mostRecent4InThisDivision
                ) {
                    list3Players.push({
                        id: signup.playerId,
                        displayName,
                        lastName: signup.lastName,
                        email: signup.email,
                        consecutiveSeasons,
                        captainInterest: "no"
                    })
                } else if (
                    signup.captain === "no" &&
                    playedLastSeason &&
                    consecutiveSeasons >= 1 &&
                    consecutiveSeasons <= 3
                ) {
                    list4Players.push({
                        id: signup.playerId,
                        displayName,
                        lastName: signup.lastName,
                        email: signup.email,
                        consecutiveSeasons,
                        captainInterest: "no"
                    })
                }
            }

            // Sort all lists by last name
            const sortPlayers = (a: PotentialCaptain, b: PotentialCaptain) =>
                a.lastName.toLowerCase().localeCompare(b.lastName.toLowerCase())

            list1Players.sort(sortPlayers)
            list2Players.sort(sortPlayers)
            list3Players.sort(sortPlayers)
            list4Players.sort(sortPlayers)

            // Only include division if it has players in any list
            if (
                list1Players.length > 0 ||
                list2Players.length > 0 ||
                list3Players.length > 0 ||
                list4Players.length > 0
            ) {
                divisionData.push({
                    id: division.id,
                    name: division.name,
                    level: division.level,
                    lists: [
                        {
                            title: "Yes - Interested in Being Captain",
                            description:
                                "Players who signed up as captain and played in this division last season",
                            players: list1Players
                        },
                        {
                            title: "If Needed - Available as Backup",
                            description:
                                "Players willing to captain if needed who played in this division last season",
                            players: list2Players
                        },
                        {
                            title: "Not Interested - Experienced Players",
                            description:
                                "Players not interested in captaining but with 4+ consecutive seasons in this division",
                            players: list3Players
                        },
                        {
                            title: "Not Interested - Newer Players",
                            description:
                                "Players not interested in captaining but with 1-3 consecutive seasons in this division",
                            players: list4Players
                        }
                    ]
                })
            }
        }

        // Fetch email template
        let emailTemplate = ""
        let emailSubject = ""
        try {
            const [template] = await db
                .select({
                    content: emailTemplates.content,
                    subject: emailTemplates.subject
                })
                .from(emailTemplates)
                .where(eq(emailTemplates.name, "call for captains"))
                .limit(1)

            if (template) {
                emailTemplate = template.content
                emailSubject = template.subject || ""
            }
        } catch (templateError) {
            console.error("Error fetching email template:", templateError)
            // Continue without template - not a critical error
        }

        return {
            status: true,
            seasonLabel,
            divisions: divisionData,
            allSeasons: allSeasons.map((s) => ({
                id: s.id,
                year: s.year,
                name: s.name
            })),
            emailTemplate,
            emailSubject
        }
    } catch (error) {
        console.error("Error fetching potential captains data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            seasonLabel: "",
            divisions: [],
            allSeasons: []
        }
    }
}
