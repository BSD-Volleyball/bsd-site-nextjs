"use server"

import { db } from "@/database/db"
import { seasonRefs, users, divisions, seasons } from "@/database/schema"
import { eq, and, desc, asc, or, ilike } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import {
    withAction,
    ok,
    fail,
    requireSession,
    requireSeasonConfig,
    requirePositiveInt,
    requireNonEmptyString
} from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"
import { grantRole, revokeRole } from "@/lib/rbac"
import { hasPermissionBySession, isAdminOrDirectorBySession } from "@/lib/rbac"
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
}

export interface UserSearchResultRef {
    id: string
    firstName: string
    lastName: string
    preferredName: string | null
    email: string
}

// ---------------------------------------------------------------------------
// Authorization helper
// ---------------------------------------------------------------------------

async function requireRefsAccess(): Promise<void> {
    const hasSchedule = await hasPermissionBySession("schedule:manage")
    if (hasSchedule) return
    const isAdmin = await isAdminOrDirectorBySession()
    if (isAdmin) return
    throw new Error("Unauthorized.")
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

export async function getSelectRefsData(): Promise<SelectRefsData> {
    await requireRefsAccess()
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
            divisions: []
        }
    }

    const seasonLabel = `${season.season} ${season.year}`

    const refRows = await db
        .select({
            seasonRefId: seasonRefs.id,
            userId: seasonRefs.user_id,
            isCertified: seasonRefs.is_certified,
            hasW9: seasonRefs.has_w9,
            maxDivisionLevel: seasonRefs.max_division_level,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            email: users.email
        })
        .from(seasonRefs)
        .innerJoin(users, eq(seasonRefs.user_id, users.id))
        .where(eq(seasonRefs.season_id, config.seasonId))

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

    return {
        seasonId: config.seasonId,
        seasonLabel,
        refs,
        divisions: divisionRows
    }
}

// ---------------------------------------------------------------------------
// Search users
// ---------------------------------------------------------------------------

export const searchUsersForRef = withAction(
    async (query: string): Promise<ActionResult<UserSearchResultRef[]>> => {
        await requireRefsAccess()
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

export const addSeasonRef = withAction(
    async (userId: string): Promise<ActionResult> => {
        const session = await requireSession()
        await requireRefsAccess()
        const config = await requireSeasonConfig()
        requireNonEmptyString(userId, "User ID")

        // Check if already a ref this season
        const [existing] = await db
            .select({ id: seasonRefs.id })
            .from(seasonRefs)
            .where(
                and(
                    eq(seasonRefs.season_id, config.seasonId),
                    eq(seasonRefs.user_id, userId)
                )
            )
            .limit(1)

        if (existing) {
            return fail("User is already a ref for this season.")
        }

        // Get active divisions for default max level
        const activeDivisions = await db
            .select({ level: divisions.level })
            .from(divisions)
            .where(eq(divisions.active, true))
            .orderBy(desc(divisions.level))
            .limit(1)

        const highestLevel = activeDivisions[0]?.level ?? 1

        let isCertified = false
        let hasW9 = false
        let maxDivisionLevel = highestLevel

        // Use previous season values if they exist and are from a different season
        const [prevSeasonRef] = await db
            .select({
                isCertified: seasonRefs.is_certified,
                hasW9: seasonRefs.has_w9,
                maxDivisionLevel: seasonRefs.max_division_level,
                seasonId: seasonRefs.season_id
            })
            .from(seasonRefs)
            .innerJoin(seasons, eq(seasonRefs.season_id, seasons.id))
            .where(eq(seasonRefs.user_id, userId))
            .orderBy(desc(seasons.id))
            .limit(1)

        if (prevSeasonRef && prevSeasonRef.seasonId !== config.seasonId) {
            isCertified = prevSeasonRef.isCertified
            hasW9 = prevSeasonRef.hasW9
            maxDivisionLevel = prevSeasonRef.maxDivisionLevel
        }

        await db.insert(seasonRefs).values({
            season_id: config.seasonId,
            user_id: userId,
            is_certified: isCertified,
            has_w9: hasW9,
            max_division_level: maxDivisionLevel
        })

        // Grant referee RBAC role for this season
        await grantRole(userId, "referee", {
            seasonId: config.seasonId,
            grantedBy: session.user.id
        })

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
// Remove season ref
// ---------------------------------------------------------------------------

export const removeSeasonRef = withAction(
    async (seasonRefId: number): Promise<ActionResult> => {
        const session = await requireSession()
        await requireRefsAccess()
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
        maxDivisionLevel: number
    ): Promise<ActionResult> => {
        const session = await requireSession()
        await requireRefsAccess()
        const id = requirePositiveInt(seasonRefId, "Season ref ID")
        const level = requirePositiveInt(maxDivisionLevel, "Max division level")

        await db
            .update(seasonRefs)
            .set({
                is_certified: isCertified,
                has_w9: hasW9,
                max_division_level: level
            })
            .where(eq(seasonRefs.id, id))

        await logAuditEntry({
            userId: session.user.id,
            action: "update",
            entityType: "season_refs",
            entityId: String(id),
            summary: `Updated ref ${id}: certified=${isCertified}, w9=${hasW9}, maxLevel=${level}`
        })

        revalidatePath("/dashboard/select-refs")
        return ok()
    }
)
