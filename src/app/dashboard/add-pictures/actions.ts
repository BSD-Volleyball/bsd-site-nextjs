"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { and, eq, isNull, or } from "drizzle-orm"
import { db } from "@/database/db"
import { signups, users } from "@/database/schema"
import { getSeasonConfig } from "@/lib/site-config"
import { isCommissionerBySession } from "@/lib/rbac"
import { createPlayerPictureUploadPresignedUrl } from "@/lib/r2"
import {
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

async function checkAddPicturesAccess(): Promise<boolean> {
    return isCommissionerBySession()
}

function getSeasonLabel(seasonName: string, seasonYear: number): string {
    return `${seasonName.charAt(0).toUpperCase() + seasonName.slice(1)} ${seasonYear}`
}

export async function getPlayersNeedingPictures(): Promise<{
    status: boolean
    message?: string
    seasonLabel?: string
    players: MissingPicturePlayer[]
}> {
    const hasAccess = await checkAddPicturesAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            players: []
        }
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return {
                status: false,
                message: "No current season found.",
                players: []
            }
        }

        const seasonLabel = getSeasonLabel(config.seasonName, config.seasonYear)

        const rows = await db
            .select({
                signupId: signups.id,
                userId: users.id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preffered_name,
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

        return {
            status: true,
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
        }
    } catch (error) {
        console.error("Error fetching players needing pictures:", error)
        return {
            status: false,
            message: "Failed to load players.",
            players: []
        }
    }
}

export async function createMissingPictureUpload(userId: string): Promise<{
    status: boolean
    message?: string
    uploadUrl?: string
    pictureFilename?: string
}> {
    const hasAccess = await checkAddPicturesAccess()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return { status: false, message: "No current season found." }
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
            return {
                status: false,
                message: "Player is not signed up for the current season."
            }
        }

        if (row.picture?.trim()) {
            return {
                status: false,
                message: "Player already has a picture."
            }
        }

        const pictureFilename = getExpectedPlayerPictureFilename({
            old_id: row.oldId,
            first_name: row.firstName,
            last_name: row.lastName
        })

        if (!pictureFilename) {
            if (!row.oldId || row.oldId <= 0) {
                return {
                    status: false,
                    message:
                        "Player must have a valid old_id before uploading a picture."
                }
            }
            return {
                status: false,
                message:
                    "Player must have first and last name initials before uploading a picture."
            }
        }

        const uploadUrl = await createPlayerPictureUploadPresignedUrl({
            key: getPlayerPictureObjectKey(pictureFilename),
            contentType: "image/jpeg"
        })

        return {
            status: true,
            uploadUrl,
            pictureFilename
        }
    } catch (error) {
        console.error("Error creating missing picture upload URL:", error)
        return {
            status: false,
            message: "Failed to start picture upload."
        }
    }
}

export async function finalizeMissingPictureUpload(
    userId: string,
    pictureFilename: string
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await checkAddPicturesAccess()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return { status: false, message: "No current season found." }
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
            return {
                status: false,
                message: "Player is not signed up for the current season."
            }
        }

        const expectedFilename = getExpectedPlayerPictureFilename({
            old_id: row.oldId,
            first_name: row.firstName,
            last_name: row.lastName
        })

        if (!expectedFilename) {
            return {
                status: false,
                message:
                    "Player must have old_id and valid name initials before finalizing picture upload."
            }
        }

        if (pictureFilename !== expectedFilename) {
            return {
                status: false,
                message: "Uploaded filename does not match the expected format."
            }
        }

        if (row.picture?.trim()) {
            if (row.picture === pictureFilename) {
                return { status: true, message: "Picture already uploaded." }
            }
            return {
                status: false,
                message: "Player already has a picture."
            }
        }

        await db
            .update(users)
            .set({
                picture: pictureFilename,
                updatedAt: new Date()
            })
            .where(eq(users.id, userId))

        const session = await auth.api.getSession({ headers: await headers() })
        if (session) {
            await logAuditEntry({
                userId: session.user.id,
                action: "update",
                entityType: "users",
                entityId: userId,
                summary: `Uploaded player picture via Add Pictures for ${row.firstName} ${row.lastName} (${userId}) as ${getPlayerPictureObjectKey(
                    pictureFilename
                )}`
            })
        }

        return { status: true, message: "Player picture uploaded." }
    } catch (error) {
        console.error("Error finalizing missing picture upload:", error)
        return { status: false, message: "Failed to finalize picture upload." }
    }
}
