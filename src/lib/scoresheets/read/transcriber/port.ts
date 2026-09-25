/**
 * port.ts — the one place a model touches this pipeline.
 *
 * Everything else in the reader is deterministic. Narrowing the model's job to
 * a single interface, with a schema its answer must satisfy, keeps that true:
 * a malformed or mis-indexed reply is rejected at the boundary rather than
 * flowing into a scoreline.
 */

import { z } from "zod"

import type { ScoreCrop } from "../crops"

export interface ScoreReading {
    /** Must match the crop's id exactly. */
    id: string
    /** Null when the transcriber believes the boxes are empty after all. */
    value: number | null
    confidence: number
    /** Other readings it considered plausible, best first. */
    alternatives: { value: number; confidence: number }[]
}

export interface Transcriber {
    /** Name recorded against the read, so accuracy can be compared later. */
    readonly name: string
    transcribe(
        crops: readonly ScoreCrop[],
        signal?: AbortSignal
    ): Promise<ScoreReading[]>
}

export const ReadingSchema = z.object({
    id: z.string().min(1),
    // Two digit boxes cannot express more than 99.
    value: z.number().int().min(0).max(99).nullable(),
    confidence: z.number().min(0).max(1),
    alternatives: z
        .array(
            z.object({
                value: z.number().int().min(0).max(99),
                confidence: z.number().min(0).max(1)
            })
        )
        .max(4)
        .optional()
        .default([])
})

export const ResponseSchema = z.object({
    readings: z.array(ReadingSchema)
})

export class TranscriberError extends Error {}

export interface ValidateOptions {
    /**
     * Accept a reply that leaves some boxes unanswered.
     *
     * Off within a single request, where every box must come back: a reply
     * that has dropped one has probably drifted, and a drifted reply attaches
     * one game's score to another. On when checking a whole sheet that was
     * assembled from several requests, where a missing box means one request
     * failed and those boxes are simply unread. Refusing the sheet for that
     * would throw away every box that did come back.
     */
    allowMissing?: boolean
}

/**
 * Check a reply against the crops it was supposed to answer.
 *
 * Every crop must be answered exactly once and nothing else may appear. A
 * reply that has drifted — a row misread, an id invented — fails here rather
 * than quietly attaching one game's score to another.
 */
export function validateReadings(
    crops: readonly ScoreCrop[],
    readings: readonly ScoreReading[],
    opts: ValidateOptions = {}
): ScoreReading[] {
    const expected = new Map(crops.map((c) => [c.id, c]))
    const seen = new Set<string>()

    for (const reading of readings) {
        if (!expected.has(reading.id)) {
            throw new TranscriberError(
                `Reply mentions an unknown box: ${reading.id}`
            )
        }
        if (seen.has(reading.id)) {
            throw new TranscriberError(`Reply answers ${reading.id} twice`)
        }
        seen.add(reading.id)
    }

    if (!opts.allowMissing && seen.size !== expected.size) {
        const missing = [...expected.keys()].filter((id) => !seen.has(id))
        throw new TranscriberError(
            `Reply is missing ${missing.length} box(es): ${missing.slice(0, 3).join(", ")}`
        )
    }

    // Values outside what the game could legally end on are demoted rather
    // than trusted: reconciliation may still find them useful as runners-up.
    return readings.map((reading) => {
        const crop = expected.get(reading.id) as ScoreCrop
        const legal = new Set(crop.legalValues)
        const illegal = reading.value !== null && !legal.has(reading.value)
        return {
            ...reading,
            value: illegal ? null : reading.value,
            alternatives: [
                ...(illegal && reading.value !== null
                    ? [
                          {
                              value: reading.value,
                              confidence: reading.confidence * 0.5
                          }
                      ]
                    : []),
                ...reading.alternatives
            ]
        }
    })
}
