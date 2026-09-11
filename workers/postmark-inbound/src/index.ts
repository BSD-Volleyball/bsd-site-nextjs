/**
 * Postmark inbound front door.
 *
 * Postmark POSTs each inbound email as JSON with every attachment inlined as
 * base64 — up to 35 MB of attachments, so ~50 MB of JSON. Vercel rejects
 * request bodies over 4.5 MB before any function runs, so the app can never
 * see those emails directly. This Worker accepts the POST instead, streams
 * the body verbatim into R2, and calls the app's webhook with a small
 * envelope naming the object. The app fetches and processes it with the
 * same code path an inline delivery uses.
 *
 * The Worker returns the app's verdict to Postmark, so Postmark's retry
 * behaviour (non-2xx → up to 10 retries) still applies end to end. A retry
 * arrives here again and is spooled under a fresh key; the app dedupes by
 * MessageID. Spool objects the app never deletes expire via the bucket's
 * lifecycle rule on the inbound-spool/ prefix.
 */

const WEBHOOK_PATH = "/postmark/inbound"
const SPOOL_PREFIX = "inbound-spool/"
// Postmark caps attachments at 35 MB (~48 MB as base64 JSON). Anything near
// this cap means "Include raw email" was re-enabled on the Postmark server,
// which doubles the payload; refuse loudly rather than fail mysteriously.
const MAX_BODY_BYTES = 90 * 1024 * 1024
// Postmark gives the webhook ~2 minutes; answer with a definite status
// before then so the failure mode is a clean retry, not a stalled socket.
const ORIGIN_TIMEOUT_MS = 90_000
const USER_AGENT = "bsd-postmark-spool/1"

/** The only outbound call, injectable so tests can stand in for the app. */
export interface Deps {
    fetch: typeof fetch
    /** How long to wait for the app before answering Postmark 504. */
    originTimeoutMs?: number
}

export interface SpoolEnvelope {
    RecordType: "BSDSpooledInbound"
    SpoolKey: string
    ContentLength: number
}

function json(
    body: Record<string, unknown>,
    status: number,
    headers: Record<string, string> = {}
): Response {
    return Response.json(body, { status, headers })
}

function log(
    level: "info" | "warn" | "error",
    fields: Record<string, unknown>
) {
    const line = JSON.stringify({ worker: "postmark-inbound", ...fields })
    if (level === "error") console.error(line)
    else if (level === "warn") console.warn(line)
    else console.log(line)
}

async function sha256(text: string): Promise<ArrayBuffer> {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
}

/**
 * Postmark authenticates with the credentials embedded in the webhook URL,
 * sent as HTTP Basic. Hash both sides to a fixed length before the
 * constant-time compare so the comparison never leaks the expected length.
 */
async function verifyBasicAuth(
    header: string | null,
    env: Cloudflare.Env
): Promise<boolean> {
    if (!header?.startsWith("Basic ")) return false
    let provided: string
    try {
        provided = atob(header.slice(6))
    } catch {
        return false
    }
    const expected = `${env.WEBHOOK_USER}:${env.WEBHOOK_PASSWORD}`
    const [a, b] = await Promise.all([sha256(provided), sha256(expected)])
    return crypto.subtle.timingSafeEqual(a, b)
}

function parseContentLength(header: string | null): number | null {
    if (header === null) return null
    const value = Number(header)
    return Number.isInteger(value) && value >= 0 ? value : null
}

/** Translate the app's answer into the status Postmark should see. */
async function relayOriginResponse(
    origin: Response,
    spoolKey: string
): Promise<Response> {
    if (origin.ok) {
        log("info", { message: "spooled inbound processed", spoolKey })
        return json({ received: true, spoolKey }, 200)
    }

    // Never echo the app's body (a WAF challenge page, an HTML 5xx) back to
    // Postmark; log a slice of it and answer with our own small JSON.
    const snippet = (await origin.text().catch(() => "")).slice(0, 200)
    const base = { spoolKey, originStatus: origin.status, originBody: snippet }

    if (origin.headers.has("x-vercel-mitigated")) {
        log("error", {
            message:
                "origin challenged by Vercel WAF — the POST /api/webhooks/postmark bypass rule is missing",
            ...base
        })
        return json({ error: "Origin blocked the relay", spoolKey }, 502)
    }
    if (origin.status >= 300 && origin.status < 400) {
        log("error", {
            message:
                "origin redirected; ORIGIN_WEBHOOK_URL must be the final URL",
            location: origin.headers.get("location"),
            ...base
        })
        return json({ error: "Origin redirected", spoolKey }, 502)
    }
    if (origin.status === 401) {
        log("error", {
            message:
                "origin rejected the credentials — WEBHOOK_USER/PASSWORD secrets differ from the app's POSTMARK_WEBHOOK_*",
            ...base
        })
        return json({ error: "Origin rejected credentials", spoolKey }, 401)
    }
    log("error", { message: "origin rejected spooled inbound", ...base })
    return json(
        { error: "Origin rejected the message", spoolKey },
        origin.status >= 400 && origin.status < 600 ? origin.status : 502
    )
}

export function createHandler(
    deps: Deps = { fetch: (input, init) => fetch(input, init) }
) {
    const originTimeoutMs = deps.originTimeoutMs ?? ORIGIN_TIMEOUT_MS
    return {
        async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
            const url = new URL(request.url)
            if (url.pathname !== WEBHOOK_PATH) {
                return json({ error: "Not found" }, 404)
            }
            if (request.method !== "POST") {
                return json({ error: "Method not allowed" }, 405, {
                    Allow: "POST"
                })
            }
            if (!env.WEBHOOK_USER || !env.WEBHOOK_PASSWORD) {
                log("error", {
                    message: "WEBHOOK_USER/WEBHOOK_PASSWORD not set"
                })
                return json({ error: "Not configured" }, 500)
            }
            const authorization = request.headers.get("authorization")
            if (!(await verifyBasicAuth(authorization, env))) {
                return json({ error: "Unauthorized" }, 401)
            }

            const declaredLength = parseContentLength(
                request.headers.get("content-length")
            )
            if (declaredLength !== null && declaredLength > MAX_BODY_BYTES) {
                log("error", {
                    message:
                        "inbound body over cap — is 'Include raw email' enabled on the Postmark server?",
                    contentLength: declaredLength
                })
                return json({ error: "Payload too large" }, 413)
            }

            // R2 can stream a request body straight through when its length is
            // known up front; Postmark always sends Content-Length. Without it
            // the body has to be buffered, which is the only path that could
            // approach the isolate's memory limit — hence the cap check again.
            let body: ReadableStream | ArrayBuffer
            if (declaredLength !== null && request.body) {
                body = request.body
            } else {
                const buffered = await request.arrayBuffer()
                if (buffered.byteLength > MAX_BODY_BYTES) {
                    return json({ error: "Payload too large" }, 413)
                }
                body = buffered
            }

            const spoolKey = `${SPOOL_PREFIX}${crypto.randomUUID()}.json`
            const object = await env.SPOOL_BUCKET.put(spoolKey, body, {
                httpMetadata: { contentType: "application/json" },
                customMetadata: {
                    receivedAt: new Date().toISOString(),
                    cfRay: request.headers.get("cf-ray") ?? ""
                }
            })
            if (!object) {
                log("error", { message: "R2 put returned nothing", spoolKey })
                return json({ error: "Spool failed" }, 500)
            }
            log("info", {
                message: "spooled inbound",
                spoolKey,
                contentLength: object.size
            })

            const envelope: SpoolEnvelope = {
                RecordType: "BSDSpooledInbound",
                SpoolKey: spoolKey,
                ContentLength: object.size
            }

            let origin: Response
            try {
                origin = await deps.fetch(env.ORIGIN_WEBHOOK_URL, {
                    method: "POST",
                    headers: {
                        authorization: authorization ?? "",
                        "content-type": "application/json",
                        "user-agent": USER_AGENT
                    },
                    body: JSON.stringify(envelope),
                    redirect: "manual",
                    signal: AbortSignal.timeout(originTimeoutMs)
                })
            } catch (error) {
                const timedOut =
                    error instanceof Error && error.name === "TimeoutError"
                log("error", {
                    message: timedOut
                        ? "origin timed out"
                        : "origin unreachable",
                    spoolKey,
                    error:
                        error instanceof Error ? error.message : String(error)
                })
                return json(
                    {
                        error: timedOut
                            ? "Origin timed out"
                            : "Origin unreachable",
                        spoolKey
                    },
                    timedOut ? 504 : 502
                )
            }

            return relayOriginResponse(origin, spoolKey)
        }
    } satisfies ExportedHandler<Cloudflare.Env>
}

export default createHandler()
