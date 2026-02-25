"use server"

import { db } from "@/database/db"
import {
    users,
    signups,
    drafts,
    teams,
    seasons,
    divisions
} from "@/database/schema"
import { eq, desc } from "drizzle-orm"
import { checkCaptainPagesAccess } from "@/app/dashboard/view-signups/actions"
import { getSeasonConfig } from "@/lib/site-config"

export interface PlayerListItem {
    id: string
    old_id: number | null
    first_name: string
    last_name: string
    preffered_name: string | null
}

export interface SeasonInfo {
    id: number
    year: number
    name: string
}

export async function getSignedUpPlayers(): Promise<{
    status: boolean
    message?: string
    players: PlayerListItem[]
    allSeasons: SeasonInfo[]
}> {
    const hasAccess = await checkCaptainPagesAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            players: [],
            allSeasons: []
        }
    }

    try {
        const config = await getSeasonConfig()
        if (!config.seasonId) {
            return {
                status: false,
                message: "No current season found.",
                players: [],
                allSeasons: []
            }
        }

        const signupRows = await db
            .select({
                id: users.id,
                old_id: users.old_id,
                first_name: users.first_name,
                last_name: users.last_name,
                preffered_name: users.preffered_name
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

        return {
            status: true,
            players: signupRows,
            allSeasons: allSeasonRows.map((s) => ({
                id: s.id,
                year: s.year,
                name: s.name
            }))
        }
    } catch (error) {
        console.error("Error fetching signed up players:", error)
        return {
            status: false,
            message: "Something went wrong.",
            players: [],
            allSeasons: []
        }
    }
}

export interface PlayerDetails {
    id: string
    first_name: string
    last_name: string
    preffered_name: string | null
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

export async function getPlayerDetailsForSignups(playerId: string): Promise<{
    status: boolean
    message?: string
    player: PlayerDetails | null
    pairPickName: string | null
    pairReason: string | null
    draftHistory: PlayerDraftHistory[]
}> {
    const hasAccess = await checkCaptainPagesAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            player: null,
            pairPickName: null,
            pairReason: null,
            draftHistory: []
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

        if (!player) {
            return {
                status: false,
                message: "Player not found.",
                player: null,
                pairPickName: null,
                pairReason: null,
                draftHistory: []
            }
        }

        // Get pair info from most recent signup
        let pairPickName: string | null = null
        let pairReason: string | null = null

        const [mostRecentSignup] = await db
            .select({
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

        return {
            status: true,
            player,
            pairPickName,
            pairReason,
            draftHistory: draftData
        }
    } catch (error) {
        console.error("Error fetching player details:", error)
        return {
            status: false,
            message: "Something went wrong.",
            player: null,
            pairPickName: null,
            pairReason: null,
            draftHistory: []
        }
    }
}
