/**
 * Client-safe types for the tryout volunteer feature. Kept out of the
 * "use server" action files so client components can import them without
 * pulling in server code.
 */

/**
 * Whole-night jobs are staffed once for the entire evening; per-session
 * jobs need `needed` people in every time slot of that night.
 */
export type TryoutJobScope = "whole_night" | "per_session"

export function isTryoutJobScope(value: unknown): value is TryoutJobScope {
    return value === "whole_night" || value === "per_session"
}

export const TRYOUT_JOB_SCOPE_LABELS: Record<TryoutJobScope, string> = {
    whole_night: "Whole night",
    per_session: "Per session"
}
