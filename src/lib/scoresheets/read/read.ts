/**
 * read.ts — the whole read, in one pure function.
 *
 * Takes a photograph, the matches the sheet was printed with, and the readers
 * to ask, and returns what can be made out. No database and no storage: the
 * readers arrive as arguments, so the logic here is tested with fakes and
 * known answers.
 *
 * Deliberately never produces a score it is not willing to defend. Each game
 * carries a level, and only `high` — both readers agreeing on a legal score —
 * means "offer this without comment".
 */

import type { SheetEventType } from "../types"
import { advancementProblems, type MatchBracket } from "./advancement"
import { combineReadings, type MatchVerdict } from "./combine"
import type { SheetTagParts } from "./identity"
import type { PageReader, PageReading } from "./page-reader"

type ReadStatus = "read" | "needs_review" | "failed"

export interface MatchRead extends MatchVerdict {
    matchId: number
    orderOnCourt: number
}

export interface SheetRead {
    status: ReadStatus
    /** What the sheet's QR code says it is, when it could be decoded. */
    tag: string | null
    identity: SheetTagParts | null
    matches: MatchRead[]
    /** Plain-language reasons this needs attention. */
    problems: string[]
    /** The models that were asked, for the record. */
    transcriber: string
    /**
     * Each model's own reading, kept whole so the readers' accuracy can be
     * measured later against what was saved. Absent on reads stored before
     * the whole-page reader.
     */
    readings?: PageReading[]
}

export interface SheetMatchInput {
    matchId: number
    /** As printed: the top row of the block. */
    home: string
    away: string
    /** Playoffs only, for checking who the referee wrote into each slot. */
    bracket?: MatchBracket
}

interface ReadInput {
    photo: Uint8Array
    /** The layout the sheet was printed with, in printed order. */
    matches: SheetMatchInput[]
    eventType: SheetEventType
    readers: readonly PageReader[]
    /** The sheet's QR tag, when it decoded. */
    identity: SheetTagParts | null
    tag: string | null
    /**
     * The code printed beside the small QR (e.g. "F26-W4-C3") for the court
     * this photo has been filed under. Each reader reports what it sees there,
     * and a difference means the photo was filed against the wrong court.
     */
    expectedSheetCode: string | null
    signal?: AbortSignal
}

/** "f26 - w4 - c3" and "F26-W4-C3" are the same code. */
export function normalizeSheetCode(code: string): string {
    return code.toUpperCase().replace(/\s+/g, "")
}

function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

export async function readSheet(input: ReadInput): Promise<SheetRead> {
    const base = {
        tag: input.tag,
        identity: input.identity,
        transcriber: input.readers.map((r) => r.name).join(" + ") || "none"
    }

    if (input.readers.length === 0) {
        return {
            ...base,
            status: "needs_review",
            matches: [],
            problems: [
                "Reading handwriting is not set up here, so type the scores in from the photo."
            ]
        }
    }

    const settled = await Promise.allSettled(
        input.readers.map((reader) =>
            reader.read({
                photo: input.photo,
                matches: input.matches,
                eventType: input.eventType,
                signal: input.signal
            })
        )
    )

    const readings: PageReading[] = []
    const problems: string[] = []
    settled.forEach((outcome, i) => {
        if (outcome.status === "fulfilled") readings.push(outcome.value)
        else {
            problems.push(
                `${input.readers[i].name} could not read this sheet: ${errorText(outcome.reason)}`
            )
        }
    })

    if (readings.length === 0) {
        return { ...base, status: "failed", matches: [], problems }
    }

    if (input.expectedSheetCode) {
        const expected = normalizeSheetCode(input.expectedSheetCode)
        for (const reading of readings) {
            if (
                reading.sheetCode &&
                normalizeSheetCode(reading.sheetCode) !== expected
            ) {
                problems.push(
                    `${reading.model} read the sheet's code as ${reading.sheetCode}, but this photo is filed as ${input.expectedSheetCode}. Check it is the right court.`
                )
            }
        }
    }

    const verdicts = combineReadings(
        input.eventType,
        input.matches.length,
        readings
    )
    const matches: MatchRead[] = verdicts.map((verdict, index) => ({
        ...verdict,
        matchId: input.matches[index].matchId,
        orderOnCourt: index + 1
    }))
    const advancement = advancementProblems(
        input.matches,
        matches.map((m) => m.winner),
        readings
    )
    for (const { matchIndex, problem } of advancement) {
        const match = matches[matchIndex]
        match.problems = [...match.problems, problem]
    }
    for (const match of matches) {
        for (const problem of match.problems) {
            problems.push(`Match ${match.orderOnCourt}: ${problem}`)
        }
    }

    return {
        ...base,
        status: problems.length > 0 ? "needs_review" : "read",
        matches,
        problems,
        readings
    }
}
