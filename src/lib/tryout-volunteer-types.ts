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

/**
 * General jobs are staffed once (per night or per session). Per-court jobs
 * are duplicated for every court on the night's court list, so a
 * per-court, per-session job needing 3 people on a 4-court, 2-session
 * night fills 24 slots.
 */
export type TryoutJobCourtScope = "general" | "per_court"

export function isTryoutJobCourtScope(
    value: unknown
): value is TryoutJobCourtScope {
    return value === "general" || value === "per_court"
}

export const TRYOUT_JOB_COURT_SCOPE_LABELS: Record<
    TryoutJobCourtScope,
    string
> = {
    general: "General",
    per_court: "Per court"
}

/** Highest court number an admin can list for a tryout night. */
export const MAX_COURT_NUMBER = 99
/** Most courts one tryout night can list. */
export const MAX_COURTS_PER_NIGHT = 20

/** "Court 3" — the label used everywhere a per-court slot is shown. */
export function courtLabel(courtNumber: number): string {
    return `Court ${courtNumber}`
}

/** "1, 2, 3, 4" — the editable form of a night's court list. */
export function formatCourtNumbers(courtNumbers: number[]): string {
    return courtNumbers.join(", ")
}

/**
 * Parses an admin-typed court list ("1, 2, 3, 4" / "1 2 3 4 7 8") into
 * sorted, de-duplicated court numbers. Returns null when any token is not
 * a court number in range, so callers can reject the whole input rather
 * than silently dropping a court.
 */
export function parseCourtNumbers(input: string): number[] | null {
    const tokens = input
        .split(/[\s,;]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 0)
    const courts = new Set<number>()
    for (const token of tokens) {
        if (!/^\d+$/.test(token)) return null
        const court = Number(token)
        if (court < 1 || court > MAX_COURT_NUMBER) return null
        courts.add(court)
    }
    if (courts.size > MAX_COURTS_PER_NIGHT) return null
    return [...courts].sort((a, b) => a - b)
}
