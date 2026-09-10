"use server"

import { db } from "@/database/db"
import { seasonRefs, users, divisions, seasons } from "@/database/schema"
import { eq, and, desc, asc, or, ilike, lt, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import {
    withAction,
    ok,
    fail,
    requireSession,
    requireSeasonConfig,
    requirePositiveInt,
    requireNonEmptyString,
    requirePermission,
    ActionError
} from "@/next/action-helpers"
import type { ActionResult } from "@/next/action-helpers"
import { grantRole, revokeRole } from "@/lib/rbac"
import { logAuditEntry } from "@/lib/audit-log"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SeasonRefRow {
    id: number
    seasonRefId: number
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    email: string
    isCertified: boolean
    hasW9: boolean
    passedTest: boolean
    isActive: boolean
    maxDivisionLevel: number
}

export interface DivisionRow {
    id: number
    name: string
    level: number
}

export interface SelectRefsData {
    seasonId: number
    seasonLabel: string
    refs: SeasonRefRow[]
    divisions: DivisionRow[]
    previousSeasonLabel: string | null
    previousSeasonRefs: UserSearchResultRef[]
}

export interface UserSearchResultRef {
    id: string
    firstName: string
    lastName: string
    preferredName: string | null
    email: string
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

export async function getSelectRefsData(): Promise<SelectRefsData> {
    await requirePermission("schedule:manage")
    const config = await requireSeasonConfig()

    const season = await db
        .select({
            id: seasons.id,
            year: seasons.year,
            season: seasons.season
        })
        .from(seasons)
        .where(eq(seasons.id, config.seasonId))
        .then((rows) => rows[0])

    if (!season) {
        return {
            seasonId: config.seasonId,
            seasonLabel: "Unknown Season",
            refs: [],
            divisions: [],
            previousSeasonLabel: null,
            previousSeasonRefs: []
        }
    }

    const seasonLabel = `${season.season} ${season.year}`

    const refRows = await db
        .select({
            seasonRefId: seasonRefs.id,
            userId: seasonRefs.user_id,
            isCertified: seasonRefs.is_certified,
            hasW9: seasonRefs.has_w9,
            passedTest: seasonRefs.passed_test,
            isActive: seasonRefs.is_active,
            maxDivisionLevel: seasonRefs.max_division_level,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            email: users.email
        })
        .from(seasonRefs)
        .innerJoin(users, eq(seasonRefs.user_id, users.id))
        .where(eq(seasonRefs.season_id, config.seasonId))
        .orderBy(asc(users.last_name), asc(users.first_name))

    const refs: SeasonRefRow[] = refRows.map((r) => ({
        id: r.seasonRefId,
        seasonRefId: r.seasonRefId,
        userId: r.userId,
        firstName: r.firstName,
        lastName: r.lastName,
        preferredName: r.preferredName,
        email: r.email,
        isCertified: r.isCertified,
        hasW9: r.hasW9,
        passedTest: r.passedTest,
        isActive: r.isActive,
        maxDivisionLevel: r.maxDivisionLevel
    }))

    const divisionRows = await db
        .select({
            id: divisions.id,
            name: divisions.name,
            level: divisions.level
        })
        .from(divisions)
        .where(eq(divisions.active, true))
        .orderBy(asc(divisions.level))

    // Quick-add pool: active refs from the most recent prior season that had
    // any refs configured, minus anyone already on this season's roster.
    const currentRefUserIds = new Set(refs.map((r) => r.userId))

    const [previousSeason] = await db
        .select({
            id: seasons.id,
            year: seasons.year,
            season: seasons.season
        })
        .from(seasons)
        .innerJoin(seasonRefs, eq(seasonRefs.season_id, seasons.id))
        .where(lt(seasons.id, config.seasonId))
        .groupBy(seasons.id, seasons.year, seasons.season)
        .orderBy(desc(seasons.id))
        .limit(1)

    let previousSeasonLabel: string | null = null
    let previousSeasonRefs: UserSearchResultRef[] = []

    if (previousSeason) {
        previousSeasonLabel = `${previousSeason.season} ${previousSeason.year}`

        const prevRows = await db
            .select({
                id: users.id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                email: users.email
            })
            .from(seasonRefs)
            .innerJoin(users, eq(seasonRefs.user_id, users.id))
            .where(
                and(
                    eq(seasonRefs.season_id, previousSeason.id),
                    eq(seasonRefs.is_active, true)
                )
            )
            .orderBy(asc(users.last_name), asc(users.first_name))

        previousSeasonRefs = prevRows.filter(
            (r) => !currentRefUserIds.has(r.id)
        )
    }

    return {
        seasonId: config.seasonId,
        seasonLabel,
        refs,
        divisions: divisionRows,
        previousSeasonLabel,
        previousSeasonRefs
    }
}

// ---------------------------------------------------------------------------
// Search users
// ---------------------------------------------------------------------------

export const searchUsersForRef = withAction(
    async (query: string): Promise<ActionResult<UserSearchResultRef[]>> => {
        await requirePermission("schedule:manage")
        const q = requireNonEmptyString(query, "Search query")
        if (q.length < 2) return ok([])

        const pattern = `%${q}%`
        const results = await db
            .select({
                id: users.id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                email: users.email
            })
            .from(users)
            .where(
                or(
                    ilike(users.first_name, pattern),
                    ilike(users.last_name, pattern),
                    ilike(users.email, pattern),
                    ilike(users.preferred_name, pattern)
                )
            )
            .limit(20)

        return ok(results)
    }
)

// ---------------------------------------------------------------------------
// Add season ref
// ---------------------------------------------------------------------------

/**
 * Inserts one season_refs row (carrying forward the user's most recent prior
 * season settings) and grants the referee role. Returns false when the user is
 * already a ref for this season. Callers must have already authorized.
 */
async function insertSeasonRef(
    userId: string,
    seasonId: number,
    actorId: string,
    highestDivisionLevel: number
): Promise<boolean> {
    // Check if already a ref this season
    const [existing] = await db
        .select({ id: seasonRefs.id })
        .from(seasonRefs)
        .where(
            and(
                eq(seasonRefs.season_id, seasonId),
                eq(seasonRefs.user_id, userId)
            )
        )
        .limit(1)

    if (existing) return false

    let isCertified = false
    let hasW9 = false
    let passedTest = false
    let maxDivisionLevel = highestDivisionLevel

    // Use previous season values if they exist and are from a different season
    const [prevSeasonRef] = await db
        .select({
            isCertified: seasonRefs.is_certified,
            hasW9: seasonRefs.has_w9,
            passedTest: seasonRefs.passed_test,
            maxDivisionLevel: seasonRefs.max_division_level,
            seasonId: seasonRefs.season_id
        })
        .from(seasonRefs)
        .innerJoin(seasons, eq(seasonRefs.season_id, seasons.id))
        .where(eq(seasonRefs.user_id, userId))
        .orderBy(desc(seasons.id))
        .limit(1)

    if (prevSeasonRef && prevSeasonRef.seasonId !== seasonId) {
        isCertified = prevSeasonRef.isCertified
        hasW9 = prevSeasonRef.hasW9
        passedTest = prevSeasonRef.passedTest
        maxDivisionLevel = prevSeasonRef.maxDivisionLevel
    }

    await db.insert(seasonRefs).values({
        season_id: seasonId,
        user_id: userId,
        is_certified: isCertified,
        has_w9: hasW9,
        passed_test: passedTest,
        is_active: true,
        max_division_level: maxDivisionLevel
    })

    // Grant referee RBAC role for this season
    await grantRole(userId, "referee", {
        seasonId,
        grantedBy: actorId
    })

    return true
}

/** Highest active division level, used as the default max for new refs. */
async function getHighestDivisionLevel(): Promise<number> {
    const activeDivisions = await db
        .select({ level: divisions.level })
        .from(divisions)
        .where(eq(divisions.active, true))
        .orderBy(desc(divisions.level))
        .limit(1)

    return activeDivisions[0]?.level ?? 1
}

export const addSeasonRef = withAction(
    async (userId: string): Promise<ActionResult> => {
        const session = await requireSession()
        await requirePermission("schedule:manage")
        const config = await requireSeasonConfig()
        requireNonEmptyString(userId, "User ID")

        const highestLevel = await getHighestDivisionLevel()
        const added = await insertSeasonRef(
            userId,
            config.seasonId,
            session.user.id,
            highestLevel
        )

        if (!added) {
            return fail("User is already a ref for this season.")
        }

        await logAuditEntry({
            userId: session.user.id,
            action: "create",
            entityType: "season_refs",
            entityId: userId,
            summary: `Added user ${userId} as ref for season ${config.seasonId}`
        })

        revalidatePath("/dashboard/select-refs")
        return ok()
    }
)

// ---------------------------------------------------------------------------
// Add several season refs at once (quick add from previous season)
// ---------------------------------------------------------------------------

export const addSeasonRefs = withAction(
    async (userIds: string[]): Promise<ActionResult<number>> => {
        const session = await requireSession()
        await requirePermission("schedule:manage")
        const config = await requireSeasonConfig()

        if (!Array.isArray(userIds) || userIds.length === 0) {
            throw new ActionError("Select at least one referee to add.")
        }
        for (const id of userIds) {
            requireNonEmptyString(id, "User ID")
        }

        // De-dupe and confirm every id is a real user before touching anything.
        const uniqueIds = [...new Set(userIds)]
        const found = await db
            .select({ id: users.id })
            .from(users)
            .where(inArray(users.id, uniqueIds))

        if (found.length !== uniqueIds.length) {
            throw new ActionError("One or more selected users no longer exist.")
        }

        const highestLevel = await getHighestDivisionLevel()

        let addedCount = 0
        for (const id of uniqueIds) {
            const added = await insertSeasonRef(
                id,
                config.seasonId,
                session.user.id,
                highestLevel
            )
            if (added) addedCount++
        }

        if (addedCount === 0) {
            return fail("Those users are already refs for this season.")
        }

        await logAuditEntry({
            userId: session.user.id,
            action: "create",
            entityType: "season_refs",
            entityId: String(config.seasonId),
            summary: `Added ${addedCount} ref(s) to season ${config.seasonId} from the previous season roster`
        })

        revalidatePath("/dashboard/select-refs")
        return ok(addedCount)
    }
)

// ---------------------------------------------------------------------------
// Remove season ref
// ---------------------------------------------------------------------------

export const removeSeasonRef = withAction(
    async (seasonRefId: number): Promise<ActionResult> => {
        const session = await requireSession()
        await requirePermission("schedule:manage")
        const id = requirePositiveInt(seasonRefId, "Season ref ID")

        // Look up the ref record to get the user_id
        const [refRecord] = await db
            .select({
                id: seasonRefs.id,
                userId: seasonRefs.user_id,
                seasonId: seasonRefs.season_id
            })
            .from(seasonRefs)
            .where(eq(seasonRefs.id, id))
            .limit(1)

        if (!refRecord) {
            return fail("Ref record not found.")
        }

        await db.delete(seasonRefs).where(eq(seasonRefs.id, id))

        // Revoke referee role for this season
        await revokeRole(refRecord.userId, "referee", {
            seasonId: refRecord.seasonId
        })

        await logAuditEntry({
            userId: session.user.id,
            action: "delete",
            entityType: "season_refs",
            entityId: refRecord.userId,
            summary: `Removed user ${refRecord.userId} as ref from season ${refRecord.seasonId}`
        })

        revalidatePath("/dashboard/select-refs")
        return ok()
    }
)

// ---------------------------------------------------------------------------
// Update season ref
// ---------------------------------------------------------------------------

export const updateSeasonRef = withAction(
    async (
        seasonRefId: number,
        isCertified: boolean,
        hasW9: boolean,
        passedTest: boolean,
        isActive: boolean,
        maxDivisionLevel: number
    ): Promise<ActionResult> => {
        const session = await requireSession()
        await requirePermission("schedule:manage")
        const id = requirePositiveInt(seasonRefId, "Season ref ID")
        if (typeof maxDivisionLevel !== "number" || maxDivisionLevel < 0) {
            // ActionError so withAction surfaces this message instead of the
            // generic "Something went wrong."
            throw new ActionError(
                "Max division level must be a non-negative integer"
            )
        }
        const level = Math.round(maxDivisionLevel)

        await db
            .update(seasonRefs)
            .set({
                is_certified: isCertified,
                has_w9: hasW9,
                passed_test: passedTest,
                is_active: isActive,
                max_division_level: level
            })
            .where(eq(seasonRefs.id, id))

        await logAuditEntry({
            userId: session.user.id,
            action: "update",
            entityType: "season_refs",
            entityId: String(id),
            summary: `Updated ref ${id}: certified=${isCertified}, w9=${hasW9}, passedTest=${passedTest}, active=${isActive}, maxLevel=${level}`
        })

        revalidatePath("/dashboard/select-refs")
        return ok()
    }
)
