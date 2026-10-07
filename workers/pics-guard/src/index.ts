/**
 * Guard in front of pics.bumpsetdrink.com, the public custom domain of the
 * R2 bucket "bsd".
 *
 * The bucket also holds objects that must never be public: inbound email
 * attachments (staff download them through 60-second presigned URLs after a
 * permission check), the raw inbound-email spool, and the score-sheet
 * handwriting corpus. Without this Worker any of those was downloadable by
 * key from the public domain, bypassing the app's authorization entirely.
 *
 * The Worker is bound to the whole host (wrangler.jsonc). It used to be
 * bound only to the guarded prefixes, and Cloudflare matches routes on the
 * raw URL, so `/inbound-spool%2F<key>` skipped the Worker and R2 decoded
 * the slash itself. Every decision here is made on the decoded, normalised
 * path, and anything the Worker does not recognise is served from the
 * bucket by the Worker rather than by the origin.
 *  - private prefixes always answer 404 (not 403: don't confirm a key exists);
 *  - sponsor logos are served with a sandboxing CSP. Sponsor contacts (not
 *    only admins) may upload SVG, and an SVG opened directly is a document
 *    that can run script on this origin; the sandbox stops that while <img>
 *    rendering is unaffected;
 *  - everything else (player, team and score-sheet pictures) is served as
 *    is, with a short cache because those keys are overwritten in place.
 */

export const PRIVATE_PREFIXES = [
    "/email-attachments/",
    "/inbound-spool/",
    "/scoresheet-samples/"
]
const SPONSOR_LOGO_PREFIX = "/sponsorlogos/"

const LOGO_CSP =
    "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox"
const PUBLIC_CACHE = "public, max-age=14400"
// Logo filenames carry their upload time, so a key never changes content.
const LOGO_CACHE = "public, max-age=31536000, immutable"

interface Env {
    PICS: R2Bucket
}

/**
 * Decode and normalise a request path so prefix checks see what R2 would
 * resolve. Returns null when the path cannot be a key we issued: malformed
 * percent-encoding, or a `..` segment (R2 keys are flat strings and ours
 * never contain one, so refusing is free and removes a whole class of
 * confusion).
 */
export function normalizePath(pathname: string): string | null {
    let decoded: string
    try {
        decoded = decodeURIComponent(pathname)
    } catch {
        return null
    }
    const collapsed = `/${decoded.replace(/^\/+/, "")}`.replace(/\/{2,}/g, "/")
    if (collapsed.split("/").includes("..")) return null
    return collapsed
}

function notFound(): Response {
    return new Response("Not found", {
        status: 404,
        headers: { "cache-control": "no-store" }
    })
}

async function serveObject(
    request: Request,
    env: Env,
    key: string,
    { cacheControl, csp }: { cacheControl: string; csp?: string }
): Promise<Response> {
    const object = await env.PICS.get(key)
    if (!object) return notFound()

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set("etag", object.httpEtag)
    headers.set("x-content-type-options", "nosniff")
    headers.set("cache-control", cacheControl)
    if (csp) headers.set("content-security-policy", csp)
    return new Response(request.method === "HEAD" ? null : object.body, {
        headers
    })
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        if (request.method !== "GET" && request.method !== "HEAD") {
            return new Response("Method not allowed", {
                status: 405,
                headers: { allow: "GET, HEAD" }
            })
        }
        const path = normalizePath(new URL(request.url).pathname)
        if (path === null || path === "/") return notFound()
        if (PRIVATE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
            return notFound()
        }
        const key = path.slice(1)
        if (path.startsWith(SPONSOR_LOGO_PREFIX)) {
            return serveObject(request, env, key, {
                cacheControl: LOGO_CACHE,
                csp: LOGO_CSP
            })
        }
        return serveObject(request, env, key, { cacheControl: PUBLIC_CACHE })
    }
} satisfies ExportedHandler<Env>
