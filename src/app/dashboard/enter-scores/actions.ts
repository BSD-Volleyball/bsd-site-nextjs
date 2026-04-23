"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { and, asc, eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import {
    matches,
    teams,
    divisions,
    individual_divisions,
    scoreSheets
} from "@/database/schema"
import { getSeasonConfig } from "@/lib/site-config"
import { hasPermissionBySession } from "@/lib/rbac"
import {
    createPlayerPictureUploadPresignedUrl,
    deleteR2Object,
    PLAYER_PICTURE_MAX_BYTES
} from "@/lib/r2"
import { logAuditEntry } from "@/lib/audit-log"

async function checkEnterScoresAccess(): Promise<{
    hasAccess: boolean
    seasonId: number | null
}> {
    const config = await getSeasonConfig()
    if (!config.seasonId) return { hasAccess: false, seasonId: null }
    const hasAccess = await hasPermissionBySession("scores:enter", {
        seasonId: config.seasonId
    })
    return { hasAccess, seasonId: config.seasonId }
}

export interface MatchDateOption {
    date: string
    label: string
    isPlayoff: boolean
}

export async function getMatchDatesForSeason(): Promise<{
    status: boolean
    message?: string
    dates: MatchDateOption[]
}> {
    const { hasAccess, seasonId } = await checkEnterScoresAccess()
    if (!hasAccess || !seasonId) {
        return { status: false, message: "Unauthorized", dates: [] }
    }

    try {
        const rows = await db
            .select({
                date: matches.date,
                playoff: matches.playoff
            })
            .from(matches)
            .where(eq(matches.season, seasonId))
            .orderBy(asc(matches.date))

        const dateMap = new Map<string, boolean>()
        for (const row of rows) {
            if (!row.date) continue
            const existing = dateMap.get(row.date)
            // If any match on this date is a playoff match, mark as playoff
            if (existing === undefined) {
                dateMap.set(row.date, row.playoff)
            } else if (row.playoff) {
                dateMap.set(row.date, true)
            }
        }

        const dates: MatchDateOption[] = []
        for (const [date, isPlayoff] of dateMap) {
            const [year, month, day] = date.split("-")
            const label = `${parseInt(month, 10)}/${parseInt(day, 10)}/${year}${isPlayoff ? " (Playoffs)" : ""}`
            dates.push({ date, label, isPlayoff })
        }

        return { status: true, dates }
    } catch (error) {
        console.error("Error fetching match dates:", error)
        return {
            status: false,
            message: "Failed to load match dates.",
            dates: []
        }
    }
}

export interface MatchScoreData {
    matchId: number
    time: string | null
    court: number | null
    homeTeamId: number | null
    homeTeamName: string
    awayTeamId: number | null
    awayTeamName: string
    homeScore: number | null
    awayScore: number | null
    homeSet1Score: number | null
    awaySet1Score: number | null
    homeSet2Score: number | null
    awaySet2Score: number | null
    homeSet3Score: number | null
    awaySet3Score: number | null
    winner: number | null
    playoff: boolean
}

export interface DivisionMatchGroup {
    divisionId: number
    divisionName: string
    matches: MatchScoreData[]
}

export interface ScoreSheetData {
    id: number
    divisionId: number
    imagePath: string
}

export async function getMatchesForDate(date: string): Promise<{
    status: boolean
    message?: string
    divisions: DivisionMatchGroup[]
    scoreSheets: ScoreSheetData[]
}> {
    const { hasAccess, seasonId } = await checkEnterScoresAccess()
    if (!hasAccess || !seasonId) {
        return {
            status: false,
            message: "Unauthorized",
            divisions: [],
            scoreSheets: []
        }
    }

    try {
        // Get divisions active for this season
        const seasonDivisions = await db
            .select({
                divisionId: divisions.id,
                divisionName: divisions.name,
                level: divisions.level
            })
            .from(individual_divisions)
            .innerJoin(
                divisions,
                eq(individual_divisions.division, divisions.id)
            )
            .where(eq(individual_divisions.season, seasonId))
            .orderBy(asc(divisions.level))

        const divisionIds = seasonDivisions.map((d) => d.divisionId)
        if (divisionIds.length === 0) {
            return { status: true, divisions: [], scoreSheets: [] }
        }

        // Get all teams for the season for name lookups
        const teamRows = await db
            .select({
                id: teams.id,
                name: teams.name,
                division: teams.division
            })
            .from(teams)
            .where(eq(teams.season, seasonId))

        const teamMap = new Map<number, { name: string; division: number }>()
        for (const t of teamRows) {
            teamMap.set(t.id, { name: t.name, division: t.division })
        }

        // Get matches for the date
        const matchRows = await db
            .select({
                id: matches.id,
                division: matches.division,
                time: matches.time,
                court: matches.court,
                homeTeam: matches.home_team,
                awayTeam: matches.away_team,
                homeScore: matches.home_score,
                awayScore: matches.away_score,
                homeSet1Score: matches.home_set1_score,
                awaySet1Score: matches.away_set1_score,
                homeSet2Score: matches.home_set2_score,
                awaySet2Score: matches.away_set2_score,
                homeSet3Score: matches.home_set3_score,
                awaySet3Score: matches.away_set3_score,
                winner: matches.winner,
                playoff: matches.playoff
            })
            .from(matches)
            .where(and(eq(matches.season, seasonId), eq(matches.date, date)))
            .orderBy(asc(matches.time), asc(matches.court))

        // Group matches by division
        const divisionMap = new Map<number, MatchScoreData[]>()
        for (const row of matchRows) {
            const homeTeam = row.homeTeam ? teamMap.get(row.homeTeam) : null
            const awayTeam = row.awayTeam ? teamMap.get(row.awayTeam) : null

            const matchData: MatchScoreData = {
                matchId: row.id,
                time: row.time,
                court: row.court,
                homeTeamId: row.homeTeam,
                homeTeamName: homeTeam?.name ?? "TBD",
                awayTeamId: row.awayTeam,
                awayTeamName: awayTeam?.name ?? "TBD",
                homeScore: row.homeScore,
                awayScore: row.awayScore,
                homeSet1Score: row.homeSet1Score,
                awaySet1Score: row.awaySet1Score,
                homeSet2Score: row.homeSet2Score,
                awaySet2Score: row.awaySet2Score,
                homeSet3Score: row.homeSet3Score,
                awaySet3Score: row.awaySet3Score,
                winner: row.winner,
                playoff: row.playoff
            }

            const list = divisionMap.get(row.division) ?? []
            list.push(matchData)
            divisionMap.set(row.division, list)
        }

        const divisionGroups: DivisionMatchGroup[] = seasonDivisions
            .filter((d) => divisionMap.has(d.divisionId))
            .map((d) => ({
                divisionId: d.divisionId,
                divisionName: d.divisionName,
                matches: divisionMap.get(d.divisionId) ?? []
            }))

        // Get existing score sheets
        const sheetRows = await db
            .select({
                id: scoreSheets.id,
                divisionId: scoreSheets.division_id,
                imagePath: scoreSheets.image_path
            })
            .from(scoreSheets)
            .where(
                and(
                    eq(scoreSheets.season_id, seasonId),
                    eq(scoreSheets.match_date, date)
                )
            )

        const scoreSheetData: ScoreSheetData[] = sheetRows.map((s) => ({
            id: s.id,
            divisionId: s.divisionId,
            imagePath: s.imagePath
        }))

        return {
            status: true,
            divisions: divisionGroups,
            scoreSheets: scoreSheetData
        }
    } catch (error) {
        console.error("Error fetching matches for date:", error)
        return {
            status: false,
            message: "Failed to load matches.",
            divisions: [],
            scoreSheets: []
        }
    }
}

export interface MatchScoreInput {
    matchId: number
    homeScore: number | null
    awayScore: number | null
    homeSet1Score: number | null
    awaySet1Score: number | null
    homeSet2Score: number | null
    awaySet2Score: number | null
    homeSet3Score: number | null
    awaySet3Score: number | null
    winner: number | null
}

export async function saveScoresForDivision(
    divisionId: number,
    date: string,
    matchScores: MatchScoreInput[]
): Promise<{ status: boolean; message: string }> {
    const { hasAccess, seasonId } = await checkEnterScoresAccess()
    if (!hasAccess || !seasonId) {
        return { status: false, message: "Unauthorized" }
    }

    if (!divisionId || divisionId <= 0) {
        return { status: false, message: "Invalid division." }
    }

    try {
        // Validate no negative scores
        for (const score of matchScores) {
            const scoreValues = [
                score.homeScore,
                score.awayScore,
                score.homeSet1Score,
                score.awaySet1Score,
                score.homeSet2Score,
                score.awaySet2Score,
                score.homeSet3Score,
                score.awaySet3Score
            ]
            for (const val of scoreValues) {
                if (val !== null && val < 0) {
                    return {
                        status: false,
                        message: "Scores cannot be negative."
                    }
                }
            }
        }

        // Validate that all match IDs belong to this season/division/date
        const matchIds = matchScores.map((m) => m.matchId)
        if (matchIds.length === 0) {
            return { status: false, message: "No matches to save." }
        }

        const validMatches = await db
            .select({
                id: matches.id,
                homeTeam: matches.home_team,
                awayTeam: matches.away_team
            })
            .from(matches)
            .where(
                and(
                    eq(matches.season, seasonId),
                    eq(matches.division, divisionId),
                    eq(matches.date, date),
                    inArray(matches.id, matchIds)
                )
            )

        const validMatchMap = new Map(
            validMatches.map((m) => [
                m.id,
                { homeTeam: m.homeTeam, awayTeam: m.awayTeam }
            ])
        )
        const invalidIds = matchIds.filter((id) => !validMatchMap.has(id))
        if (invalidIds.length > 0) {
            return {
                status: false,
                message: `Invalid match IDs: ${invalidIds.join(", ")}`
            }
        }

        // Validate winner is a participant in each match
        for (const score of matchScores) {
            if (score.winner !== null) {
                const match = validMatchMap.get(score.matchId)
                if (
                    match &&
                    score.winner !== match.homeTeam &&
                    score.winner !== match.awayTeam
                ) {
                    return {
                        status: false,
                        message: `Invalid winner for match ${score.matchId}.`
                    }
                }
            }
        }

        // Update all matches in a transaction
        await db.transaction(async (tx) => {
            for (const score of matchScores) {
                await tx
                    .update(matches)
                    .set({
                        home_score: score.homeScore,
                        away_score: score.awayScore,
                        home_set1_score: score.homeSet1Score,
                        away_set1_score: score.awaySet1Score,
                        home_set2_score: score.homeSet2Score,
                        away_set2_score: score.awaySet2Score,
                        home_set3_score: score.homeSet3Score,
                        away_set3_score: score.awaySet3Score,
                        winner: score.winner
                    })
                    .where(eq(matches.id, score.matchId))
            }
        })

        const session = await auth.api.getSession({
            headers: await headers()
        })
        if (session) {
            await logAuditEntry({
                userId: session.user.id,
                action: "update",
                entityType: "matches",
                entityId: String(divisionId),
                summary: `Entered scores for ${matchScores.length} match(es) in division ${divisionId} on ${date}`
            })
        }

        revalidatePath("/dashboard/enter-scores")
        revalidatePath("/dashboard/season-schedule")
        return {
            status: true,
            message: `Saved scores for ${matchScores.length} match(es).`
        }
    } catch (error) {
        console.error("Error saving scores:", error)
        return { status: false, message: "Failed to save scores." }
    }
}

const SCORE_SHEET_PREFIX = "scoresheets"

export async function createScoreSheetUpload(
    divisionId: number,
    date: string,
    contentLength: number
): Promise<{
    status: boolean
    message?: string
    uploadUrl?: string
    objectKey?: string
}> {
    const { hasAccess, seasonId } = await checkEnterScoresAccess()
    if (!hasAccess || !seasonId) {
        return { status: false, message: "Unauthorized" }
    }

    if (
        !Number.isInteger(contentLength) ||
        contentLength <= 0 ||
        contentLength > PLAYER_PICTURE_MAX_BYTES
    ) {
        return {
            status: false,
            message: `Upload must be between 1 byte and ${PLAYER_PICTURE_MAX_BYTES} bytes.`
        }
    }

    try {
        const timestamp = Date.now()
        const objectKey = `${SCORE_SHEET_PREFIX}/${seasonId}/${date}/div${divisionId}_${timestamp}.jpg`

        const uploadUrl = await createPlayerPictureUploadPresignedUrl({
            key: objectKey,
            contentType: "image/jpeg",
            contentLength
        })

        return { status: true, uploadUrl, objectKey }
    } catch (error) {
        console.error("Error creating score sheet upload URL:", error)
        return { status: false, message: "Failed to start upload." }
    }
}

export async function finalizeScoreSheetUpload(
    divisionId: number,
    date: string,
    objectKey: string
): Promise<{ status: boolean; message: string; scoreSheet?: ScoreSheetData }> {
    const { hasAccess, seasonId } = await checkEnterScoresAccess()
    if (!hasAccess || !seasonId) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        const [inserted] = await db
            .insert(scoreSheets)
            .values({
                season_id: seasonId,
                division_id: divisionId,
                match_date: date,
                image_path: objectKey,
                uploaded_by:
                    (
                        await auth.api.getSession({
                            headers: await headers()
                        })
                    )?.user.id ?? ""
            })
            .returning({
                id: scoreSheets.id,
                divisionId: scoreSheets.division_id,
                imagePath: scoreSheets.image_path
            })

        const session = await auth.api.getSession({
            headers: await headers()
        })
        if (session) {
            await logAuditEntry({
                userId: session.user.id,
                action: "create",
                entityType: "score_sheets",
                entityId: String(inserted.id),
                summary: `Uploaded score sheet for division ${divisionId} on ${date}`
            })
        }

        revalidatePath("/dashboard/enter-scores")
        return {
            status: true,
            message: "Score sheet uploaded.",
            scoreSheet: {
                id: inserted.id,
                divisionId: inserted.divisionId,
                imagePath: inserted.imagePath
            }
        }
    } catch (error) {
        console.error("Error finalizing score sheet upload:", error)
        return { status: false, message: "Failed to save score sheet." }
    }
}

export async function deleteScoreSheet(
    scoreSheetId: number
): Promise<{ status: boolean; message: string }> {
    const { hasAccess, seasonId } = await checkEnterScoresAccess()
    if (!hasAccess || !seasonId) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        const [row] = await db
            .select({
                id: scoreSheets.id,
                seasonId: scoreSheets.season_id,
                imagePath: scoreSheets.image_path
            })
            .from(scoreSheets)
            .where(eq(scoreSheets.id, scoreSheetId))
            .limit(1)

        if (!row || row.seasonId !== seasonId) {
            return { status: false, message: "Score sheet not found." }
        }

        // Delete from R2 storage first
        try {
            await deleteR2Object(row.imagePath)
        } catch (r2Error) {
            console.error("Failed to delete R2 object:", r2Error)
        }

        await db.delete(scoreSheets).where(eq(scoreSheets.id, scoreSheetId))

        const session = await auth.api.getSession({
            headers: await headers()
        })
        if (session) {
            await logAuditEntry({
                userId: session.user.id,
                action: "delete",
                entityType: "score_sheets",
                entityId: String(scoreSheetId),
                summary: `Deleted score sheet ${scoreSheetId}`
            })
        }

        revalidatePath("/dashboard/enter-scores")
        return { status: true, message: "Score sheet deleted." }
    } catch (error) {
        console.error("Error deleting score sheet:", error)
        return { status: false, message: "Failed to delete score sheet." }
    }
}
