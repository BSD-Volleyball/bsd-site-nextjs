"use server"

import { db } from "@/database/db"
import {
    accounts,
    seasons,
    sessions,
    signups,
    teams,
    userRoles,
    users
} from "@/database/schema"
import { asc, desc, eq, ne, or } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import type { ActionResult } from "@/lib/action-helpers"
import {
    fail,
    ok,
    requireNonEmptyString,
    requireSession,
    withAction
} from "@/lib/action-helpers"
import { logAuditEntry } from "@/lib/audit-log"
import { GHOST_CAPTAIN_ID } from "@/lib/ghost-captain"
import type {
    MergeChoice,
    MergeDefaultsContext,
    MergeFieldKey,
    MergeFieldValues,
    MergeSelection
} from "@/lib/merge-user-fields"
import {
    isMergeChoice,
    isMergeFieldKey,
    MERGE_FIELDS,
    resolveDefaultSelections
} from "@/lib/merge-user-fields"
import { mergeUserRecords } from "@/lib/merge-users"
import { getSessionUser, isAdminOrDirector } from "@/lib/rbac"
import { formatDisplayName } from "@/lib/utils"

export interface UserOption {
    id: string
    name: string
    email: string
    phone: string | null
    createdAt: Date
}

/** What each account brings to the merge, beyond the field values themselves. */
export interface MergeAccountActivity {
    createdAt: Date
    updatedAt: Date
    signupCount: number
    firstSeasonCode: string | null
    lastSeasonCode: string | null
    lastLoginAt: Date | null
    teamsCaptained: number
    roleCount: number
    /** better-auth provider ids, e.g. ["google", "credential"]. */
    loginMethods: string[]
}

export interface MergeAccountSnapshot {
    id: string
    displayName: string
    /** Every mergeable column, keyed as in MERGE_FIELDS. */
    fields: MergeFieldValues
    activity: MergeAccountActivity
}

export interface MergeCandidates {
    userA: MergeAccountSnapshot
    userB: MergeAccountSnapshot
    /** Pre-ticked choices the admin reviews rather than makes from scratch. */
    defaults: MergeSelection
}

/**
 * Every account, for both pickers. The two sides are symmetric -- there is no
 * "old" and "new" -- so one list serves both.
 *
 * The authorization guard is inlined in the exported action below rather than
 * living here, so that it is enforced at the action boundary as AGENTS.md
 * requires and so scripts/security/authz-regression-check.js can see it. A
 * guard behind a delegate is invisible to that check, which is the point of
 * the check.
 */
async function listMergeableUsers(): Promise<UserOption[]> {
    const results = await db
        .select({
            id: users.id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            email: users.email,
            phone: users.phone,
            createdAt: users.createdAt
        })
        .from(users)
        .where(ne(users.id, GHOST_CAPTAIN_ID))
        .orderBy(users.last_name, users.first_name)

    return results.map((u) => ({
        id: u.id,
        name: formatDisplayName(u.firstName, u.lastName, u.preferredName),
        email: u.email,
        phone: u.phone,
        createdAt: u.createdAt
    }))
}

export async function getMergeableUsers(): Promise<UserOption[]> {
    const user = await getSessionUser()
    if (!user || !(await isAdminOrDirector(user.id))) {
        return []
    }
    return listMergeableUsers()
}

type UserRow = typeof users.$inferSelect

function toFieldValues(row: UserRow): MergeFieldValues {
    const values = {} as MergeFieldValues
    for (const field of MERGE_FIELDS) {
        values[field.key] = row[field.key as keyof UserRow]
    }
    return values
}

async function loadActivity(row: UserRow): Promise<MergeAccountActivity> {
    const [signupRows, lastSession, captainRows, roleRows, accountRows] =
        await Promise.all([
            db
                .select({ code: seasons.code, id: seasons.id })
                .from(signups)
                .innerJoin(seasons, eq(signups.season, seasons.id))
                .where(eq(signups.player, row.id))
                .orderBy(asc(seasons.id)),
            db
                .select({ createdAt: sessions.createdAt })
                .from(sessions)
                .where(eq(sessions.userId, row.id))
                .orderBy(desc(sessions.createdAt))
                .limit(1),
            db
                .select({ id: teams.id })
                .from(teams)
                .where(
                    or(eq(teams.captain, row.id), eq(teams.captain2, row.id))
                ),
            db
                .select({ id: userRoles.id })
                .from(userRoles)
                .where(eq(userRoles.user_id, row.id)),
            db
                .select({ providerId: accounts.providerId })
                .from(accounts)
                .where(eq(accounts.userId, row.id))
        ])

    return {
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        signupCount: signupRows.length,
        firstSeasonCode: signupRows[0]?.code ?? null,
        lastSeasonCode: signupRows[signupRows.length - 1]?.code ?? null,
        lastLoginAt: lastSession[0]?.createdAt ?? null,
        teamsCaptained: captainRows.length,
        roleCount: roleRows.length,
        loginMethods: [...new Set(accountRows.map((a) => a.providerId))].sort()
    }
}

/**
 * The non-column facts the default rules need: recency of maintenance, and
 * which account can actually sign in (which decides the email default, and so
 * the survivor).
 */
function defaultsContext(
    userA: MergeAccountSnapshot,
    userB: MergeAccountSnapshot
): MergeDefaultsContext {
    return {
        aUpdatedAt: userA.activity.updatedAt,
        bUpdatedAt: userB.activity.updatedAt,
        aLoginMethodCount: userA.activity.loginMethods.length,
        bLoginMethodCount: userB.activity.loginMethods.length,
        aLastLoginAt: userA.activity.lastLoginAt,
        bLastLoginAt: userB.activity.lastLoginAt
    }
}

async function snapshot(row: UserRow): Promise<MergeAccountSnapshot> {
    return {
        id: row.id,
        displayName: formatDisplayName(
            row.first_name,
            row.last_name,
            row.preferred_name
        ),
        fields: toFieldValues(row),
        activity: await loadActivity(row)
    }
}

/**
 * Load both accounts side by side for step 2 of the merge, along with the
 * choices an admin would usually make.
 *
 * Authorization is inline rather than delegated -- see the note above
 * listMergeableUsers.
 */
export const getMergeCandidateDetails = withAction(
    async (
        userAId: string,
        userBId: string
    ): Promise<ActionResult<MergeCandidates>> => {
        const session = await requireSession()
        if (!(await isAdminOrDirector(session.user.id))) {
            return fail("Access denied.")
        }

        const aId = requireNonEmptyString(userAId, "Player A")
        const bId = requireNonEmptyString(userBId, "Player B")

        if (aId === bId) {
            return fail("Cannot merge a user with themselves.")
        }

        const [aRow] = await db
            .select()
            .from(users)
            .where(eq(users.id, aId))
            .limit(1)
        if (!aRow) {
            return fail("Player A not found.")
        }

        const [bRow] = await db
            .select()
            .from(users)
            .where(eq(users.id, bId))
            .limit(1)
        if (!bRow) {
            return fail("Player B not found.")
        }

        const [aSnapshot, bSnapshot] = await Promise.all([
            snapshot(aRow),
            snapshot(bRow)
        ])

        return ok({
            userA: aSnapshot,
            userB: bSnapshot,
            defaults: resolveDefaultSelections(
                aSnapshot.fields,
                bSnapshot.fields,
                defaultsContext(aSnapshot, bSnapshot)
            )
        })
    }
)

/**
 * Turn the client's choice tokens into a column patch for the surviving row.
 *
 * The client sends only "a"/"b" per field, never values, so nothing
 * user-supplied reaches the UPDATE. Unknown keys, bad tokens, and choices that
 * would not change anything are dropped.
 */
function buildSurvivorPatch(
    selection: MergeSelection,
    survivorRow: UserRow,
    deletedRow: UserRow,
    survivorSide: MergeChoice
): { patch: Partial<UserRow>; takenFromDeleted: MergeFieldKey[] } {
    const patch: Record<string, unknown> = {}
    const takenFromDeleted: MergeFieldKey[] = []

    for (const [rawKey, rawChoice] of Object.entries(selection)) {
        if (!isMergeFieldKey(rawKey) || !isMergeChoice(rawChoice)) {
            continue
        }
        if (rawChoice === survivorSide) {
            // The survivor already stores this value -- no write.
            continue
        }

        const key = rawKey as keyof UserRow
        if (survivorRow[key] === deletedRow[key]) {
            continue
        }

        patch[key] = deletedRow[key]
        takenFromDeleted.push(rawKey)
    }

    return { patch: patch as Partial<UserRow>, takenFromDeleted }
}

/**
 * Merge two accounts the admin picked in either order.
 *
 * The `email` choice decides which row survives: logins live on an account
 * rather than on an address, so keeping the account that owns the chosen
 * address is what makes "auth follows the email" true. The other row's records
 * are moved across and the row itself is deleted, taking its sessions and
 * better-auth logins with it. Every other field is composed onto the survivor
 * from either side.
 */
export const mergeUsers = withAction(
    async (
        userAId: string,
        userBId: string,
        selection: MergeSelection = {}
    ): Promise<ActionResult> => {
        const session = await requireSession()

        const hasAccess = await isAdminOrDirector(session.user.id)
        if (!hasAccess) {
            return fail("Access denied.")
        }

        const aId = requireNonEmptyString(userAId, "Player A")
        const bId = requireNonEmptyString(userBId, "Player B")

        if (aId === bId) {
            return fail("Cannot merge a user with themselves.")
        }

        // users.email is UNIQUE NOT NULL, so the two accounts always differ
        // here and a well-formed selection always carries this choice.
        const survivorSide = selection.email
        if (!isMergeChoice(survivorSide)) {
            return fail("Choose which email address the merged account keeps.")
        }

        try {
            const [aUser] = await db
                .select()
                .from(users)
                .where(eq(users.id, aId))
                .limit(1)

            if (!aUser) {
                return fail("Player A not found.")
            }

            const [bUser] = await db
                .select()
                .from(users)
                .where(eq(users.id, bId))
                .limit(1)

            if (!bUser) {
                return fail("Player B not found.")
            }

            const survivor = survivorSide === "a" ? aUser : bUser
            const deleted = survivorSide === "a" ? bUser : aUser

            const { patch, takenFromDeleted } = buildSurvivorPatch(
                selection,
                survivor,
                deleted,
                survivorSide
            )

            await mergeUserRecords(deleted.id, survivor.id, {
                copyIdentity: false,
                survivorPatch: patch
            })

            const kept =
                takenFromDeleted.length > 0
                    ? `kept from deleted account: ${takenFromDeleted.join(", ")}`
                    : "kept no fields from the deleted account"

            await logAuditEntry({
                userId: session.user.id,
                action: "merge",
                entityType: "users",
                entityId: survivor.id,
                summary: `Merged user ${deleted.id} into ${survivor.id} (deleted account: ${deleted.email}); surviving login email ${survivor.email}; ${kept}`
            })

            revalidatePath("/dashboard/merge-users")
            return ok(undefined, "Users merged successfully.")
        } catch (error) {
            console.error("Error merging users:", error)
            return fail("Something went wrong while merging users.")
        }
    }
)
