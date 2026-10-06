// ---------------------------------------------------------------------------
// Spooled inbound envelope (our own, not Postmark's)
//
// Vercel rejects request bodies over 4.5 MB at the edge, while Postmark
// inlines up to 35 MB of attachments as base64. The Cloudflare Worker in
// workers/postmark-inbound/ takes Postmark's POST, streams the raw JSON into
// R2, and calls the webhook route with only the object key. Everything else
// about inbound handling is unchanged: the spooled JSON is the exact Postmark
// payload and goes through the same dispatch as an inline one.
// ---------------------------------------------------------------------------

export interface PostmarkSpooledEnvelope {
    RecordType: "BSDSpooledInbound"
    /** R2 object key holding the verbatim Postmark JSON. */
    SpoolKey: string
    /** Byte length the Worker wrote, cross-checked against the object. */
    ContentLength: number
}

export const SPOOL_KEY_PATTERN =
    /^inbound-spool\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/
// Postmark caps attachments at 35 MB (~48 MB base64); anything near the
// Worker's own 90 MB cap is a RawEmail regression, not a legitimate email.
export const SPOOL_MAX_BYTES = 120 * 1024 * 1024

/** Shape-check the envelope; the key pattern also pins it to our prefix. */
export function parseSpooledEnvelope(
    payload: Record<string, unknown>
): PostmarkSpooledEnvelope | null {
    const key = payload.SpoolKey
    const length = payload.ContentLength
    if (typeof key !== "string" || !SPOOL_KEY_PATTERN.test(key)) return null
    if (
        typeof length !== "number" ||
        !Number.isInteger(length) ||
        length <= 0 ||
        length > SPOOL_MAX_BYTES
    ) {
        return null
    }
    return {
        RecordType: "BSDSpooledInbound",
        SpoolKey: key,
        ContentLength: length
    }
}
