"use server"

import { db } from "@/database/db"
import {
    divisions,
    drafts,
    playerRatings,
    signups,
    teams,
    users,
    week1Rosters
} from "@/database/schema"
import { and, desc, eq, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { getSessionUserId, hasCaptainPagesAccessBySession } from "@/lib/rbac"

export type LookupType = "direct" | "tryout1" | "tryout2" | "tryout3"

export interface RatePlayerEntry {
    id: string
    oldId: number | null
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    height: number | null
    lastDivisionName: string | null
    picture: string | null
}

export interface PlayerRatingValues {
    passing: number | null
    setting: number | null
    hitting: number | null
    serving: number | null
    sharedNotes: string | null
    privateNotes: string | null
}

export interface TryoutCourt {
    courtNumber: 1 | 2 | 3 | 4
    players: RatePlayerEntry[]
}

export interface TryoutSessionGroup {
    sessionNumber: number
    courts: TryoutCourt[]
}

export type RatingSkill = "passing" | "setting" | "hitting" | "serving"
export type RatingNoteType = "shared" | "private"

export interface SkillRatingsInput {
    passing: number
    setting: number
    hitting: number
    serving: number
}

const validSkills = new Set<RatingSkill>([
    "passing",
    "setting",
    "hitting",
    "serving"
])

const validNoteTypes = new Set<RatingNoteType>(["shared", "private"])

function buildSeasonLabel(seasonName: string, seasonYear: number): string {
    return `${seasonName.charAt(0).toUpperCase() + seasonName.slice(1)} ${seasonYear}`
}

function sortPlayersByOldIdThenName(
    a: RatePlayerEntry,
    b: RatePlayerEntry
): number {
    const aOldId = a.oldId ?? Number.MAX_SAFE_INTEGER
    const bOldId = b.oldId ?? Number.MAX_SAFE_INTEGER

    if (aOldId !== bOldId) {
        return aOldId - bOldId
    }

    const aDisplay =
        `${a.preferredName || a.firstName} ${a.lastName}`.toLowerCase()
    const bDisplay =
        `${b.preferredName || b.firstName} ${b.lastName}`.toLowerCase()

    return aDisplay.localeCompare(bDisplay)
}

function getRatingSkillUpdate(
    skill: RatingSkill,
    value: number
): Partial<typeof playerRatings.$inferInsert> {
    if (skill === "passing") {
        return { passing: value }
    }

    if (skill === "setting") {
        return { setting: value }
    }

    if (skill === "hitting") {
        return { hitting: value }
    }

    return { serving: value }
}

function getRatingNoteUpdate(
    noteType: RatingNoteType,
    note: string | null
): Partial<typeof playerRatings.$inferInsert> {
    if (noteType === "shared") {
        return { shared_notes: note }
    }

    return { private_notes: note }
}

async function getSaveContext(): Promise<
    | {
          status: true
          seasonId: number
          evaluatorId: string
      }
    | {
          status: false
          message: string
      }
> {
    const hasAccess = await hasCaptainPagesAccessBySession()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized" }
    }

    const evaluatorId = await getSessionUserId()
    if (!evaluatorId) {
        return { status: false, message: "Not authenticated." }
    }

    const config = await getSeasonConfig()
    if (!config.seasonId) {
        return { status: false, message: "No active season found." }
    }

    return {
        status: true,
        seasonId: config.seasonId,
        evaluatorId
    }
}

async function ensurePlayerIsActiveSeasonSignup(
    playerId: string,
    seasonId: number
): Promise<boolean> {
    const [signup] = await db
        .select({ id: signups.id })
        .from(signups)
        .where(and(eq(signups.season, seasonId), eq(signups.player, playerId)))
        .limit(1)

    return !!signup
}

export async function getRatePlayerData(): Promise<{
    status: boolean
    message?: string
    seasonLabel: string
    players: RatePlayerEntry[]
    tryout1Sessions: TryoutSessionGroup[]
    ratingsByPlayer: Record<string, PlayerRatingValues>
}> {
    const hasAccess = await hasCaptainPagesAccessBySession()
    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            seasonLabel: "",
            players: [],
            tryout1Sessions: [],
            ratingsByPlayer: {}
        }
    }

    const evaluatorId = await getSessionUserId()
    if (!evaluatorId) {
        return {
            status: false,
            message: "Not authenticated.",
            seasonLabel: "",
            players: [],
            tryout1Sessions: [],
            ratingsByPlayer: {}
        }
    }

    try {
        const config = await getSeasonConfig()
        if (!config.seasonId) {
            return {
                status: false,
                message: "No active season found.",
                seasonLabel: "",
                players: [],
                tryout1Sessions: [],
                ratingsByPlayer: {}
            }
        }

        const seasonLabel = buildSeasonLabel(
            config.seasonName,
            config.seasonYear
        )

        const signupRows = await db
            .select({
                id: users.id,
                oldId: users.old_id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preffered_name,
                male: users.male,
                height: users.height,
                picture: users.picture
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(eq(signups.season, config.seasonId))

        if (signupRows.length === 0) {
            return {
                status: true,
                seasonLabel,
                players: [],
                tryout1Sessions: [],
                ratingsByPlayer: {}
            }
        }

        const playerIds = signupRows.map((row) => row.id)

        const draftRows = await db
            .select({
                userId: drafts.user,
                seasonId: teams.season,
                divisionName: divisions.name,
                draftId: drafts.id
            })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .innerJoin(divisions, eq(teams.division, divisions.id))
            .where(inArray(drafts.user, playerIds))
            .orderBy(desc(teams.season), desc(drafts.id))

        const lastDivisionByPlayerId = new Map<string, string>()
        for (const row of draftRows) {
            if (!lastDivisionByPlayerId.has(row.userId)) {
                lastDivisionByPlayerId.set(row.userId, row.divisionName)
            }
        }

        const players = signupRows
            .map(
                (row): RatePlayerEntry => ({
                    id: row.id,
                    oldId: row.oldId,
                    firstName: row.firstName,
                    lastName: row.lastName,
                    preferredName: row.preferredName,
                    male: row.male,
                    height: row.height,
                    picture: row.picture,
                    lastDivisionName: lastDivisionByPlayerId.get(row.id) || null
                })
            )
            .sort(sortPlayersByOldIdThenName)

        const playersById = new Map(
            players.map((player) => [player.id, player])
        )

        const ratingsByPlayer: Record<string, PlayerRatingValues> = {}

        const ratingRows = await db
            .select({
                playerId: playerRatings.player,
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
                    eq(playerRatings.evaluator, evaluatorId),
                    inArray(playerRatings.player, playerIds)
                )
            )

        for (const row of ratingRows) {
            ratingsByPlayer[row.playerId] = {
                passing: row.passing,
                setting: row.setting,
                hitting: row.hitting,
                serving: row.serving,
                sharedNotes: row.sharedNotes,
                privateNotes: row.privateNotes
            }
        }

        const rosterRows = await db
            .select({
                userId: week1Rosters.user,
                sessionNumber: week1Rosters.session_number,
                courtNumber: week1Rosters.court_number
            })
            .from(week1Rosters)
            .where(eq(week1Rosters.season, config.seasonId))
            .orderBy(week1Rosters.session_number, week1Rosters.court_number)

        const sessionMap = new Map<
            number,
            Map<1 | 2 | 3 | 4, RatePlayerEntry[]>
        >()

        for (const row of rosterRows) {
            if (
                row.courtNumber < 1 ||
                row.courtNumber > 4 ||
                row.sessionNumber <= 0
            ) {
                continue
            }

            const player = playersById.get(row.userId)
            if (!player) {
                continue
            }

            const courtNumber = row.courtNumber as 1 | 2 | 3 | 4

            if (!sessionMap.has(row.sessionNumber)) {
                sessionMap.set(
                    row.sessionNumber,
                    new Map([
                        [1, []],
                        [2, []],
                        [3, []],
                        [4, []]
                    ])
                )
            }

            sessionMap.get(row.sessionNumber)!.get(courtNumber)!.push(player)
        }

        const tryout1Sessions: TryoutSessionGroup[] = [...sessionMap.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([sessionNumber, courtMap]) => ({
                sessionNumber,
                courts: ([1, 2, 3, 4] as const).map((courtNumber) => ({
                    courtNumber,
                    players: [...(courtMap.get(courtNumber) || [])].sort(
                        sortPlayersByOldIdThenName
                    )
                }))
            }))

        return {
            status: true,
            seasonLabel,
            players,
            tryout1Sessions,
            ratingsByPlayer
        }
    } catch (error) {
        console.error("Error loading rate player data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            seasonLabel: "",
            players: [],
            tryout1Sessions: [],
            ratingsByPlayer: {}
        }
    }
}

export async function savePlayerSkillRating(
    playerId: string,
    skill: RatingSkill,
    value: number
): Promise<{ status: boolean; message: string }> {
    if (!playerId.trim()) {
        return { status: false, message: "Player ID is required." }
    }

    if (!validSkills.has(skill)) {
        return { status: false, message: "Invalid skill type." }
    }

    const context = await getSaveContext()
    if (!context.status) {
        return { status: false, message: context.message }
    }

    if (!Number.isInteger(value) || value < 0 || value > 4) {
        return {
            status: false,
            message: "Skill values must be between 0 and 4."
        }
    }

    try {
        const playerIsSignedUp = await ensurePlayerIsActiveSeasonSignup(
            playerId,
            context.seasonId
        )

        if (!playerIsSignedUp) {
            return {
                status: false,
                message: "Player is not signed up for the active season."
            }
        }

        const now = new Date()
        const skillUpdate = getRatingSkillUpdate(skill, value)

        await db
            .insert(playerRatings)
            .values({
                season: context.seasonId,
                player: playerId,
                evaluator: context.evaluatorId,
                updated_at: now,
                ...skillUpdate
            })
            .onConflictDoUpdate({
                target: [
                    playerRatings.season,
                    playerRatings.player,
                    playerRatings.evaluator
                ],
                set: {
                    ...skillUpdate,
                    updated_at: now
                }
            })

        return { status: true, message: "Rating saved." }
    } catch (error) {
        console.error("Error saving player skill rating:", error)
        return {
            status: false,
            message: "Failed to save rating."
        }
    }
}

export async function savePlayerSkillRatings(
    playerId: string,
    values: SkillRatingsInput
): Promise<{ status: boolean; message: string }> {
    if (!playerId.trim()) {
        return { status: false, message: "Player ID is required." }
    }

    const context = await getSaveContext()
    if (!context.status) {
        return { status: false, message: context.message }
    }

    const skillValues = [
        values.passing,
        values.setting,
        values.hitting,
        values.serving
    ]

    const areValuesValid = skillValues.every(
        (value) => Number.isInteger(value) && value >= 0 && value <= 4
    )

    if (!areValuesValid) {
        return {
            status: false,
            message: "Skill values must be between 0 and 4."
        }
    }

    try {
        const playerIsSignedUp = await ensurePlayerIsActiveSeasonSignup(
            playerId,
            context.seasonId
        )

        if (!playerIsSignedUp) {
            return {
                status: false,
                message: "Player is not signed up for the active season."
            }
        }

        const now = new Date()

        await db
            .insert(playerRatings)
            .values({
                season: context.seasonId,
                player: playerId,
                evaluator: context.evaluatorId,
                passing: values.passing,
                setting: values.setting,
                hitting: values.hitting,
                serving: values.serving,
                updated_at: now
            })
            .onConflictDoUpdate({
                target: [
                    playerRatings.season,
                    playerRatings.player,
                    playerRatings.evaluator
                ],
                set: {
                    passing: values.passing,
                    setting: values.setting,
                    hitting: values.hitting,
                    serving: values.serving,
                    updated_at: now
                }
            })

        return { status: true, message: "Ratings saved." }
    } catch (error) {
        console.error("Error saving player skill ratings:", error)
        return {
            status: false,
            message: "Failed to save ratings."
        }
    }
}

export async function savePlayerRatingNote(
    playerId: string,
    noteType: RatingNoteType,
    note: string
): Promise<{ status: boolean; message: string }> {
    if (!playerId.trim()) {
        return { status: false, message: "Player ID is required." }
    }

    if (!validNoteTypes.has(noteType)) {
        return { status: false, message: "Invalid note type." }
    }

    const context = await getSaveContext()
    if (!context.status) {
        return { status: false, message: context.message }
    }

    try {
        const playerIsSignedUp = await ensurePlayerIsActiveSeasonSignup(
            playerId,
            context.seasonId
        )

        if (!playerIsSignedUp) {
            return {
                status: false,
                message: "Player is not signed up for the active season."
            }
        }

        const normalizedNote = note.trim() || null
        const noteUpdate = getRatingNoteUpdate(noteType, normalizedNote)
        const now = new Date()

        await db
            .insert(playerRatings)
            .values({
                season: context.seasonId,
                player: playerId,
                evaluator: context.evaluatorId,
                updated_at: now,
                ...noteUpdate
            })
            .onConflictDoUpdate({
                target: [
                    playerRatings.season,
                    playerRatings.player,
                    playerRatings.evaluator
                ],
                set: {
                    ...noteUpdate,
                    updated_at: now
                }
            })

        return { status: true, message: "Note saved." }
    } catch (error) {
        console.error("Error saving player rating note:", error)
        return {
            status: false,
            message: "Failed to save note."
        }
    }
}
