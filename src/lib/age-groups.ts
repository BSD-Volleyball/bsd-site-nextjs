// Age groups collected during season signup (`signups.age`). This is the single
// source of truth for the option values/labels and their youngest -> oldest
// ordering, shared by the signup wizard and the admin Insurance Report.
//
// The stored `value` strings are the literal text persisted in `signups.age`.
// Order matters: index 0 is the youngest group, and "youngest wins" logic
// (a player who registered across multiple groups in a year) relies on it.

export const AGE_GROUPS = [
    { value: "15-14", label: "15-14" },
    { value: "17-16", label: "17-16" },
    { value: "19-18", label: "19-18" },
    { value: "20+", label: "20 or older" }
] as const

export type AgeGroupValue = (typeof AGE_GROUPS)[number]["value"]

// Adults are the default bucket for participants with no recorded signup age
// that year (e.g. tournament-only players — tournaments don't collect an age).
export const DEFAULT_AGE_GROUP: AgeGroupValue = "20+"

const ORDER = new Map<string, number>(
    AGE_GROUPS.map((group, index) => [group.value, index])
)

/**
 * Given the age-group values a player registered as across a single year,
 * return the youngest recognized one. Unknown or null values are ignored;
 * if nothing recognizable remains, falls back to DEFAULT_AGE_GROUP (adult).
 */
export function youngestAgeGroup(
    values: (string | null | undefined)[]
): AgeGroupValue {
    let best: number | null = null
    for (const value of values) {
        if (value == null) continue
        const rank = ORDER.get(value)
        if (rank === undefined) continue
        if (best === null || rank < best) best = rank
    }
    return best === null ? DEFAULT_AGE_GROUP : AGE_GROUPS[best].value
}
