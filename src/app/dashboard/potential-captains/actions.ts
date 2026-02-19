"use server"

import { db } from "@/database/db"
import {
    users,
    seasons,
    divisions,
    signups,
    teams,
    drafts
} from "@/database/schema"
import { eq, inArray, desc } from "drizzle-orm"
import { getIsCommissioner } from "@/app/dashboard/actions"

interface PotentialCaptain {
    id: string
    displayName: string
    lastName: string
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

interface PotentialCaptainsData {
    status: boolean
    message?: string
    seasonLabel: string
    divisions: DivisionCaptains[]
}

export async function getPotentialCaptainsData(): Promise<PotentialCaptainsData> {
    const hasAccess = await getIsCommissioner()

    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            seasonLabel: "",
            divisions: []
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
            .where(eq(seasons.registration_open, true))
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
                divisions: []
            }
        }

        const seasonLabel = `${targetSeason.season.charAt(0).toUpperCase() + targetSeason.season.slice(1)} ${targetSeason.year}`

        // 2. Get all signups for current season
        const signupRows = await db
            .select({
                playerId: signups.player,
                captain: signups.captain,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preffered_name
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(eq(signups.season, targetSeason.id))

        if (signupRows.length === 0) {
            return {
                status: true,
                seasonLabel,
                divisions: []
            }
        }

        // 3. Get all seasons ordered by ID (newest first)
        const allSeasons = await db
            .select({ id: seasons.id })
            .from(seasons)
            .orderBy(desc(seasons.id))
            .limit(11)

        const seasonIds = allSeasons.map((s) => s.id)

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
            divisionSeasons: Map<number, Set<number>>
            mostRecentDivisionId: number | null
        }

        const playerHistoryMap = new Map<string, PlayerHistory>()

        for (const playerId of playerIds) {
            const playerDrafts = draftHistory.filter(
                (d) => d.playerId === playerId
            )
            const divisionSeasons = new Map<number, Set<number>>()

            for (const draft of playerDrafts) {
                if (!divisionSeasons.has(draft.divisionId)) {
                    divisionSeasons.set(draft.divisionId, new Set())
                }
                divisionSeasons.get(draft.divisionId)!.add(draft.seasonId)
            }

            // Find most recent division
            let mostRecentDivisionId: number | null = null
            for (const seasonId of seasonIds) {
                const draft = playerDrafts.find((d) => d.seasonId === seasonId)
                if (draft) {
                    mostRecentDivisionId = draft.divisionId
                    break
                }
            }

            playerHistoryMap.set(playerId, {
                divisionSeasons,
                mostRecentDivisionId
            })
        }

        // 6. Helper function to count consecutive seasons
        // Counts from the first season the player actually played (most recent backward)
        function countConsecutiveSeasons(
            allSeasonIds: number[],
            playedSeasonIds: Set<number>
        ): number {
            let count = 0
            let started = false
            for (const seasonId of allSeasonIds) {
                if (playedSeasonIds.has(seasonId)) {
                    started = true
                    count++
                } else if (started) {
                    // Found a gap after we started counting
                    break
                }
            }
            return count
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

            for (const signup of signupRows) {
                const history = playerHistoryMap.get(signup.playerId)
                if (!history) continue

                const divisionSeasons = history.divisionSeasons.get(division.id)
                if (!divisionSeasons) continue

                const consecutiveSeasons = countConsecutiveSeasons(
                    seasonIds,
                    divisionSeasons
                )
                const playedLastSeason =
                    history.mostRecentDivisionId === division.id
                const playedInPast4Seasons = consecutiveSeasons >= 4

                const displayName = signup.preferredName || signup.firstName

                if (signup.captain === "yes" && playedLastSeason) {
                    list1Players.push({
                        id: signup.playerId,
                        displayName,
                        lastName: signup.lastName,
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
                        consecutiveSeasons,
                        captainInterest: "only_if_needed"
                    })
                } else if (signup.captain === "no" && playedInPast4Seasons) {
                    list3Players.push({
                        id: signup.playerId,
                        displayName,
                        lastName: signup.lastName,
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

            // Only include division if it has players in any list
            if (
                list1Players.length > 0 ||
                list2Players.length > 0 ||
                list3Players.length > 0
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
                        }
                    ]
                })
            }
        }

        return {
            status: true,
            seasonLabel,
            divisions: divisionData
        }
    } catch (error) {
        console.error("Error fetching potential captains data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            seasonLabel: "",
            divisions: []
        }
    }
}
