/**
 * Which R2 bucket an object lives in.
 *
 * `public`: the `bsd` bucket behind pics.bumpsetdrink.com — player, team and
 * score-sheet photos, sponsor logos. Everything in it is downloadable by key.
 * `private`: a bucket with no public domain — inbound email attachments, the
 * inbound-mail spool, the score-sheet handwriting corpus. The app reads
 * these only through the S3 API (and hands staff 60-second presigned URLs),
 * so they never needed a public domain; keeping them in the public bucket
 * meant a deny-list Worker in front of it, which the 2026-10 audit bypassed
 * with a percent-encoded slash.
 */
export type R2Scope = "public" | "private"

export function resolveR2Bucket(
    scope: R2Scope,
    env: { R2_BUCKET?: string; R2_PRIVATE_BUCKET?: string; NODE_ENV?: string }
): string {
    if (scope === "private") {
        if (env.R2_PRIVATE_BUCKET) return env.R2_PRIVATE_BUCKET
        if (env.NODE_ENV === "production") {
            throw new Error(
                "Missing required environment variable: R2_PRIVATE_BUCKET"
            )
        }
        // Dev and CI run against one bucket; the split only matters where
        // the public bucket really is public.
    }
    if (!env.R2_BUCKET) {
        throw new Error("Missing required environment variable: R2_BUCKET")
    }
    return env.R2_BUCKET
}
