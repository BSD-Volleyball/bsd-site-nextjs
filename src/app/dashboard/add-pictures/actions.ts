"use server"

import { revalidatePath } from "next/cache"
import { and, eq, isNull, or } from "drizzle-orm"
import { db } from "@/database/db"
import { signups, users } from "@/database/schema"
import {
    type ActionResult,
    fail,
    ok,
    requirePermission,
    requireSeasonConfig,
    requireSession,
    withAction
} from "@/lib/action-helpers"
import {
    createPlayerPictureUploadPresignedUrl,
    PLAYER_PICTURE_MAX_BYTES
} from "@/lib/r2"
import {
    getPlayerPictureDbPath,
    getExpectedPlayerPictureFilename,
    getPlayerPictureObjectKey
} from "@/lib/player-picture"
import { logAuditEntry } from "@/lib/audit-log"

export interface MissingPicturePlayer {
    userId: string
    signupId: number
    displayName: string
    firstName: string
    lastName: string
    preferredName: string | null
    oldId: number | null
}

function getSeasonLabel(seasonName: string, seasonYear: number): string {
    return `${seasonName.charAt(0).toUpperCase() + seasonName.slice(1)} ${seasonYear}`
}

export const getPlayersNeedingPictures = withAction(
    async (): Promise<
        ActionResult<{
            seasonLabel: string
            players: MissingPicturePlayer[]
        }>
    > => {
        const config = await requireSeasonConfig()
        await requirePermission("pictures:manage", {
            seasonId: config.seasonId
        })

        const seasonLabel = getSeasonLabel(config.seasonName, config.seasonYear)

        const rows = await db
            .select({
                signupId: signups.id,
                userId: users.id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                oldId: users.old_id
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(
                and(
                    eq(signups.season, config.seasonId),
                    or(isNull(users.picture), eq(users.picture, ""))
                )
            )
            .orderBy(users.last_name, users.first_name)

        return ok({
            seasonLabel,
            players: rows.map((row) => ({
                signupId: row.signupId,
                userId: row.userId,
                firstName: row.firstName,
                lastName: row.lastName,
                preferredName: row.preferredName,
                displayName: row.preferredName
                    ? `${row.preferredName} ${row.lastName}`
                    : `${row.firstName} ${row.lastName}`,
                oldId: row.oldId
            }))
        })
    }
)

export const createMissingPictureUpload = withAction(
    async (
        userId: string,
        contentLength: number
    ): Promise<
        ActionResult<{
            uploadUrl: string
            pictureFilename: string
        }>
    > => {
        const config = await requireSeasonConfig()
        await requirePermission("pictures:manage", {
            seasonId: config.seasonId
        })

        if (
            !Number.isInteger(contentLength) ||
            contentLength <= 0 ||
            contentLength > PLAYER_PICTURE_MAX_BYTES
        ) {
            return fail(
                `Picture must be between 1 byte and ${PLAYER_PICTURE_MAX_BYTES} bytes.`
            )
        }

        const [row] = await db
            .select({
                userId: users.id,
                firstName: users.first_name,
                lastName: users.last_name,
                oldId: users.old_id,
                picture: users.picture
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(
                and(
                    eq(signups.season, config.seasonId),
                    eq(signups.player, userId)
                )
            )
            .limit(1)

        if (!row) {
            return fail("Player is not signed up for the current season.")
        }

        if (row.picture?.trim()) {
            return fail("Player already has a picture.")
        }

        const pictureFilename = getExpectedPlayerPictureFilename({
            old_id: row.oldId,
            first_name: row.firstName,
            last_name: row.lastName
        })

        if (!pictureFilename) {
            if (!row.oldId || row.oldId <= 0) {
                return fail(
                    "Player must have a valid old_id before uploading a picture."
                )
            }
            return fail(
                "Player must have first and last name initials before uploading a picture."
            )
        }

        const uploadUrl = await createPlayerPictureUploadPresignedUrl({
            key: getPlayerPictureObjectKey(pictureFilename),
            contentType: "image/jpeg",
            contentLength
        })

        return ok({ uploadUrl, pictureFilename })
    }
)

export const finalizeMissingPictureUpload = withAction(
    async (
        userId: string,
        pictureFilename: string
    ): Promise<ActionResult<{ picturePath: string }>> => {
        const session = await requireSession()
        const config = await requireSeasonConfig()
        await requirePermission("pictures:manage", {
            seasonId: config.seasonId
        })

        const [row] = await db
            .select({
                userId: users.id,
                firstName: users.first_name,
                lastName: users.last_name,
                oldId: users.old_id,
                picture: users.picture
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(
                and(
                    eq(signups.season, config.seasonId),
                    eq(signups.player, userId)
                )
            )
            .limit(1)

        if (!row) {
            return fail("Player is not signed up for the current season.")
        }

        const expectedFilename = getExpectedPlayerPictureFilename({
            old_id: row.oldId,
            first_name: row.firstName,
            last_name: row.lastName
        })

        if (!expectedFilename) {
            return fail(
                "Player must have old_id and valid name initials before finalizing picture upload."
            )
        }

        if (pictureFilename !== expectedFilename) {
            return fail("Uploaded filename does not match the expected format.")
        }

        const picturePath = getPlayerPictureDbPath(pictureFilename)

        if (row.picture?.trim()) {
            if (row.picture === picturePath) {
                return ok({ picturePath }, "Picture already uploaded.")
            }
            return fail("Player already has a picture.")
        }

        await db
            .update(users)
            .set({
                picture: picturePath,
                updatedAt: new Date()
            })
            .where(eq(users.id, userId))

        await logAuditEntry({
            userId: session.user.id,
            action: "update",
            entityType: "users",
            entityId: userId,
            summary: `Uploaded player picture via Add Pictures for ${row.firstName} ${row.lastName} (${userId}) as ${getPlayerPictureObjectKey(
                pictureFilename
            )}`
        })

        revalidatePath("/dashboard/add-pictures")
        return ok({ picturePath }, "Player picture uploaded.")
    }
)
