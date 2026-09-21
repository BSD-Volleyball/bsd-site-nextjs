/**
 * stub.ts — transcribers for tests and for running without a model.
 *
 * `nullTranscriber` is not only a test double. When no model is configured the
 * pipeline uses it, so the rest of the read still happens: the sheet is
 * identified, the WIN ticks are counted, and the admin gets a partly
 * pre-filled form instead of nothing.
 */

import type { ScoreCrop } from "../crops"
import type { ScoreReading, Transcriber } from "./port"

/** Answers "I cannot read these", which every later stage handles. */
export const nullTranscriber: Transcriber = {
    name: "none",
    async transcribe(crops) {
        return crops.map((crop) => ({
            id: crop.id,
            value: null,
            confidence: 0,
            alternatives: []
        }))
    }
}

export interface StubOptions {
    /** Score per crop id. Anything missing is answered as unreadable. */
    truth: Map<string, number | null>
    confidence?: number
    /** Ids to answer wrongly, to prove the safety net catches it. */
    corrupt?: Map<string, number>
    fail?: boolean
}

/** A transcriber with known answers, so tests exercise everything but a model. */
export function stubTranscriber(opts: StubOptions): Transcriber {
    return {
        name: "stub",
        async transcribe(crops: readonly ScoreCrop[]): Promise<ScoreReading[]> {
            if (opts.fail) throw new Error("transcriber unavailable")
            return crops.map((crop) => {
                const corrupted = opts.corrupt?.get(crop.id)
                const value = corrupted ?? opts.truth.get(crop.id) ?? null
                return {
                    id: crop.id,
                    value,
                    confidence: value === null ? 0 : (opts.confidence ?? 0.95),
                    alternatives: []
                }
            })
        }
    }
}
