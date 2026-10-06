import "server-only"

import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { splitByGender } from "@/lib/utils"
import { and, asc, eq, or } from "drizzle-orm"
import { getSessionUser } from "@/next/session"
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

export const getDraftHomeworkData = withAction(
    async (): Promise<ActionResult<DraftHomeworkData>> => {
        const user = await getSessionUser()

        if (!user) {
            return fail("Not authenticated")
        }

        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return fail("No active season found")
        }

        const [captainTeam] = await db
            .select({
                divisionId: teams.division
            })
            .from(teams)
            .where(
                and(
                    eq(teams.season, config.seasonId),
                    or(eq(teams.captain, user.id), eq(teams.captain2, user.id))
                )
            )
            .limit(1)

        if (!captainTeam) {
            return fail(
                "You are not a captain this season. This page is only available to captains."
            )
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
            return fail("Division configuration not found for this season.")
        }

        const [divisionInfo] = await db
            .select({ name: divisions.name })
            .from(divisions)
            .where(eq(divisions.id, captainTeam.divisionId))
            .limit(1)

        if (!divisionInfo) {
            return fail("Division not found")
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
            .innerJoin(
                divisions,
                eq(individual_divisions.division, divisions.id)
            )
            .where(eq(individual_divisions.season, config.seasonId))
            .orderBy(asc(divisions.level))

        const playerRows = await db
            .select({
                userId: users.id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                oldId: users.old_id,
                male: users.male,
                picture: users.picture
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(eq(signups.season, config.seasonId))

        const sortByLastName = (
            a: DraftHomeworkPlayer,
            b: DraftHomeworkPlayer
        ) => {
            const lastCmp = a.lastName.localeCompare(b.lastName)
            return lastCmp !== 0
                ? lastCmp
                : a.firstName.localeCompare(b.firstName)
        }

        const { males, nonMales } = splitByGender(playerRows)
        const malePlayers: DraftHomeworkPlayer[] = males
            .map((p) => ({ ...p, oldId: p.oldId ?? 0 }))
            .sort(sortByLastName)

        const nonMalePlayers: DraftHomeworkPlayer[] = nonMales
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
            .select({
                id: seasons.id,
                year: seasons.year,
                name: seasons.season
            })
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
                    eq(draftHomework.captain, user.id)
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

        return ok(
            {
                seasonId: config.seasonId,
                captainUserId: user.id,
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
            },
            "Success"
        )
    }
)
