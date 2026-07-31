import { and, asc, eq, ne, notLike, sql } from "drizzle-orm"
import { db } from "@/database/db"
import { drafts, seasons, teams, users } from "@/database/schema"
import { GHOST_CAPTAIN_ID } from "@/lib/ghost-captain"
import {
    LEGACY_EMAIL_PREFIX,
    type LegacyKind,
    type MatchReason,
    legacyKind,
    norm,
    suggestMatch
} from "@/lib/legacy-matching"
import { formatDisplayName, formatPlayerName } from "@/lib/utils"

export interface MergeTarget {
    id: string
    name: string
    email: string
}

export interface LegacyAccount {
    id: string
    name: string
    email: string
    kind: LegacyKind
    /** Draft picks (roster appearances) stranded on this placeholder. */
    draftCount: number
    /** Teams this placeholder is recorded as captaining. */
    captainCount: number
    /** Season codes the placeholder appears in, oldest first. */
    seasonCodes: string[]
    /** The one real account this looks like, when the match is unambiguous. */
    suggestion: (MergeTarget & { reason: MatchReason }) | null
    /**
     * Real accounts that share a team with this placeholder. They are never
     * suggested, and picking one manually raises a warning: appearing on the
     * same roster means two different people, not one recorded twice.
     */
    sameTeamIds: string[]
}

const legacyPattern = `${LEGACY_EMAIL_PREFIX}%`

/** Every real member account, as combobox options. Excludes the ghost captain. */
export async function fetchMergeTargets(): Promise<MergeTarget[]> {
    const rows = await db
        .select({
            id: users.id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            email: users.email
        })
        .from(users)
        .where(
            and(
                notLike(users.email, legacyPattern),
                ne(users.id, GHOST_CAPTAIN_ID)
            )
        )
        .orderBy(asc(users.last_name), asc(users.first_name))

    return rows.map((u) => ({
        id: u.id,
        // "First (Nick) Last" rather than the usual display name: when you are
        // deciding which real member a placeholder belongs to, the legal first
        // name and the nickname are both evidence, so show both.
        name: formatPlayerName(u.firstName, u.lastName, u.preferredName),
        email: u.email
    }))
}

/**
 * Every `legacy-*` placeholder account with the evidence needed to reconcile
 * it: what history is stranded on it, and which real account it most likely
 * belongs to.
 *
 * Four queries regardless of how many placeholders exist -- the matching
 * itself is done in memory against a surname index, because 756 placeholders
 * against 1,968 members is trivial to bucket and miserable to express as SQL.
 */
export async function fetchLegacyAccounts(): Promise<LegacyAccount[]> {
    const [legacyRows, targets, realRows, activity, conflicts] =
        await Promise.all([
            db
                .select({
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preferred_name,
                    email: users.email
                })
                .from(users)
                .where(sql`${users.email} like ${legacyPattern}`)
                .orderBy(asc(users.last_name), asc(users.first_name)),
            fetchMergeTargets(),
            db
                .select({
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name
                })
                .from(users)
                .where(
                    and(
                        notLike(users.email, legacyPattern),
                        ne(users.id, GHOST_CAPTAIN_ID)
                    )
                ),
            fetchLegacyActivity(),
            fetchSameTeamConflicts()
        ])

    const targetsById = new Map(targets.map((t) => [t.id, t]))

    // Surname index: suggestMatch only ever considers same-surname candidates,
    // so handing it the whole member list would be 1.5M wasted comparisons.
    const bySurname = new Map<string, typeof realRows>()
    for (const r of realRows) {
        const key = norm(r.lastName)
        const bucket = bySurname.get(key)
        if (bucket) {
            bucket.push(r)
        } else {
            bySurname.set(key, [r])
        }
    }

    return legacyRows.map((l) => {
        const sameTeamIds = conflicts.get(l.id) ?? new Set<string>()
        const match = suggestMatch({
            legacy: {
                id: l.id,
                firstName: l.firstName,
                lastName: l.lastName
            },
            candidates: bySurname.get(norm(l.lastName)) ?? [],
            sameTeamIds
        })
        const target = match ? targetsById.get(match.target.id) : undefined
        const stats = activity.get(l.id)

        return {
            id: l.id,
            name: formatDisplayName(l.firstName, l.lastName, l.preferredName),
            email: l.email,
            kind: legacyKind(l.email),
            draftCount: stats?.draftCount ?? 0,
            captainCount: stats?.captainCount ?? 0,
            seasonCodes: stats ? [...stats.seasonCodes] : [],
            suggestion:
                match && target ? { ...target, reason: match.reason } : null,
            sameTeamIds: [...sameTeamIds]
        }
    })
}

interface LegacyActivity {
    draftCount: number
    captainCount: number
    seasonCodes: Set<string>
}

/** Roster appearances, captaincies and seasons, per placeholder account. */
async function fetchLegacyActivity(): Promise<Map<string, LegacyActivity>> {
    const activity = new Map<string, LegacyActivity>()
    const entry = (id: string) => {
        const existing = activity.get(id)
        if (existing) return existing
        const created: LegacyActivity = {
            draftCount: 0,
            captainCount: 0,
            seasonCodes: new Set<string>()
        }
        activity.set(id, created)
        return created
    }

    const [draftRows, captainRows] = await Promise.all([
        db
            .select({
                user: drafts.user,
                count: sql<number>`count(*)::int`,
                code: seasons.code
            })
            .from(drafts)
            .innerJoin(users, eq(users.id, drafts.user))
            .innerJoin(teams, eq(teams.id, drafts.team))
            .innerJoin(seasons, eq(seasons.id, teams.season))
            .where(sql`${users.email} like ${legacyPattern}`)
            .groupBy(drafts.user, seasons.code, seasons.year),
        db
            .select({
                captain: teams.captain,
                count: sql<number>`count(*)::int`,
                code: seasons.code
            })
            .from(teams)
            .innerJoin(users, eq(users.id, teams.captain))
            .innerJoin(seasons, eq(seasons.id, teams.season))
            .where(sql`${users.email} like ${legacyPattern}`)
            .groupBy(teams.captain, seasons.code, seasons.year)
    ])

    for (const row of draftRows) {
        const stats = entry(row.user)
        stats.draftCount += row.count
        stats.seasonCodes.add(row.code)
    }
    for (const row of captainRows) {
        const stats = entry(row.captain)
        stats.captainCount += row.count
        stats.seasonCodes.add(row.code)
    }

    return activity
}

/**
 * Legacy account -> real accounts it shared a team with.
 *
 * A roster never lists the same person twice, so a shared team is proof the
 * two rows are different people. This is not hypothetical: Fall 2009 B "Team
 * Jimenez" lists Jimmy, James and Jeff Jimenez together, and a surname-plus-
 * nickname heuristic would happily merge the first two.
 */
async function fetchSameTeamConflicts(): Promise<Map<string, Set<string>>> {
    const legacyDrafts = db
        .$with("legacy_drafts")
        .as(
            db
                .select({ user: drafts.user, team: drafts.team })
                .from(drafts)
                .innerJoin(users, eq(users.id, drafts.user))
                .where(sql`${users.email} like ${legacyPattern}`)
        )

    const rows = await db
        .with(legacyDrafts)
        .select({
            legacyId: legacyDrafts.user,
            realId: drafts.user
        })
        .from(legacyDrafts)
        .innerJoin(drafts, eq(drafts.team, legacyDrafts.team))
        .innerJoin(users, eq(users.id, drafts.user))
        .where(
            and(
                ne(drafts.user, legacyDrafts.user),
                notLike(users.email, legacyPattern)
            )
        )

    const conflicts = new Map<string, Set<string>>()
    for (const row of rows) {
        const existing = conflicts.get(row.legacyId)
        if (existing) {
            existing.add(row.realId)
        } else {
            conflicts.set(row.legacyId, new Set([row.realId]))
        }
    }
    return conflicts
}
