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
import { and, eq, inArray, desc } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { hasCaptainPagesAccessBySession } from "@/lib/rbac"

export interface SignupCsvEntry {
    oldId: number | null
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
    datesMissing: string | null
    lastDraftSeason: string | null
    lastDraftDivision: string | null
    lastDraftCaptain: string | null
    captainIn: string | null
    draftedIn: string | null
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
                userId: signups.player,
                oldId: users.old_id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preffered_name,
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
                skillOther: users.skill_other,
                datesMissing: signups.dates_missing
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(eq(signups.season, config.seasonId))
            .orderBy(users.last_name, users.first_name)

        const userIds = signupRows.map((r) => r.userId)

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
                    preferredName: users.preffered_name
                })
                .from(users)
                .where(inArray(users.id, pairPickIds))

            for (const u of pairPickUsers) {
                const preferred = u.preferredName ? ` (${u.preferredName})` : ""
                pairPickNames.set(u.id, `${u.firstName}${preferred} ${u.lastName}`)
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
                    captainPreferredName: users.preffered_name
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
                datesMissing: row.datesMissing,
                lastDraftSeason: lastDraft?.season ?? null,
                lastDraftDivision: lastDraft?.division ?? null,
                lastDraftCaptain: lastDraft?.captain ?? null,
                captainIn: captainDivisionMap.get(row.userId) ?? null,
                draftedIn: draftedInMap.get(row.userId) ?? null
            }
        })

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
