/**
 * pipeline.ts — the impure half of reading a sheet.
 *
 * Everything else under `read/` takes its inputs as arguments. This module is
 * where storage, the database and the clock come in: fetch the photo, find the
 * layout it was printed with and the teams on it, run the read, record what
 * came back. The readers are injectable, so the whole path is tested with
 * fakes and no network.
 */

import { and, eq, isNull, lt, ne, or, sql } from "drizzle-orm"

import { db } from "@/database/db"
import { scoreSheetReads, scoreSheets } from "@/database/schema"
import { logger } from "@/lib/logger"
import { getR2Object } from "@/lib/r2"

import { findScoreSheetPrint, type ScoreSheetPrint } from "../prints"
import { loadScoreSheetNight } from "../load"
import { sheetCode, sheetTag } from "../sheet-config"
import type { SheetEventType, SheetNight } from "../types"
import { decodeJpeg } from "./image"
import {
    type IdentityResult,
    parseSheetCode,
    readSheetTagFromPhoto
} from "./identity"
import { type PageReader, pageReadersFromEnv } from "./page-reader"
import { readSheet, type SheetMatchInput, type SheetRead } from "./read"
import { storeScoreSamples } from "./samples"

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

interface ProcessOptions {
    scoreSheetId: number
    seasonId: number
    /**
     * Defaults to whatever is configured, or to none when nothing is, which
     * still identifies the sheet from its QR code.
     */
    readers?: readonly PageReader[]
    /** Court supplied by an admin when the tag could not be read. */
    courtHint?: number | null
}

interface ProcessResult {
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

interface Layout {
    matches: SheetMatchInput[]
    eventType: SheetEventType
    court: number | null
    print: ScoreSheetPrint | null
    reconstructed: boolean
    tag: IdentityResult | null
    expectedSheetCode: string | null
}

type LayoutOutcome = { layout: Layout } | { problem: string }

/** The code printed beside the QR for a court, from whichever source knows the night. */
function expectedCode(
    night: Pick<SheetNight, "seasonCode" | "eventType" | "ordinal"> | null,
    tag: IdentityResult | null,
    court: number | null
): string | null {
    if (tag) {
        return sheetCode(
            {
                seasonCode: tag.parts.seasonCode,
                eventType:
                    tag.parts.phase === "P" ? "playoff" : "regular_season",
                ordinal: tag.parts.ordinal
            },
            court
        )
    }
    return night ? sheetCode(night, court) : null
}

/**
 * Work out which sheet a photo is, what it was printed with, and who played.
 *
 * Three ways to know the court, in order of trust: the QR tag (free, exact,
 * and it names the print record); the court an admin chose; and the code
 * printed beside the QR, read by a model, for a photo whose QR will not
 * decode. Without the court there are no team names to give the readers, so
 * a sheet none of these identify stops here and asks.
 */
async function resolveLayout(
    seasonId: number,
    matchDate: string,
    photo: Uint8Array,
    courtHint: number | null,
    readers: readonly PageReader[]
): Promise<LayoutOutcome> {
    const tag = readSheetTagFromPhoto(decodeJpeg(photo))
    const night = await loadScoreSheetNight(seasonId, matchDate)

    // A tag may legitimately say "no court" (the TBD sheet); only an
    // untagged photo needs the court from somewhere else.
    let court: number | null
    if (tag) {
        // The tag is trusted for the court and the print record, so it has
        // to be this night's: last week's sheet uploaded under tonight would
        // otherwise be read against last week's matches and filed here.
        const mismatch = tagNightMismatch(tag, matchDate, night)
        if (mismatch) return { problem: mismatch }
        court = tag.parts.court
    } else {
        const found =
            courtHint ?? (await courtFromPrintedCode(photo, readers, night))
        if (typeof found === "string") return { problem: found }
        if (found === null) {
            return {
                problem:
                    "This sheet's code could not be read. Choose which court it is and try again."
            }
        }
        court = found
    }

    // The print record says exactly which matches were on the paper. Found by
    // the tag the QR carried, or the one this court's sheet would have had.
    const printedTag = tag?.text ?? (night ? sheetTag(night, court) : null)
    const print = printedTag ? await findScoreSheetPrint(printedTag) : null
    const scheduled = night?.courts.find((c) => c.court === court)
    const matchIds =
        print?.matchIds ?? scheduled?.matches.map((m) => m.matchId) ?? []
    if (matchIds.length === 0) {
        return {
            problem: `No matches are scheduled on court ${court} that night.`
        }
    }

    // Names as the sheet printed them. A match since moved off this court is
    // still found by id on whichever court it went to.
    const byId = new Map(
        (night?.courts ?? [])
            .flatMap((c) => c.matches)
            .map((m) => [m.matchId, m])
    )
    const matches = matchIds.map((matchId) => {
        const match = byId.get(matchId)
        return {
            matchId,
            home: match?.home.name ?? "(unknown team)",
            away: match?.away.name ?? "(unknown team)"
        }
    })

    return {
        layout: {
            matches,
            eventType: print?.eventType ?? night?.eventType ?? "regular_season",
            court,
            print,
            reconstructed: !print,
            tag,
            expectedSheetCode: expectedCode(night, tag, court)
        }
    }
}

/** A problem to report when a decoded tag names some other night, else null. */
function tagNightMismatch(
    tag: IdentityResult,
    matchDate: string,
    night: SheetNight | null
): string | null {
    const parts = tag.parts
    const sameNight =
        parts.date === matchDate &&
        (!night ||
            (parts.seasonCode === night.seasonCode &&
                parts.phase === (night.eventType === "playoff" ? "P" : "W") &&
                parts.ordinal === night.ordinal))
    if (sameNight) return null
    return `This sheet's code says it is from ${parts.date}, not ${matchDate}. Check the photo was uploaded to the right date.`
}

/**
 * Ask the first reader for the printed code, and check it belongs to this
 * night. Returns the court, null when nothing legible came back, or a problem
 * to report when the code names some other night.
 */
async function courtFromPrintedCode(
    photo: Uint8Array,
    readers: readonly PageReader[],
    night: SheetNight | null
): Promise<number | null | string> {
    const [reader] = readers
    if (!reader || !night) return null

    let code: string | null
    try {
        code = await reader.readCode(photo)
    } catch (error) {
        logger.warn("[scoresheets] Could not read the printed sheet code", {
            error: error instanceof Error ? error.message : String(error)
        })
        return null
    }
    const parts = code ? parseSheetCode(code) : null
    if (!code || !parts) return null

    const phase = night.eventType === "playoff" ? "P" : "W"
    if (
        parts.seasonCode !== night.seasonCode ||
        parts.phase !== phase ||
        parts.ordinal !== night.ordinal
    ) {
        return `This sheet is marked ${code}, which is not from this night. Check the photo was uploaded to the right date.`
    }
    return parts.court
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

    const claimed = await claimAttempt(opts.scoreSheetId)
    if (claimed.kind === "busy") {
        return {
            status: "processing",
            read: null,
            problems: ["This photo is being read right now."]
        }
    }
    if (claimed.kind === "exhausted") {
        return {
            status: claimed.status,
            read: null,
            problems: [
                "This photo has already been tried several times. Retake it or enter the scores by hand."
            ]
        }
    }
    const { attempts } = claimed

    try {
        const bytes = await readImageBytes(sheet.image_path)
        if (!bytes) throw new Error("The uploaded photo is no longer stored.")

        const readers = opts.readers ?? pageReadersFromEnv()
        const outcome = await resolveLayout(
            opts.seasonId,
            sheet.match_date,
            bytes,
            opts.courtHint ?? sheet.court,
            readers
        )
        if ("problem" in outcome) {
            return await finish(opts.scoreSheetId, attempts, {
                status: "unidentified",
                problems: [outcome.problem]
            })
        }
        const { layout } = outcome

        // Filed as soon as the court is known, so the inbox can show it even
        // if the read itself goes on to fail.
        if (layout.court !== sheet.court) {
            await db
                .update(scoreSheets)
                .set({ court: layout.court })
                .where(eq(scoreSheets.id, opts.scoreSheetId))
        }

        const result = await readSheet({
            photo: bytes,
            matches: layout.matches,
            eventType: layout.eventType,
            readers,
            identity: layout.tag?.parts ?? null,
            tag: layout.tag?.text ?? null,
            expectedSheetCode: layout.expectedSheetCode
        })

        const problems = [...result.problems]
        if (layout.reconstructed) {
            problems.push(
                "No record of this sheet being printed, so the layout came from tonight's current schedule."
            )
        }

        const status: StoredReadStatus =
            result.status === "read" && problems.length === 0
                ? "read"
                : result.status === "failed"
                  ? "failed"
                  : "needs_review"

        const stored = await upsertRead(opts.scoreSheetId, {
            status,
            attempts,
            tag: result.tag,
            template_version: layout.tag?.parts.templateVersion ?? null,
            result: { ...result, problems },
            problems,
            transcriber: result.transcriber,
            residual_pt: null,
            finished_at: new Date(),
            error: status === "failed" ? (problems[0] ?? null) : null
        })

        // Keep what the readers concluded beside the photo. The confirmed
        // answer arrives later, when the night is saved.
        if (stored && result.matches.length > 0) {
            await storeScoreSamples(
                stored,
                { ...result, problems },
                sheet.image_path
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

/**
 * A read that is still marked processing after this long was a function that
 * died (maxDuration is 300s), not one that is still running.
 */
const STALE_PROCESSING = sql`interval '10 minutes'`

type Claim =
    | { kind: "claimed"; attempts: number }
    | { kind: "busy" }
    | { kind: "exhausted"; status: StoredReadStatus }

/**
 * Take the next attempt in one statement. Every attempt costs two model
 * calls, so the counter has to be read and advanced together: N requests
 * arriving at once must share the three attempts, not get three each.
 */
async function claimAttempt(scoreSheetId: number): Promise<Claim> {
    await db
        .insert(scoreSheetReads)
        .values({ score_sheet_id: scoreSheetId, status: "pending" })
        .onConflictDoNothing({ target: scoreSheetReads.score_sheet_id })

    const [row] = await db
        .update(scoreSheetReads)
        .set({
            status: "processing",
            attempts: sql`${scoreSheetReads.attempts} + 1`,
            started_at: new Date(),
            error: null
        })
        .where(
            and(
                eq(scoreSheetReads.score_sheet_id, scoreSheetId),
                lt(scoreSheetReads.attempts, MAX_ATTEMPTS),
                or(
                    ne(scoreSheetReads.status, "processing"),
                    isNull(scoreSheetReads.started_at),
                    lt(
                        scoreSheetReads.started_at,
                        sql`now() - ${STALE_PROCESSING}`
                    )
                )
            )
        )
        .returning({ attempts: scoreSheetReads.attempts })
    if (row) return { kind: "claimed", attempts: row.attempts }

    const [current] = await db
        .select({
            status: scoreSheetReads.status,
            attempts: scoreSheetReads.attempts
        })
        .from(scoreSheetReads)
        .where(eq(scoreSheetReads.score_sheet_id, scoreSheetId))
        .limit(1)
    if (current && current.attempts < MAX_ATTEMPTS) return { kind: "busy" }
    return {
        kind: "exhausted",
        status: (current?.status ?? "failed") as StoredReadStatus
    }
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
