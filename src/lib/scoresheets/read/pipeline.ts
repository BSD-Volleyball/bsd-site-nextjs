/**
 * pipeline.ts — the impure half of reading a sheet.
 *
 * Everything else under `read/` is pure and takes its inputs as arguments.
 * This module is where storage, the database and the clock come in: fetch the
 * photo, find the layout it was printed with, run the read, record what came
 * back. Keeping the boundary here is what lets the difficult parts be tested
 * with known answers and no I/O at all.
 */

import { eq } from "drizzle-orm"

import { db } from "@/database/db"
import { scoreSheetReads, scoreSheets } from "@/database/schema"
import { logger } from "@/lib/logger"
import { getR2Object } from "@/lib/r2"

import { findScoreSheetPrint, type ScoreSheetPrint } from "../prints"
import { loadScoreSheetNight } from "../load"
import type { SheetEventType } from "../types"
import { decodeJpeg } from "./image"
import { readSheetTagFromPhoto } from "./identity"
import { readSheet, type SheetRead } from "./read"
import { storeScoreSamples } from "./samples"
import type { Transcriber } from "./transcriber/port"
import { nullTranscriber } from "./transcriber/stub"
import { transcriberFromEnv } from "./transcriber/vision"

/** Statuses a row can hold; only a human produces `confirmed`. */
export type StoredReadStatus =
    | "pending"
    | "processing"
    | "read"
    | "needs_review"
    | "unidentified"
    | "not_located"
    | "failed"
    | "confirmed"

/** Give up rather than charge for a fourth attempt at a hopeless photo. */
const MAX_ATTEMPTS = 3

export interface ProcessOptions {
    scoreSheetId: number
    seasonId: number
    /**
     * Defaults to whatever is configured, or to the null reader when nothing
     * is, which still yields the ticks and the sheet's identity.
     */
    transcriber?: Transcriber
    /** Court supplied by an admin when the tag could not be read. */
    courtHint?: number | null
}

export interface ProcessResult {
    status: StoredReadStatus
    read: SheetRead | null
    problems: string[]
}

async function readImageBytes(key: string): Promise<Uint8Array | null> {
    const object = await getR2Object(key)
    if (!object) return null

    const reader = object.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        total += value.length
    }

    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
    }
    return bytes
}

/**
 * Work out which sheet a photo is and what it was printed with.
 *
 * The tag is the direct route. Without it we fall back to the night's current
 * schedule for the court the admin named, which is right almost always and
 * flagged when it is not: a sheet printed before a schedule change has a
 * different number of blocks, and the reader notices.
 */
async function resolveLayout(
    seasonId: number,
    matchDate: string,
    photo: Uint8Array,
    courtHint: number | null
): Promise<{
    matchIds: number[]
    eventType: SheetEventType
    print: ScoreSheetPrint | null
    reconstructed: boolean
} | null> {
    const fromPhoto = readSheetTagFromPhoto(decodeJpeg(photo))
    if (fromPhoto) {
        const print = await findScoreSheetPrint(fromPhoto.text)
        if (print) {
            return {
                matchIds: print.matchIds,
                eventType: print.eventType,
                print,
                reconstructed: false
            }
        }
    }

    const court = fromPhoto?.parts.court ?? courtHint
    if (court === null || court === undefined) return null

    const night = await loadScoreSheetNight(seasonId, matchDate)
    const sheet = night?.courts.find((c) => c.court === court)
    if (!night || !sheet) return null

    return {
        matchIds: sheet.matches.map((m) => m.matchId),
        eventType: night.eventType,
        print: null,
        reconstructed: true
    }
}

export async function processScoreSheet(
    opts: ProcessOptions
): Promise<ProcessResult> {
    const [sheet] = await db
        .select()
        .from(scoreSheets)
        .where(eq(scoreSheets.id, opts.scoreSheetId))
        .limit(1)
    if (!sheet) {
        return { status: "failed", read: null, problems: ["No such upload."] }
    }

    const [existing] = await db
        .select()
        .from(scoreSheetReads)
        .where(eq(scoreSheetReads.score_sheet_id, opts.scoreSheetId))
        .limit(1)

    if (existing && existing.attempts >= MAX_ATTEMPTS) {
        return {
            status: existing.status as StoredReadStatus,
            read: null,
            problems: [
                "This photo has already been tried several times. Retake it or enter the scores by hand."
            ]
        }
    }

    const attempts = (existing?.attempts ?? 0) + 1
    await upsertRead(opts.scoreSheetId, {
        status: "processing",
        attempts,
        started_at: new Date(),
        error: null
    })

    try {
        const bytes = await readImageBytes(sheet.image_path)
        if (!bytes) throw new Error("The uploaded photo is no longer stored.")

        const layout = await resolveLayout(
            opts.seasonId,
            sheet.match_date,
            bytes,
            opts.courtHint ?? sheet.court
        )
        if (!layout) {
            return await finish(opts.scoreSheetId, attempts, {
                status: "unidentified",
                problems: [
                    "This sheet's code could not be read. Choose which court it is and try again."
                ]
            })
        }

        const result = await readSheet({
            image: decodeJpeg(bytes),
            matchIds: layout.matchIds,
            eventType: layout.eventType,
            transcriber:
                opts.transcriber ?? transcriberFromEnv() ?? nullTranscriber
        })

        const problems = [...result.problems]
        if (layout.reconstructed) {
            problems.push(
                "No record of this sheet being printed, so the layout came from tonight's current schedule."
            )
        }
        if (
            layout.print &&
            layout.print.matchIds.length !== layout.matchIds.length
        ) {
            problems.push(
                "The sheet was printed with a different set of matches than are scheduled now."
            )
        }

        const status: StoredReadStatus =
            result.status === "read" && problems.length === 0
                ? "read"
                : result.status === "not_located"
                  ? "not_located"
                  : result.status === "unidentified"
                    ? "unidentified"
                    : "needs_review"

        // Record the court the tag gave us, so the inbox can file the photo.
        if (result.identity?.court != null) {
            await db
                .update(scoreSheets)
                .set({ court: result.identity.court })
                .where(eq(scoreSheets.id, opts.scoreSheetId))
        }

        const stored = await upsertRead(opts.scoreSheetId, {
            status,
            attempts,
            tag: result.tag,
            template_version: result.identity?.templateVersion ?? null,
            result: { ...result, problems },
            problems,
            transcriber: result.transcriber,
            residual_pt: result.locate
                ? String(result.locate.residualPt)
                : null,
            finished_at: new Date(),
            error: null
        })

        // Keep the crops alongside what the reader thought they said. The
        // confirmed answer arrives later, when the night is saved.
        if (stored && result.crops.length > 0) {
            await storeScoreSamples(
                stored,
                { ...result, problems },
                result.crops
            )
        }

        return { status, read: { ...result, problems }, problems }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error("[scoresheets] Read failed", {
            scoreSheetId: opts.scoreSheetId,
            error: message
        })
        return await finish(opts.scoreSheetId, attempts, {
            status: "failed",
            problems: [message]
        })
    }
}

async function finish(
    scoreSheetId: number,
    attempts: number,
    outcome: { status: StoredReadStatus; problems: string[] }
): Promise<ProcessResult> {
    await upsertRead(scoreSheetId, {
        status: outcome.status,
        attempts,
        problems: outcome.problems,
        error: outcome.problems[0] ?? null,
        finished_at: new Date()
    })
    return { status: outcome.status, read: null, problems: outcome.problems }
}

type ReadUpdate = Partial<typeof scoreSheetReads.$inferInsert>

/** Returns the read row's id, which the sample corpus is keyed on. */
async function upsertRead(
    scoreSheetId: number,
    values: ReadUpdate
): Promise<number | null> {
    const [row] = await db
        .insert(scoreSheetReads)
        .values({
            score_sheet_id: scoreSheetId,
            status: "pending",
            ...values
        })
        .onConflictDoUpdate({
            target: scoreSheetReads.score_sheet_id,
            set: values
        })
        .returning({ id: scoreSheetReads.id })
    return row?.id ?? null
}

/** The stored read for an upload, for the review UI. */
export async function getScoreSheetRead(scoreSheetId: number) {
    const [row] = await db
        .select()
        .from(scoreSheetReads)
        .where(eq(scoreSheetReads.score_sheet_id, scoreSheetId))
        .limit(1)
    return row ?? null
}
