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
 * Routes (wrangler.jsonc) attach this Worker to those prefixes only, plus
 * sponsor logos, so ordinary picture traffic never runs it:
 *  - private prefixes always answer 404 (not 403: don't confirm a key exists);
 *  - sponsor logos are served from R2 with a sandboxing CSP. Sponsor contacts
 *    (not only admins) may upload SVG, and an SVG opened directly is a
 *    document that can run script on this origin; the sandbox stops that
 *    while <img> rendering is unaffected.
 */

export const PRIVATE_PREFIXES = [
    "/email-attachments/",
    "/inbound-spool/",
    "/scoresheet-samples/"
]
const SPONSOR_LOGO_PREFIX = "/sponsorlogos/"

const LOGO_CSP =
    "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox"

interface Env {
    PICS: R2Bucket
}

function notFound(): Response {
    return new Response("Not found", {
        status: 404,
        headers: { "cache-control": "no-store" }
    })
}

async function serveSponsorLogo(
    request: Request,
    env: Env,
    path: string
): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", {
            status: 405,
            headers: { allow: "GET, HEAD" }
        })
    }
    const object = await env.PICS.get(decodeURIComponent(path.slice(1)))
    if (!object) return notFound()

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set("etag", object.httpEtag)
    headers.set("content-security-policy", LOGO_CSP)
    headers.set("x-content-type-options", "nosniff")
    // Logo filenames carry their upload time, so a key never changes content.
    headers.set("cache-control", "public, max-age=31536000, immutable")
    return new Response(request.method === "HEAD" ? null : object.body, {
        headers
    })
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const path = new URL(request.url).pathname
        if (PRIVATE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
            return notFound()
        }
        if (path.startsWith(SPONSOR_LOGO_PREFIX)) {
            return serveSponsorLogo(request, env, path)
        }
        // Not reachable through the configured routes; never proxy anything.
        return notFound()
    }
} satisfies ExportedHandler<Env>
