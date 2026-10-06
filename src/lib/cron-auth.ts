import { timingSafeEqual } from "node:crypto"

/**
 * Is this a genuine Vercel Cron invocation? Vercel sends
 * `Authorization: Bearer ${CRON_SECRET}`. Compared in constant time, and
 * always false when CRON_SECRET is unset, so a missing secret can never
 * leave a cron endpoint open.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
    const secret = process.env.CRON_SECRET
    if (!secret) return false
    const provided = Buffer.from(request.headers.get("authorization") ?? "")
    const expected = Buffer.from(`Bearer ${secret}`)
    return (
        provided.length === expected.length &&
        timingSafeEqual(provided, expected)
    )
}
