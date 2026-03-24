"use server"

import { and, asc, eq, inArray, or } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import {
    divisions,
    drafts,
    draftHomework,
    individual_divisions,
    seasons,
    signups,
    teams,
    users
} from "@/database/schema"
import { getSeasonConfig } from "@/lib/site-config"
import { fetchPlayerScores } from "@/lib/player-score"

export interface DraftHomeworkPlayer {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    oldId: number
    male: boolean | null
    picture: string | null
}

export interface ExistingSelection {
    round: number
    slot: number
    playerId: string
    isMaleTab: boolean
    updatedAt: Date
}

export interface SeasonInfo {
    id: number
    year: number
    name: string
}

export interface DraftHomeworkData {
    seasonId: number
    captainUserId: string
    divisionId: number
    divisionName: string
    numTeams: number
    genderSplit: string
    malePlayers: DraftHomeworkPlayer[]
    nonMalePlayers: DraftHomeworkPlayer[]
    existingSelections: ExistingSelection[]
    lastUpdatedAt: Date | null
    suggestedMalePlayers: DraftHomeworkPlayer[]
    suggestedNonMalePlayers: DraftHomeworkPlayer[]
    allSeasons: SeasonInfo[]
    draftedPlayerIds: string[]
}

function parseSplit(genderSplit: string): { male: number; nonMale: number } {
    const parts = genderSplit.split("-").map(Number)
    return { male: parts[0] ?? 0, nonMale: parts[1] ?? 0 }
}

export async function getDraftHomeworkData(): Promise<{
    status: boolean
    message: string
    data?: DraftHomeworkData
}> {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return { status: false, message: "Not authenticated" }
    }

    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return { status: false, message: "No active season found" }
    }

    const [captainTeam] = await db
        .select({
            divisionId: teams.division
        })
        .from(teams)
        .where(
            and(
                eq(teams.season, config.seasonId),
                or(
                    eq(teams.captain, session.user.id),
                    eq(teams.captain2, session.user.id)
                )
            )
        )
        .limit(1)

    if (!captainTeam) {
        return {
            status: false,
            message:
                "You are not a captain this season. This page is only available to captains."
        }
    }

    const [indivDiv] = await db
        .select({
            numTeams: individual_divisions.teams,
            genderSplit: individual_divisions.gender_split
        })
        .from(individual_divisions)
        .where(
            and(
                eq(individual_divisions.season, config.seasonId),
                eq(individual_divisions.division, captainTeam.divisionId)
            )
        )
        .limit(1)

    if (!indivDiv) {
        return {
            status: false,
            message: "Division configuration not found for this season."
        }
    }

    const [divisionInfo] = await db
        .select({ name: divisions.name })
        .from(divisions)
        .where(eq(divisions.id, captainTeam.divisionId))
        .limit(1)

    if (!divisionInfo) {
        return { status: false, message: "Division not found" }
    }

    // All individual division configs for this season, ordered by level (top to bottom)
    const allDivisionConfigs = await db
        .select({
            divisionId: individual_divisions.division,
            numTeams: individual_divisions.teams,
            genderSplit: individual_divisions.gender_split,
            level: divisions.level
        })
        .from(individual_divisions)
        .innerJoin(divisions, eq(individual_divisions.division, divisions.id))
        .where(eq(individual_divisions.season, config.seasonId))
        .orderBy(asc(divisions.level))

    const playerRows = await db
        .select({
            userId: users.id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preffered_name,
            oldId: users.old_id,
            male: users.male,
            picture: users.picture
        })
        .from(signups)
        .innerJoin(users, eq(signups.player, users.id))
        .where(eq(signups.season, config.seasonId))

    const sortByLastName = (a: DraftHomeworkPlayer, b: DraftHomeworkPlayer) => {
        const lastCmp = a.lastName.localeCompare(b.lastName)
        return lastCmp !== 0 ? lastCmp : a.firstName.localeCompare(b.firstName)
    }

    const malePlayers: DraftHomeworkPlayer[] = playerRows
        .filter((p) => p.male === true)
        .map((p) => ({ ...p, oldId: p.oldId ?? 0 }))
        .sort(sortByLastName)

    const nonMalePlayers: DraftHomeworkPlayer[] = playerRows
        .filter((p) => p.male !== true)
        .map((p) => ({ ...p, oldId: p.oldId ?? 0 }))
        .sort(sortByLastName)

    // --- Score calculation ---
    const userIds = playerRows.map((p) => p.userId)
    const scoreByUser = await fetchPlayerScores(userIds, config.seasonId)

    const sortByScore = (
        a: DraftHomeworkPlayer,
        b: DraftHomeworkPlayer
    ): number => {
        const aScore = scoreByUser.get(a.userId) ?? 200
        const bScore = scoreByUser.get(b.userId) ?? 200
        return aScore - bScore
    }

    const sortedMales = [...malePlayers].sort(sortByScore)
    const sortedNonMales = [...nonMalePlayers].sort(sortByScore)

    // --- Determine which players to show for the captain's division ---
    const BUFFER = 6

    const captainDivIndex = allDivisionConfigs.findIndex(
        (d) => d.divisionId === captainTeam.divisionId
    )
    const isLastDivision = captainDivIndex === allDivisionConfigs.length - 1

    let malesBefore = 0
    let nonMalesBefore = 0
    for (let i = 0; i < captainDivIndex; i++) {
        const div = allDivisionConfigs[i]
        const split = parseSplit(div.genderSplit)
        malesBefore += div.numTeams * split.male
        nonMalesBefore += div.numTeams * split.nonMale
    }

    const captainSplit = parseSplit(indivDiv.genderSplit)
    const captainMaleCount = indivDiv.numTeams * captainSplit.male
    const captainNonMaleCount = indivDiv.numTeams * captainSplit.nonMale

    const maleStart = Math.max(0, malesBefore - BUFFER)
    const maleEnd = isLastDivision
        ? sortedMales.length
        : malesBefore + captainMaleCount + BUFFER

    const nonMaleStart = Math.max(0, nonMalesBefore - BUFFER)
    const nonMaleEnd = isLastDivision
        ? sortedNonMales.length
        : nonMalesBefore + captainNonMaleCount + BUFFER

    // --- Players already drafted this season ---
    const draftedRows = await db
        .select({ userId: drafts.user })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .where(eq(teams.season, config.seasonId))

    const draftedPlayerIds = draftedRows.map((r) => r.userId)
    const draftedSet = new Set(draftedPlayerIds)

    const suggestedMalePlayers = sortedMales
        .slice(maleStart, maleEnd)
        .filter((p) => !draftedSet.has(p.userId))
        .sort(sortByLastName)
    const suggestedNonMalePlayers = sortedNonMales
        .slice(nonMaleStart, nonMaleEnd)
        .filter((p) => !draftedSet.has(p.userId))
        .sort(sortByLastName)

    // --- All seasons (for player detail popup) ---
    const allSeasonRows = await db
        .select({ id: seasons.id, year: seasons.year, name: seasons.season })
        .from(seasons)
        .orderBy(asc(seasons.id))

    // --- Existing selections ---
    const existingRows = await db
        .select({
            round: draftHomework.round,
            slot: draftHomework.slot,
            playerId: draftHomework.player,
            isMaleTab: draftHomework.is_male_tab,
            updatedAt: draftHomework.updated_at
        })
        .from(draftHomework)
        .where(
            and(
                eq(draftHomework.season, config.seasonId),
                eq(draftHomework.captain, session.user.id)
            )
        )

    const lastUpdatedAt =
        existingRows.length > 0
            ? existingRows.reduce(
                  (latest, row) =>
                      row.updatedAt > latest ? row.updatedAt : latest,
                  existingRows[0].updatedAt
              )
            : null

    return {
        status: true,
        message: "Success",
        data: {
            seasonId: config.seasonId,
            captainUserId: session.user.id,
            divisionId: captainTeam.divisionId,
            divisionName: divisionInfo.name,
            numTeams: indivDiv.numTeams,
            genderSplit: indivDiv.genderSplit,
            malePlayers,
            nonMalePlayers,
            existingSelections: existingRows,
            lastUpdatedAt,
            suggestedMalePlayers,
            suggestedNonMalePlayers,
            draftedPlayerIds,
            allSeasons: allSeasonRows.map((s) => ({
                id: s.id,
                year: s.year,
                name: s.name
            }))
        }
    }
}

export interface SaveDraftHomeworkInput {
    selections: {
        round: number
        slot: number
        playerId: string
        isMaleTab: boolean
    }[]
}

export async function saveDraftHomework(
    input: SaveDraftHomeworkInput
): Promise<{ status: boolean; message: string }> {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return { status: false, message: "Not authenticated" }
    }

    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return { status: false, message: "No active season found" }
    }

    const [captainTeam] = await db
        .select({ divisionId: teams.division })
        .from(teams)
        .where(
            and(
                eq(teams.season, config.seasonId),
                or(
                    eq(teams.captain, session.user.id),
                    eq(teams.captain2, session.user.id)
                )
            )
        )
        .limit(1)

    if (!captainTeam) {
        return { status: false, message: "You are not a captain this season" }
    }

    await db
        .delete(draftHomework)
        .where(
            and(
                eq(draftHomework.season, config.seasonId),
                eq(draftHomework.captain, session.user.id)
            )
        )

    const nonEmpty = input.selections.filter((s) => s.playerId)

    if (nonEmpty.length > 0) {
        const now = new Date()
        await db.insert(draftHomework).values(
            nonEmpty.map((s) => ({
                season: config.seasonId as number,
                captain: session.user.id,
                division: captainTeam.divisionId,
                round: s.round,
                slot: s.slot,
                player: s.playerId,
                is_male_tab: s.isMaleTab,
                updated_at: now
            }))
        )
    }

    return { status: true, message: "Draft homework saved successfully!" }
}

// --- Last season's draft data ---

export interface LastSeasonDraftPick {
    round: number
    playerFirstName: string
    playerLastName: string
    playerPreferredName: string | null
    playerMale: boolean | null
}

export interface LastSeasonDraftTeam {
    teamId: number
    teamName: string
    teamNumber: number | null
    captainFirstName: string
    captainLastName: string
    captainPreferredName: string | null
    picks: LastSeasonDraftPick[]
}

export interface LastSeasonDraftData {
    seasonName: string
    seasonYear: number
    divisionName: string
    teams: LastSeasonDraftTeam[]
    numRounds: number
}

export async function getLastSeasonDraft(): Promise<{
    status: boolean
    message: string
    data?: LastSeasonDraftData
}> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return { status: false, message: "Not authenticated" }
    }

    const config = await getSeasonConfig()
    if (!config.seasonId) {
        return { status: false, message: "No active season found" }
    }

    // Find which division the captain is in for the current season
    const [captainTeam] = await db
        .select({ divisionId: teams.division })
        .from(teams)
        .where(
            and(
                eq(teams.season, config.seasonId),
                or(
                    eq(teams.captain, session.user.id),
                    eq(teams.captain2, session.user.id)
                )
            )
        )
        .limit(1)

    if (!captainTeam) {
        return { status: false, message: "You are not a captain this season" }
    }

    // Find the previous season (largest id < current seasonId)
    const [prevSeason] = await db
        .select({ id: seasons.id, name: seasons.season, year: seasons.year })
        .from(seasons)
        .where(eq(seasons.id, config.seasonId - 1))
        .limit(1)

    if (!prevSeason) {
        return {
            status: false,
            message: "No previous season found"
        }
    }

    // Get division name
    const [divisionInfo] = await db
        .select({ name: divisions.name })
        .from(divisions)
        .where(eq(divisions.id, captainTeam.divisionId))
        .limit(1)

    // Get teams from previous season in this division
    const prevTeams = await db
        .select({
            teamId: teams.id,
            teamName: teams.name,
            teamNumber: teams.number,
            captainFirstName: users.first_name,
            captainLastName: users.last_name,
            captainPreferredName: users.preffered_name
        })
        .from(teams)
        .innerJoin(users, eq(teams.captain, users.id))
        .where(
            and(
                eq(teams.season, prevSeason.id),
                eq(teams.division, captainTeam.divisionId)
            )
        )
        .orderBy(asc(teams.number))

    if (prevTeams.length === 0) {
        return {
            status: false,
            message:
                "No draft data found for the previous season in your division"
        }
    }

    const teamIds = prevTeams.map((t) => t.teamId)

    const pickRows = await db
        .select({
            teamId: drafts.team,
            round: drafts.round,
            overall: drafts.overall,
            playerFirstName: users.first_name,
            playerLastName: users.last_name,
            playerPreferredName: users.preffered_name,
            playerMale: users.male
        })
        .from(drafts)
        .innerJoin(users, eq(drafts.user, users.id))
        .where(inArray(drafts.team, teamIds))
        .orderBy(asc(drafts.round), asc(drafts.overall))

    const numRounds =
        pickRows.length > 0 ? Math.max(...pickRows.map((p) => p.round)) : 0

    const picksByTeam = new Map<number, LastSeasonDraftPick[]>()
    for (const pick of pickRows) {
        const existing = picksByTeam.get(pick.teamId) ?? []
        existing.push({
            round: pick.round,
            playerFirstName: pick.playerFirstName,
            playerLastName: pick.playerLastName,
            playerPreferredName: pick.playerPreferredName,
            playerMale: pick.playerMale
        })
        picksByTeam.set(pick.teamId, existing)
    }

    const draftTeams: LastSeasonDraftTeam[] = prevTeams.map((t) => ({
        teamId: t.teamId,
        teamName: t.teamName,
        teamNumber: t.teamNumber,
        captainFirstName: t.captainFirstName,
        captainLastName: t.captainLastName,
        captainPreferredName: t.captainPreferredName,
        picks: picksByTeam.get(t.teamId) ?? []
    }))

    return {
        status: true,
        message: "Success",
        data: {
            seasonName: prevSeason.name,
            seasonYear: prevSeason.year,
            divisionName: divisionInfo?.name ?? "",
            teams: draftTeams,
            numRounds
        }
    }
}
