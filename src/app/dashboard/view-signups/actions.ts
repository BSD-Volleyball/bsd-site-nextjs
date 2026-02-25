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
import { eq, inArray, desc } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { hasCaptainPagesAccessBySession } from "@/lib/rbac"

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
                preferredName: users.preffered_name,
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
                    preferredName: users.preffered_name
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
