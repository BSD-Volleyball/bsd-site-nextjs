"use server"

import { randomUUID } from "node:crypto"
import { and, desc, eq, inArray } from "drizzle-orm"

import { db } from "@/database/db"
import { scoreSheetReads, scoreSheets } from "@/database/schema"
import { logAuditEntry } from "@/lib/audit-log"
import {
    PLAYER_PICTURE_MAX_BYTES,
    createPlayerPictureUploadPresignedUrl,
    getR2Object
} from "@/lib/r2"
import type { SheetRead } from "@/lib/scoresheets/read/read"
import {
    getScoreSheetRead,
    processScoreSheet,
    type StoredReadStatus
} from "@/lib/scoresheets/read/pipeline"
import {
    type ActionResult,
    ActionError,
    fail,
    ok,
    requirePermission,
    requireSeasonConfig,
    withAction
} from "@/next/action-helpers"
import { getSessionUserId } from "@/next/session"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Same gate as the score-entry page this feeds: anyone trusted to type the
 * scores in is trusted to photograph them. Written out at the top of every
 * action rather than hidden in a helper, so the authorization checker can see
 * it and so nobody has to follow a call to know a route is guarded.
 */

function requireDate(date: string): string {
    if (!DATE_RE.test(date)) throw new ActionError("Invalid date.")
    return date
}

export interface SheetInboxRow {
    scoreSheetId: number
    imagePath: string
    court: number | null
    status: StoredReadStatus
    tag: string | null
    problems: string[]
    attempts: number
    uploadedAt: string
}

export const getSheetInbox = withAction(
    async (date: string): Promise<ActionResult<SheetInboxRow[]>> => {
        const config = await requireSeasonConfig()
        await requirePermission("scores:enter", {
            seasonId: config.seasonId
        })
        const seasonId = config.seasonId
        const day = requireDate(date)

        const rows = await db
            .select({
                id: scoreSheets.id,
                imagePath: scoreSheets.image_path,
                court: scoreSheets.court,
                uploadedAt: scoreSheets.uploaded_at
            })
            .from(scoreSheets)
            .where(
                and(
                    eq(scoreSheets.season_id, seasonId),
                    eq(scoreSheets.match_date, day)
                )
            )
            .orderBy(desc(scoreSheets.uploaded_at))

        if (rows.length === 0) return ok([])

        const reads = await db
            .select()
            .from(scoreSheetReads)
            .where(
                inArray(
                    scoreSheetReads.score_sheet_id,
                    rows.map((r) => r.id)
                )
            )
        const readBySheet = new Map(reads.map((r) => [r.score_sheet_id, r]))

        return ok(
            rows.map((row) => {
                const read = readBySheet.get(row.id)
                return {
                    scoreSheetId: row.id,
                    imagePath: row.imagePath,
                    court: row.court,
                    status: (read?.status ?? "pending") as StoredReadStatus,
                    tag: read?.tag ?? null,
                    problems: read?.problems ?? [],
                    attempts: read?.attempts ?? 0,
                    uploadedAt: row.uploadedAt.toISOString()
                }
            })
        )
    }
)

export interface SheetUploadTicket {
    uploadUrl: string
    objectKey: string
}

/**
 * A bulk upload is not filed under a division: the sheet's own code says which
 * court it is, and reading it is what files it.
 */
export const createSheetUpload = withAction(
    async (input: {
        date: string
        contentLength: number
    }): Promise<ActionResult<SheetUploadTicket>> => {
        const config = await requireSeasonConfig()
        await requirePermission("scores:enter", {
            seasonId: config.seasonId
        })
        const seasonId = config.seasonId
        const day = requireDate(input.date)

        if (
            !Number.isInteger(input.contentLength) ||
            input.contentLength <= 0 ||
            input.contentLength > PLAYER_PICTURE_MAX_BYTES
        ) {
            throw new ActionError("That photo is too large.")
        }

        const objectKey = `scoresheets/${seasonId}/${day}/sheet_${randomUUID()}.jpg`
        const uploadUrl = await createPlayerPictureUploadPresignedUrl({
            key: objectKey,
            contentType: "image/jpeg",
            contentLength: input.contentLength
        })
        return ok({ uploadUrl, objectKey })
    }
)

export const finalizeSheetUpload = withAction(
    async (input: {
        date: string
        objectKey: string
    }): Promise<ActionResult<{ scoreSheetId: number }>> => {
        const config = await requireSeasonConfig()
        await requirePermission("scores:enter", {
            seasonId: config.seasonId
        })
        const seasonId = config.seasonId
        const day = requireDate(input.date)
        const userId = await getSessionUserId()
        if (!userId) throw new ActionError("Unauthorized.")

        const expectedPrefix = `scoresheets/${seasonId}/${day}/`
        if (!input.objectKey.startsWith(expectedPrefix)) {
            throw new ActionError("That upload does not belong to this night.")
        }

        // Confirm the bytes actually arrived, rather than trusting the client
        // to tell us about an object we never see again.
        const stored = await getR2Object(input.objectKey)
        if (!stored) throw new ActionError("The upload did not complete.")

        const [row] = await db
            .insert(scoreSheets)
            .values({
                season_id: seasonId,
                division_id: null,
                court: null,
                match_date: day,
                image_path: input.objectKey,
                uploaded_by: userId
            })
            .returning()

        await db.insert(scoreSheetReads).values({
            score_sheet_id: row.id,
            status: "pending"
        })

        await logAuditEntry({
            userId,
            action: "create",
            entityType: "score_sheets",
            entityId: String(row.id),
            summary: `Uploaded a score sheet photo for ${day}`
        })

        return ok({ scoreSheetId: row.id })
    }
)

export interface ReadSummary {
    status: StoredReadStatus
    court: number | null
    tag: string | null
    problems: string[]
    matchCount: number
}

export const readUploadedSheet = withAction(
    async (input: {
        scoreSheetId: number
        court?: number | null
    }): Promise<ActionResult<ReadSummary>> => {
        const config = await requireSeasonConfig()
        await requirePermission("scores:enter", {
            seasonId: config.seasonId
        })
        const seasonId = config.seasonId
        if (!Number.isInteger(input.scoreSheetId) || input.scoreSheetId <= 0) {
            throw new ActionError("Invalid upload.")
        }

        const [sheet] = await db
            .select({ id: scoreSheets.id, seasonId: scoreSheets.season_id })
            .from(scoreSheets)
            .where(eq(scoreSheets.id, input.scoreSheetId))
            .limit(1)
        if (!sheet || sheet.seasonId !== seasonId) {
            throw new ActionError("No such upload.")
        }

        const result = await processScoreSheet({
            scoreSheetId: input.scoreSheetId,
            seasonId,
            courtHint: input.court ?? null
        })

        const [stored] = await db
            .select({ court: scoreSheets.court })
            .from(scoreSheets)
            .where(eq(scoreSheets.id, input.scoreSheetId))
            .limit(1)

        return ok({
            status: result.status,
            court: stored?.court ?? null,
            tag: result.read?.tag ?? null,
            problems: result.problems,
            matchCount: result.read?.matches.length ?? 0
        })
    }
)

/** The stored read, for pre-filling the score-entry form. */
export const getSheetReads = withAction(
    async (
        date: string
    ): Promise<
        ActionResult<
            { scoreSheetId: number; court: number | null; read: SheetRead }[]
        >
    > => {
        const config = await requireSeasonConfig()
        await requirePermission("scores:enter", {
            seasonId: config.seasonId
        })
        const seasonId = config.seasonId
        const day = requireDate(date)

        const rows = await db
            .select({
                scoreSheetId: scoreSheets.id,
                court: scoreSheets.court,
                result: scoreSheetReads.result,
                status: scoreSheetReads.status
            })
            .from(scoreSheets)
            .innerJoin(
                scoreSheetReads,
                eq(scoreSheetReads.score_sheet_id, scoreSheets.id)
            )
            .where(
                and(
                    eq(scoreSheets.season_id, seasonId),
                    eq(scoreSheets.match_date, day)
                )
            )

        return ok(
            rows
                .filter((r) => r.result !== null)
                .map((r) => ({
                    scoreSheetId: r.scoreSheetId,
                    court: r.court,
                    read: r.result as SheetRead
                }))
        )
    }
)

export const deleteUploadedSheet = withAction(
    async (scoreSheetId: number): Promise<ActionResult<void>> => {
        const config = await requireSeasonConfig()
        await requirePermission("scores:enter", {
            seasonId: config.seasonId
        })
        const seasonId = config.seasonId
        const userId = await getSessionUserId()
        if (!userId) throw new ActionError("Unauthorized.")

        const [row] = await db
            .select()
            .from(scoreSheets)
            .where(eq(scoreSheets.id, scoreSheetId))
            .limit(1)
        if (!row || row.season_id !== seasonId) {
            return fail("No such upload.")
        }

        await db.delete(scoreSheets).where(eq(scoreSheets.id, scoreSheetId))
        await logAuditEntry({
            userId,
            action: "delete",
            entityType: "score_sheets",
            entityId: String(scoreSheetId),
            summary: `Deleted score sheet photo for ${row.match_date}`
        })
        return ok(undefined, "Photo removed.")
    }
)

/** Read a stored result without re-processing, for the review screen. */
export const peekSheetRead = withAction(
    async (scoreSheetId: number): Promise<ActionResult<SheetRead | null>> => {
        const config = await requireSeasonConfig()
        await requirePermission("scores:enter", {
            seasonId: config.seasonId
        })
        const row = await getScoreSheetRead(scoreSheetId)
        return ok((row?.result as SheetRead | null) ?? null)
    }
)
