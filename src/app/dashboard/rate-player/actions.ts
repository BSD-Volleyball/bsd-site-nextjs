"use server"

import { db } from "@/database/db"
import {
    divisions,
    drafts,
    playerRatings,
    signups,
    teams,
    users,
    week1Rosters,
    week2Rosters,
    week3Rosters
} from "@/database/schema"
import { and, desc, eq, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { logAuditEntry } from "@/lib/audit-log"
import { getTeamRosterWithSubs } from "@/lib/roster"
import { getSessionUserId, hasCaptainPagesAccessBySession } from "@/lib/rbac"
import {
    withAction,
    ok,
    fail,
    requireSession,
    requireSeasonConfig,
    requirePermission
} from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"

export type LookupType = "direct" | "tryout1" | "tryout2" | "tryout3" | "byTeam"

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
    overall: number | null
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

export interface TryoutTeam {
    teamNumber: number
    players: RatePlayerEntry[]
}

export interface TryoutDivisionGroup {
    divisionName: string
    teams: TryoutTeam[]
}

// "By Team" lookup: real drafted season teams grouped under their division.
export interface SeasonTeamGroup {
    teamId: number
    teamName: string
    teamNumber: number | null
    players: RatePlayerEntry[]
}

export interface SeasonTeamDivisionGroup {
    divisionName: string
    teams: SeasonTeamGroup[]
}

// Points the "By Team" view at the team the viewing user captains, so it can
// open pre-expanded to that team. Null when the viewer captains no team.
export interface CaptainTeamRef {
    divisionName: string
    teamId: number
}

export type RatingSkill =
    | "overall"
    | "passing"
    | "setting"
    | "hitting"
    | "serving"
export type RatingNoteType = "shared" | "private"

export interface SkillRatingsInput {
    overall: number
    passing: number
    setting: number
    hitting: number
    serving: number
}

const validSkills = new Set<RatingSkill>([
    "overall",
    "passing",
    "setting",
    "hitting",
    "serving"
])

const validNoteTypes = new Set<RatingNoteType>(["shared", "private"])

function buildSeasonLabel(seasonName: string, seasonYear: number): string {
    return `${seasonName.charAt(0).toUpperCase() + seasonName.slice(1)} ${seasonYear}`
}

function sortPlayers(
    a: RatePlayerEntry,
    b: RatePlayerEntry,
    hasHistoryFn: (entry: RatePlayerEntry) => boolean
): number {
    // New players (no draft history) before returning players
    const aNew = hasHistoryFn(a) ? 1 : 0
    const bNew = hasHistoryFn(b) ? 1 : 0
    if (aNew !== bNew) return aNew - bNew
    // Male players before non-male
    const aMale = a.male === true ? 0 : 1
    const bMale = b.male === true ? 0 : 1
    if (aMale !== bMale) return aMale - bMale
    // Alphabetical by last name
    return a.lastName.localeCompare(b.lastName)
}

function buildDivisionGroups(
    rosterRows: Array<{
        userId: string
        divisionName: string
        divisionLevel: number
        teamNumber: number
    }>,
    playersById: Map<string, RatePlayerEntry>,
    lastDivisionByPlayerId: Map<string, string>
): TryoutDivisionGroup[] {
    const divisionMap = new Map<
        string,
        { level: number; teams: Map<number, RatePlayerEntry[]> }
    >()

    for (const row of rosterRows) {
        const player = playersById.get(row.userId)
        if (!player) continue

        if (!divisionMap.has(row.divisionName)) {
            divisionMap.set(row.divisionName, {
                level: row.divisionLevel,
                teams: new Map()
            })
        }

        const divEntry = divisionMap.get(row.divisionName)!
        if (!divEntry.teams.has(row.teamNumber)) {
            divEntry.teams.set(row.teamNumber, [])
        }
        divEntry.teams.get(row.teamNumber)!.push(player)
    }

    return [...divisionMap.entries()]
        .sort((a, b) => a[1].level - b[1].level)
        .map(([divisionName, { teams }]) => ({
            divisionName,
            teams: [...teams.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([teamNumber, players]) => ({
                    teamNumber,
                    players: [...players].sort((a, b) =>
                        sortPlayers(a, b, (p) =>
                            lastDivisionByPlayerId.has(p.id)
                        )
                    )
                }))
        }))
}

function toNullableRating(value: number): number | null {
    return value === 0 ? null : value
}

function getRatingSkillUpdate(
    skill: RatingSkill,
    value: number
): Partial<typeof playerRatings.$inferInsert> {
    const nullableValue = toNullableRating(value)

    if (skill === "overall") {
        return { overall: nullableValue }
    }

    if (skill === "passing") {
        return { passing: nullableValue }
    }

    if (skill === "setting") {
        return { setting: nullableValue }
    }

    if (skill === "hitting") {
        return { hitting: nullableValue }
    }

    return { serving: nullableValue }
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
    tryout2Divisions: TryoutDivisionGroup[]
    tryout3Divisions: TryoutDivisionGroup[]
    byTeamDivisions: SeasonTeamDivisionGroup[]
    captainTeam: CaptainTeamRef | null
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
            tryout2Divisions: [],
            tryout3Divisions: [],
            byTeamDivisions: [],
            captainTeam: null,
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
            tryout2Divisions: [],
            tryout3Divisions: [],
            byTeamDivisions: [],
            captainTeam: null,
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
                tryout2Divisions: [],
                tryout3Divisions: [],
                byTeamDivisions: [],
                captainTeam: null,
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
                preferredName: users.preferred_name,
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
                tryout2Divisions: [],
                tryout3Divisions: [],
                byTeamDivisions: [],
                captainTeam: null,
                ratingsByPlayer: {}
            }
        }

        const playerIds = signupRows.map((row) => row.id)

        const draftRows = await db
            .select({
                userId: drafts.user,
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
            .filter((row) => row.id !== evaluatorId)
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
            .sort((a, b) =>
                sortPlayers(a, b, (p) => lastDivisionByPlayerId.has(p.id))
            )

        const playersById = new Map(
            players.map((player) => [player.id, player])
        )

        const ratingsByPlayer: Record<string, PlayerRatingValues> = {}

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
                    eq(playerRatings.evaluator, evaluatorId),
                    inArray(playerRatings.player, playerIds)
                )
            )

        for (const row of ratingRows) {
            ratingsByPlayer[row.playerId] = {
                overall: row.overall,
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
                        (a, b) =>
                            sortPlayers(a, b, (p) =>
                                lastDivisionByPlayerId.has(p.id)
                            )
                    )
                }))
            }))

        const [week2RosterRows, week3RosterRows] = await Promise.all([
            db
                .select({
                    userId: week2Rosters.user,
                    divisionName: divisions.name,
                    divisionLevel: divisions.level,
                    teamNumber: week2Rosters.team_number
                })
                .from(week2Rosters)
                .innerJoin(divisions, eq(week2Rosters.division, divisions.id))
                .where(eq(week2Rosters.season, config.seasonId))
                .orderBy(divisions.level, week2Rosters.team_number),
            db
                .select({
                    userId: week3Rosters.user,
                    divisionName: divisions.name,
                    divisionLevel: divisions.level,
                    teamNumber: week3Rosters.team_number
                })
                .from(week3Rosters)
                .innerJoin(divisions, eq(week3Rosters.division, divisions.id))
                .where(eq(week3Rosters.season, config.seasonId))
                .orderBy(divisions.level, week3Rosters.team_number)
        ])

        const tryout2Divisions = buildDivisionGroups(
            week2RosterRows,
            playersById,
            lastDivisionByPlayerId
        )
        const tryout3Divisions = buildDivisionGroups(
            week3RosterRows,
            playersById,
            lastDivisionByPlayerId
        )

        // "By Team" — actual drafted season teams. Each team's roster is the
        // captain(s) plus drafted players with the permanent-sub chain resolved
        // to the currently-active player. Members are filtered through
        // playersById, which drops non-signups and the evaluator themselves.
        const teamRows = await db
            .select({
                teamId: teams.id,
                teamName: teams.name,
                teamNumber: teams.number,
                captain: teams.captain,
                captain2: teams.captain2,
                divisionName: divisions.name
            })
            .from(teams)
            .innerJoin(divisions, eq(teams.division, divisions.id))
            .where(eq(teams.season, config.seasonId))
            .orderBy(divisions.level, teams.number)

        const byTeamDivisions: SeasonTeamDivisionGroup[] = []
        let captainTeam: CaptainTeamRef | null = null

        if (teamRows.length > 0) {
            const rosterEntries = await getTeamRosterWithSubs(config.seasonId)
            const activeUserIdsByTeam = new Map<number, Set<string>>()
            for (const entry of rosterEntries) {
                const ids =
                    activeUserIdsByTeam.get(entry.teamId) ?? new Set<string>()
                ids.add(entry.activeUser.id)
                activeUserIdsByTeam.set(entry.teamId, ids)
            }

            const divisionOrder: string[] = []
            const teamsByDivision = new Map<string, SeasonTeamGroup[]>()

            for (const team of teamRows) {
                if (
                    team.captain === evaluatorId ||
                    team.captain2 === evaluatorId
                ) {
                    captainTeam = {
                        divisionName: team.divisionName,
                        teamId: team.teamId
                    }
                }

                const memberIds = new Set<string>([team.captain])
                if (team.captain2) {
                    memberIds.add(team.captain2)
                }
                for (const id of activeUserIdsByTeam.get(team.teamId) ?? []) {
                    memberIds.add(id)
                }

                const teamPlayers: RatePlayerEntry[] = []
                for (const id of memberIds) {
                    const player = playersById.get(id)
                    if (player) {
                        teamPlayers.push(player)
                    }
                }
                teamPlayers.sort((a, b) =>
                    sortPlayers(a, b, (p) => lastDivisionByPlayerId.has(p.id))
                )

                if (!teamsByDivision.has(team.divisionName)) {
                    teamsByDivision.set(team.divisionName, [])
                    divisionOrder.push(team.divisionName)
                }
                teamsByDivision.get(team.divisionName)!.push({
                    teamId: team.teamId,
                    teamName: team.teamName,
                    teamNumber: team.teamNumber,
                    players: teamPlayers
                })
            }

            for (const divisionName of divisionOrder) {
                byTeamDivisions.push({
                    divisionName,
                    teams: teamsByDivision.get(divisionName)!
                })
            }
        }

        return {
            status: true,
            seasonLabel,
            players,
            tryout1Sessions,
            tryout2Divisions,
            tryout3Divisions,
            byTeamDivisions,
            captainTeam,
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
            tryout2Divisions: [],
            tryout3Divisions: [],
            byTeamDivisions: [],
            captainTeam: null,
            ratingsByPlayer: {}
        }
    }
}

export const savePlayerSkillRating = withAction(
    async (
        playerId: string,
        skill: RatingSkill,
        value: number
    ): Promise<ActionResult> => {
        if (!playerId.trim()) {
            return fail("Player ID is required.")
        }

        if (!validSkills.has(skill)) {
            return fail("Invalid skill type.")
        }

        const session = await requireSession()
        const config = await requireSeasonConfig()
        await requirePermission("players:rate", { seasonId: config.seasonId })
        const context = {
            seasonId: config.seasonId,
            evaluatorId: session.user.id
        }

        if (playerId === context.evaluatorId) {
            return fail("You cannot rate yourself.")
        }

        if (!Number.isFinite(value) || value < 0 || value > 6) {
            return fail("Skill values must be between 0 and 6.")
        }

        try {
            const playerIsSignedUp = await ensurePlayerIsActiveSeasonSignup(
                playerId,
                context.seasonId
            )

            if (!playerIsSignedUp) {
                return fail("Player is not signed up for the active season.")
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

            await logAuditEntry({
                userId: context.evaluatorId,
                action: "update",
                entityType: "player_rating",
                entityId: playerId,
                summary: `Saved ${skill} rating (${value}) for player ${playerId} in season ${context.seasonId}`
            })

            return ok(undefined, "Rating saved.")
        } catch (error) {
            console.error("Error saving player skill rating:", error)
            return fail("Failed to save rating.")
        }
    }
)

export const savePlayerSkillRatings = withAction(
    async (
        playerId: string,
        values: SkillRatingsInput
    ): Promise<ActionResult> => {
        if (!playerId.trim()) {
            return fail("Player ID is required.")
        }

        const session = await requireSession()
        const config = await requireSeasonConfig()
        await requirePermission("players:rate", { seasonId: config.seasonId })
        const context = {
            seasonId: config.seasonId,
            evaluatorId: session.user.id
        }

        if (playerId === context.evaluatorId) {
            return fail("You cannot rate yourself.")
        }

        const skillValues = [
            values.overall,
            values.passing,
            values.setting,
            values.hitting,
            values.serving
        ]

        const areValuesValid = skillValues.every(
            (value) => Number.isFinite(value) && value >= 0 && value <= 6
        )

        if (!areValuesValid) {
            return fail("Skill values must be between 0 and 6.")
        }

        try {
            const playerIsSignedUp = await ensurePlayerIsActiveSeasonSignup(
                playerId,
                context.seasonId
            )

            if (!playerIsSignedUp) {
                return fail("Player is not signed up for the active season.")
            }

            const now = new Date()

            await db
                .insert(playerRatings)
                .values({
                    season: context.seasonId,
                    player: playerId,
                    evaluator: context.evaluatorId,
                    overall: toNullableRating(values.overall),
                    passing: toNullableRating(values.passing),
                    setting: toNullableRating(values.setting),
                    hitting: toNullableRating(values.hitting),
                    serving: toNullableRating(values.serving),
                    updated_at: now
                })
                .onConflictDoUpdate({
                    target: [
                        playerRatings.season,
                        playerRatings.player,
                        playerRatings.evaluator
                    ],
                    set: {
                        overall: toNullableRating(values.overall),
                        passing: toNullableRating(values.passing),
                        setting: toNullableRating(values.setting),
                        hitting: toNullableRating(values.hitting),
                        serving: toNullableRating(values.serving),
                        updated_at: now
                    }
                })

            await logAuditEntry({
                userId: context.evaluatorId,
                action: "update",
                entityType: "player_rating",
                entityId: playerId,
                summary: `Saved full skill ratings for player ${playerId} in season ${context.seasonId}`
            })

            return ok(undefined, "Ratings saved.")
        } catch (error) {
            console.error("Error saving player skill ratings:", error)
            return fail("Failed to save ratings.")
        }
    }
)

export const savePlayerRatingNote = withAction(
    async (
        playerId: string,
        noteType: RatingNoteType,
        note: string
    ): Promise<ActionResult> => {
        if (!playerId.trim()) {
            return fail("Player ID is required.")
        }

        if (!validNoteTypes.has(noteType)) {
            return fail("Invalid note type.")
        }

        const session = await requireSession()
        const config = await requireSeasonConfig()
        await requirePermission("players:rate", { seasonId: config.seasonId })
        const context = {
            seasonId: config.seasonId,
            evaluatorId: session.user.id
        }

        if (playerId === context.evaluatorId) {
            return fail("You cannot rate yourself.")
        }

        try {
            const playerIsSignedUp = await ensurePlayerIsActiveSeasonSignup(
                playerId,
                context.seasonId
            )

            if (!playerIsSignedUp) {
                return fail("Player is not signed up for the active season.")
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

            await logAuditEntry({
                userId: context.evaluatorId,
                action: "update",
                entityType: "player_rating",
                entityId: playerId,
                summary: `Saved ${noteType} note for player ${playerId} in season ${context.seasonId}`
            })

            return ok(undefined, "Note saved.")
        } catch (error) {
            console.error("Error saving player rating note:", error)
            return fail("Failed to save note.")
        }
    }
)
