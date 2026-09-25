/**
 * vision.ts — the one implementation that asks a model to read handwriting.
 *
 * Speaks the OpenAI-compatible chat-completions shape and defaults to Vercel's
 * AI Gateway, which the app already deploys behind. That buys one credential
 * for every provider, per-request logs, and a spend cap, and it means changing
 * model is an environment variable rather than a deployment. Any other
 * OpenAI-compatible endpoint still works by setting the base URL.
 *
 * Model ids are Gateway slugs (`provider/model`) from
 * https://ai-gateway.vercel.sh/v1/models. Reading two digits out of a clean
 * crop is not a demanding vision task, so a fast mid-tier model is the right
 * default; at roughly 180 sheets a season the difference between the cheapest
 * and the dearest model on the list is a couple of dollars either way.
 *
 * Each box is sent as its own image rather than tiled into one montage. A
 * montage is cheaper, but it invites the failure this design most wants to
 * avoid: a row read one line out, attaching one game's score to another. With
 * separate images the answer is checked against the id it claims to answer.
 */

import type { ScoreCrop } from "../crops"
import {
    type ScoreReading,
    ResponseSchema,
    type Transcriber,
    TranscriberError,
    validateReadings
} from "./port"

const DEFAULT_BASE_URL = "https://ai-gateway.vercel.sh/v1"
/**
 * A Gateway slug from https://ai-gateway.vercel.sh/v1/models.
 *
 * Chosen by measurement, not reputation. Reading fourteen handwritten scores
 * off real crops: this model and qwen3.7-flash got all fourteen, gemini-2.5-
 * flash-lite twelve, gpt-5-nano eight, nova-lite four. It is also reachable
 * on a free-tier Gateway account, which several stronger-sounding models are
 * not. Re-measure before changing it; the ranking is not what you would guess.
 */
const DEFAULT_MODEL = "alibaba/qwen3.5-flash"
const TIMEOUT_MS = 60_000
/**
 * Crops per request.
 *
 * A full sheet is sixteen or eighteen boxes, and sending them in one request
 * made the whole sheet depend on one slow reply: the first real photographs
 * from the gym timed out at sixty seconds and lost every score on the page.
 * Split into chunks, a slow or refused chunk costs only its own boxes, and the
 * rest of the sheet still comes back.
 */
const CROPS_PER_REQUEST = 6

export interface VisionConfig {
    apiKey: string
    model: string
    baseUrl?: string
    fetchImpl?: typeof fetch
}

function instructions(crops: readonly ScoreCrop[]): string {
    const lines = crops.map((crop, index) => {
        const legal = crop.legalValues
        const range = `${Math.min(...legal)}-${Math.max(...legal)}`
        return `${index + 1}. id "${crop.id}" — a volleyball game score, between ${range}`
    })

    return [
        "Each image shows two printed boxes side by side with a handwritten volleyball score in them.",
        "The left box holds the tens digit and may be empty for a single-digit score. The right box holds the units.",
        "",
        "Read each image and reply with JSON only, in this exact shape:",
        '{"readings":[{"id":"<id>","value":<number or null>,"confidence":<0..1>,"alternatives":[{"value":<number>,"confidence":<0..1>}]}]}',
        "",
        "Rules:",
        "- Answer every id below exactly once, and no others.",
        "- If a box looks empty or you genuinely cannot tell, use null rather than guessing.",
        "- confidence is how sure you are, not how legible the writing is.",
        "- List any other reading you seriously considered under alternatives.",
        "",
        "The images, in order:",
        ...lines
    ].join("\n")
}

function toDataUrl(png: Uint8Array): string {
    return `data:image/png;base64,${Buffer.from(png).toString("base64")}`
}

/**
 * Pull the JSON object out of a reply. Models wrap JSON in prose or fences
 * often enough that insisting on a bare object would fail for no good reason,
 * but anything that is not parseable JSON is an error rather than a guess.
 */
function extractJson(text: string): unknown {
    const trimmed = text
        .trim()
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/, "")
    const start = trimmed.indexOf("{")
    const end = trimmed.lastIndexOf("}")
    if (start < 0 || end <= start) {
        throw new TranscriberError("The model did not return JSON.")
    }
    try {
        return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
        throw new TranscriberError("The model's JSON could not be parsed.")
    }
}

export function createVisionTranscriber(config: VisionConfig): Transcriber {
    const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "")
    const doFetch = config.fetchImpl ?? fetch

    return {
        name: config.model,
        async transcribe(
            crops: readonly ScoreCrop[],
            signal?: AbortSignal
        ): Promise<ScoreReading[]> {
            if (crops.length === 0) return []

            const chunks: ScoreCrop[][] = []
            for (let i = 0; i < crops.length; i += CROPS_PER_REQUEST) {
                chunks.push(crops.slice(i, i + CROPS_PER_REQUEST))
            }

            const settled = await Promise.allSettled(
                chunks.map((chunk) => readChunk(chunk, signal))
            )
            const readings = settled.flatMap((r) =>
                r.status === "fulfilled" ? r.value : []
            )
            // Only a total failure is worth reporting as one: a sheet that
            // gave up two boxes out of sixteen is still worth showing, and the
            // boxes with no reading come back as unreadable rather than blank.
            if (readings.length === 0) {
                const first = settled.find((r) => r.status === "rejected")
                throw first && first.status === "rejected"
                    ? first.reason
                    : new TranscriberError("The reading service sent no reply.")
            }
            return readings
        }
    }

    async function readChunk(
        crops: readonly ScoreCrop[],
        signal?: AbortSignal
    ): Promise<ScoreReading[]> {
        const content = [
            { type: "text", text: instructions(crops) },
            ...crops.map((crop) => ({
                type: "image_url",
                image_url: { url: toDataUrl(crop.png) }
            }))
        ]

        const timeout = AbortSignal.timeout(TIMEOUT_MS)
        const response = await doFetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: config.model,
                // Nothing creative is wanted here.
                temperature: 0,
                response_format: { type: "json_object" },
                messages: [{ role: "user", content }]
            }),
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout
        })

        if (!response.ok) {
            const detail = await response.text().catch(() => "")
            throw new TranscriberError(
                `The reading service returned ${response.status}. ${detail.slice(0, 200)}`
            )
        }

        const payload = (await response.json()) as {
            choices?: { message?: { content?: string } }[]
        }
        const text = payload.choices?.[0]?.message?.content
        if (!text) {
            throw new TranscriberError("The reading service sent no reply.")
        }

        const parsed = ResponseSchema.safeParse(extractJson(text))
        if (!parsed.success) {
            throw new TranscriberError(
                "The model's reply did not match the expected shape."
            )
        }

        // Every id checked against what was actually asked; illegal values
        // demoted rather than trusted.
        return validateReadings(crops, parsed.data.readings)
    }
}

/**
 * The configured transcriber, or null when no model is set up.
 *
 * Returning null rather than throwing is deliberate: with no model the reader
 * still identifies the sheet and counts the WIN ticks, so an admin gets a
 * partly pre-filled form instead of an error. That also keeps local
 * development, CI and the end-to-end tests working with no secret at all.
 *
 * `AI_GATEWAY_API_KEY` is the Gateway's own conventional name and the one to
 * set; `SCORESHEET_MODEL_API_KEY` overrides it for anyone pointing this at a
 * different endpoint. Read at call time rather than module scope so a
 * redeploy is not needed to turn reading on.
 */
export function transcriberFromEnv(): Transcriber | null {
    const apiKey =
        process.env.SCORESHEET_MODEL_API_KEY ?? process.env.AI_GATEWAY_API_KEY
    if (!apiKey) return null

    return createVisionTranscriber({
        apiKey,
        model: process.env.SCORESHEET_MODEL ?? DEFAULT_MODEL,
        baseUrl: process.env.SCORESHEET_MODEL_BASE_URL
    })
}
