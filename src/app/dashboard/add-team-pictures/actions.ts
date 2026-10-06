"use server"

import { logger } from "@/lib/logger"
import { revalidatePath } from "next/cache"
import { revalidateCalendarFeeds } from "@/next/calendar-invalidation"
import { and, asc, desc, eq } from "drizzle-orm"
import { db } from "@/database/db"
import { divisions, seasons, teams } from "@/database/schema"
import {
    ActionError,
    type ActionResult,
    fail,
    ok,
    requireAdmin,
    requirePermission,
    requirePositiveInt,
    requireSeasonConfig,
    withAction
} from "@/next/action-helpers"
import { getSessionUserId, isAdminOrDirectorBySession } from "@/next/session"
import {
    createPlayerPictureUploadPresignedUrl,
    PLAYER_PICTURE_MAX_BYTES
} from "@/lib/r2"
import { logAuditEntry } from "@/lib/audit-log"

// R2 prefix for team roster photos — sibling of "scoresheets" / "playerpics".
const TEAM_PHOTO_PREFIX = "teamphotos"

// Deterministic key: one object per team, re-upload overwrites it (replace-only).
function teamPhotoObjectKey(seasonId: number, teamId: number): string {
    return `${TEAM_PHOTO_PREFIX}/${seasonId}/team${teamId}.jpg`
}

// Confirm a team exists in the season and that the caller's pictures:manage
// covers its division (a division-scoped commissioner may only touch their
// own teams). Returns false when the team is not in the season; throws
// ActionError("Unauthorized.") when it is out of the caller's scope.
async function canManageTeamPhoto(
    teamId: number,
    seasonId: number,
    currentSeasonId: number
): Promise<boolean> {
    const [row] = await db
        .select({ division: teams.division })
        .from(teams)
        .where(and(eq(teams.id, teamId), eq(teams.season, seasonId)))
        .limit(1)
    if (!row) return false
    await requirePermission("pictures:manage", {
        seasonId: currentSeasonId,
        divisionId: row.division
    })
    return true
}

/**
 * Resolves which season the caller may work on. Callers have already been
 * checked for `pictures:manage` on the current season; targeting any *other*
 * season additionally requires admin/director (the season selector on the
 * page is admin-only).
 */
async function resolvePictureSeason(
    requestedSeasonId: number | undefined,
    currentSeasonId: number
): Promise<number> {
    if (requestedSeasonId === undefined || requestedSeasonId === null) {
        return currentSeasonId
    }

    const seasonId = requirePositiveInt(requestedSeasonId, "season")
    if (seasonId === currentSeasonId) return seasonId

    await requireAdmin()
    const [row] = await db
        .select({ id: seasons.id })
        .from(seasons)
        .where(eq(seasons.id, seasonId))
        .limit(1)
    if (!row) throw new ActionError("Season not found.")
    return seasonId
}

export interface PictureSeasonOption {
    seasonId: number
    label: string
}

/** Season list for the admin-only selector; empty for non-admins. */
export async function getSeasonOptionsForPictures(): Promise<
    PictureSeasonOption[]
> {
    if (!(await isAdminOrDirectorBySession())) return []

    const rows = await db
        .select({
            id: seasons.id,
            year: seasons.year,
            season: seasons.season
        })
        .from(seasons)
        .orderBy(desc(seasons.id))

    return rows.map((row) => ({
        seasonId: row.id,
        label: `${row.season.charAt(0).toUpperCase()}${row.season.slice(1)} ${row.year}`
    }))
}

export interface TeamPhotoItem {
    teamId: number
    teamName: string
    teamNumber: number | null
    // R2 object key (null when no photo uploaded yet).
    pictureUrl: string | null
}

export interface DivisionTeamGroup {
    divisionId: number
    divisionName: string
    teams: TeamPhotoItem[]
}

export const getTeamsForPicturePage = withAction(
    async (
        requestedSeasonId?: number
    ): Promise<ActionResult<DivisionTeamGroup[]>> => {
        try {
            const config = await requireSeasonConfig()
            await requirePermission("pictures:manage", {
                seasonId: config.seasonId
            })
            const seasonId = await resolvePictureSeason(
                requestedSeasonId,
                config.seasonId
            )

            const rows = await db
                .select({
                    divisionId: divisions.id,
                    divisionName: divisions.name,
                    teamId: teams.id,
                    teamName: teams.name,
                    teamNumber: teams.number,
                    pictureUrl: teams.picture_url
                })
                .from(teams)
                .innerJoin(divisions, eq(teams.division, divisions.id))
                .where(eq(teams.season, seasonId))
                .orderBy(asc(divisions.level), asc(teams.number))

            // Group flat rows into one entry per division, preserving order.
            const groups: DivisionTeamGroup[] = []
            const groupByDivision = new Map<number, DivisionTeamGroup>()
            for (const row of rows) {
                let group = groupByDivision.get(row.divisionId)
                if (!group) {
                    group = {
                        divisionId: row.divisionId,
                        divisionName: row.divisionName,
                        teams: []
                    }
                    groupByDivision.set(row.divisionId, group)
                    groups.push(group)
                }
                group.teams.push({
                    teamId: row.teamId,
                    teamName: row.teamName,
                    teamNumber: row.teamNumber,
                    pictureUrl: row.pictureUrl
                })
            }

            return ok(groups)
        } catch (error) {
            if (error instanceof ActionError) {
                return fail(error.message)
            }
            logger.error(
                "Error loading teams for picture page",
                undefined,
                error
            )
            return fail("Failed to load teams.")
        }
    }
)

export interface TeamPhotoUploadStart {
    uploadUrl: string
    objectKey: string
}

export const createTeamPhotoUpload = withAction(
    async (
        teamId: number,
        contentLength: number,
        requestedSeasonId?: number
    ): Promise<ActionResult<TeamPhotoUploadStart>> => {
        try {
            const config = await requireSeasonConfig()
            await requirePermission("pictures:manage", {
                seasonId: config.seasonId
            })
            const seasonId = await resolvePictureSeason(
                requestedSeasonId,
                config.seasonId
            )

            const validTeamId = requirePositiveInt(teamId, "team")

            if (
                !Number.isInteger(contentLength) ||
                contentLength <= 0 ||
                contentLength > PLAYER_PICTURE_MAX_BYTES
            ) {
                return fail(
                    `Upload must be between 1 byte and ${PLAYER_PICTURE_MAX_BYTES} bytes.`
                )
            }

            if (
                !(await canManageTeamPhoto(
                    validTeamId,
                    seasonId,
                    config.seasonId
                ))
            ) {
                return fail("Team not found for this season.")
            }

            const objectKey = teamPhotoObjectKey(seasonId, validTeamId)
            const uploadUrl = await createPlayerPictureUploadPresignedUrl({
                key: objectKey,
                contentType: "image/jpeg",
                contentLength
            })
            return ok({ uploadUrl, objectKey })
        } catch (error) {
            if (error instanceof ActionError) {
                return fail(error.message)
            }
            logger.error(
                "Error creating team photo upload URL",
                undefined,
                error
            )
            return fail("Failed to start upload.")
        }
    }
)

export const finalizeTeamPhotoUpload = withAction(
    async (
        teamId: number,
        objectKey: string,
        requestedSeasonId?: number
    ): Promise<ActionResult<{ pictureUrl: string }>> => {
        try {
            const config = await requireSeasonConfig()
            await requirePermission("pictures:manage", {
                seasonId: config.seasonId
            })
            const seasonId = await resolvePictureSeason(
                requestedSeasonId,
                config.seasonId
            )

            const validTeamId = requirePositiveInt(teamId, "team")

            // Never trust the client-supplied key — recompute and compare.
            const expectedKey = teamPhotoObjectKey(seasonId, validTeamId)
            if (objectKey !== expectedKey) {
                return fail("Invalid upload reference.")
            }

            if (
                !(await canManageTeamPhoto(
                    validTeamId,
                    seasonId,
                    config.seasonId
                ))
            ) {
                return fail("Team not found for this season.")
            }

            await db
                .update(teams)
                .set({ picture_url: expectedKey })
                .where(eq(teams.id, validTeamId))

            const sessionUserId = await getSessionUserId()
            if (sessionUserId) {
                await logAuditEntry({
                    userId: sessionUserId,
                    action: "update",
                    entityType: "teams",
                    entityId: String(validTeamId),
                    summary: `Uploaded team photo for team ${validTeamId}`
                })
            }

            revalidatePath("/dashboard/add-team-pictures")
            revalidateCalendarFeeds()
            return ok({ pictureUrl: expectedKey }, "Team photo uploaded.")
        } catch (error) {
            if (error instanceof ActionError) {
                return fail(error.message)
            }
            logger.error("Error finalizing team photo upload", undefined, error)
            return fail("Failed to save team photo.")
        }
    }
)
