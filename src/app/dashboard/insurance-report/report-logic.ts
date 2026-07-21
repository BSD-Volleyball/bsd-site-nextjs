import { AGE_GROUPS, youngestAgeGroup } from "@/lib/age-groups"

// Pure aggregation for the Insurance Report, split out from actions.ts so it can
// be unit-tested without a database. (A "use server" module may only export
// async server actions, so sync helpers live here.)

export type InsuranceReportUser = {
    userId: string
    name: string
    events: string[]
}

export type InsuranceGroup = {
    value: string
    label: string
    total: number
    users: InsuranceReportUser[]
}

export type InsuranceReport = {
    groups: InsuranceGroup[]
}

export function seasonLabel(season: string, year: number): string {
    const name = season.charAt(0).toUpperCase() + season.slice(1)
    return `${name} ${year}`
}

/**
 * Bucket participants into age groups for a single calendar year.
 *
 * - `ageEntries`: one row per season signup that year (registration). A user's
 *   bucket is the youngest group they registered as; a participant with no
 *   recognized signup age defaults to the adult group (see youngestAgeGroup).
 * - `participation`: one row per event a user actually took part in that year
 *   (rostered seasons, permanent subs, tournament rosters), carrying a display
 *   name and an event label. Inclusion in the report requires ≥1 such row.
 *
 * Each user is counted once, in their youngest group, with a de-duplicated,
 * sorted list of the events they participated in. Groups are returned
 * youngest -> oldest and always include all four (empty groups have total 0).
 */
export function buildInsuranceGroups(input: {
    ageEntries: { userId: string; age: string | null }[]
    participation: { userId: string; name: string; label: string }[]
}): InsuranceGroup[] {
    const agesByUser = new Map<string, (string | null)[]>()
    for (const entry of input.ageEntries) {
        const arr = agesByUser.get(entry.userId) ?? []
        arr.push(entry.age)
        agesByUser.set(entry.userId, arr)
    }

    const participants = new Map<
        string,
        { name: string; events: Set<string> }
    >()
    for (const row of input.participation) {
        const existing = participants.get(row.userId)
        if (existing) {
            existing.events.add(row.label)
            if (!existing.name && row.name) existing.name = row.name
        } else {
            participants.set(row.userId, {
                name: row.name,
                events: new Set([row.label])
            })
        }
    }

    const buckets = new Map<string, InsuranceReportUser[]>()
    for (const group of AGE_GROUPS) buckets.set(group.value, [])

    for (const [userId, info] of participants) {
        const group = youngestAgeGroup(agesByUser.get(userId) ?? [])
        buckets.get(group)?.push({
            userId,
            name: info.name,
            events: Array.from(info.events).sort((a, b) => a.localeCompare(b))
        })
    }

    return AGE_GROUPS.map((group) => {
        const users = (buckets.get(group.value) ?? []).sort((a, b) =>
            a.name.localeCompare(b.name)
        )
        return {
            value: group.value,
            label: group.label,
            total: users.length,
            users
        }
    })
}
