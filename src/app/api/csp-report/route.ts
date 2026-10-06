/**
 * Receives Content-Security-Policy violation reports from browsers (the
 * policy in next.config.ts runs in Report-Only mode). Each report is logged
 * as one structured warning so violations can be found in the Vercel logs
 * before the policy is enforced.
 *
 * Unauthenticated by nature: browsers send these without credentials. The
 * body is size-capped and only a few known fields are logged, so the route
 * cannot be used to write arbitrary content into the logs. No database
 * access. The Vercel WAF has a bypass rule for POST /api/csp-report, since
 * browser-sent reports cannot answer the bot challenge.
 */

import { logger } from "@/lib/logger"

const MAX_BODY_BYTES = 16 * 1024

function field(value: unknown): string | undefined {
    return typeof value === "string" ? value.slice(0, 300) : undefined
}

export async function POST(request: Request) {
    const length = Number(request.headers.get("content-length") ?? 0)
    if (length > MAX_BODY_BYTES) return new Response(null, { status: 413 })

    let body: unknown
    try {
        const text = await request.text()
        if (text.length > MAX_BODY_BYTES) {
            return new Response(null, { status: 413 })
        }
        body = JSON.parse(text)
    } catch {
        return new Response(null, { status: 400 })
    }

    // report-uri sends { "csp-report": {...} }; the Reporting API sends an
    // array of { type: "csp-violation", body: {...} }.
    const reports: Record<string, unknown>[] = Array.isArray(body)
        ? body
              .slice(0, 10)
              .map((r) => (r as { body?: Record<string, unknown> })?.body ?? {})
        : [
              ((body as Record<string, unknown>)?.["csp-report"] ??
                  {}) as Record<string, unknown>
          ]

    for (const r of reports) {
        logger.warn("[csp] Violation reported", {
            directive: field(
                r["effective-directive"] ??
                    r.effectiveDirective ??
                    r["violated-directive"]
            ),
            blocked: field(r["blocked-uri"] ?? r.blockedURL),
            page: field(r["document-uri"] ?? r.documentURL),
            source: field(r["source-file"] ?? r.sourceFile),
            disposition: field(r.disposition)
        })
    }
    return new Response(null, { status: 204 })
}
