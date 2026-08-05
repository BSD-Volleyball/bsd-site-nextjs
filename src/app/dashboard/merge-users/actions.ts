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
    oldUser: MergeAccountSnapshot
    newUser: MergeAccountSnapshot
    /** Pre-ticked choices the admin reviews rather than makes from scratch. */
    defaults: MergeSelection
}

// Both sides of the merge form draw from the same pool: any account may be
// merged into any other, in either direction.
//
// The guard lives in each exported action rather than here, so that
// authorization is enforced at the action boundary as AGENTS.md requires --
// and so scripts/security/authz-regression-check.js can see it. A guard behind
// a delegate is invisible to that check, which is the point of the check.
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

export async function getOldUsers(): Promise<UserOption[]> {
    const user = await getSessionUser()
    if (!user || !(await isAdminOrDirector(user.id))) {
        return []
    }
    return listMergeableUsers()
}

export async function getNewUsers(): Promise<UserOption[]> {
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
        oldUserId: string,
        newUserId: string
    ): Promise<ActionResult<MergeCandidates>> => {
        const session = await requireSession()
        if (!(await isAdminOrDirector(session.user.id))) {
            return fail("Access denied.")
        }

        const oldId = requireNonEmptyString(oldUserId, "Old user")
        const newId = requireNonEmptyString(newUserId, "New user")

        if (oldId === newId) {
            return fail("Cannot merge a user with themselves.")
        }

        const [oldRow] = await db
            .select()
            .from(users)
            .where(eq(users.id, oldId))
            .limit(1)
        if (!oldRow) {
            return fail("Old user not found.")
        }

        const [newRow] = await db
            .select()
            .from(users)
            .where(eq(users.id, newId))
            .limit(1)
        if (!newRow) {
            return fail("New user not found.")
        }

        const [oldSnapshot, newSnapshot] = await Promise.all([
            snapshot(oldRow),
            snapshot(newRow)
        ])

        return ok({
            oldUser: oldSnapshot,
            newUser: newSnapshot,
            defaults: resolveDefaultSelections(
                oldSnapshot.fields,
                newSnapshot.fields
            )
        })
    }
)

/**
 * Turn the client's choice tokens into a column patch.
 *
 * The client sends only "old"/"new" per field, never values, so nothing
 * user-supplied reaches the UPDATE. Unknown keys, bad tokens, and choices that
 * would not change anything are dropped.
 */
function buildSurvivorPatch(
    selection: MergeSelection,
    oldRow: UserRow,
    newRow: UserRow
): { patch: Partial<UserRow>; takenFromOld: MergeFieldKey[] } {
    const patch: Record<string, unknown> = {}
    const takenFromOld: MergeFieldKey[] = []

    for (const [rawKey, rawChoice] of Object.entries(selection)) {
        if (!isMergeFieldKey(rawKey) || !isMergeChoice(rawChoice)) {
            continue
        }
        if (rawChoice !== "old") {
            // "new" means keep what the survivor already stores -- no write.
            continue
        }

        const key = rawKey as keyof UserRow
        if (oldRow[key] === newRow[key]) {
            continue
        }

        patch[key] = oldRow[key]
        takenFromOld.push(rawKey)
    }

    return { patch: patch as Partial<UserRow>, takenFromOld }
}

export const mergeUsers = withAction(
    async (
        oldUserId: string,
        newUserId: string,
        selection: MergeSelection = {}
    ): Promise<ActionResult> => {
        const session = await requireSession()

        const hasAccess = await isAdminOrDirector(session.user.id)
        if (!hasAccess) {
            return fail("Access denied.")
        }

        const oldId = requireNonEmptyString(oldUserId, "Old user")
        const newId = requireNonEmptyString(newUserId, "New user")

        if (oldId === newId) {
            return fail("Cannot merge a user with themselves.")
        }

        try {
            const [oldUser] = await db
                .select()
                .from(users)
                .where(eq(users.id, oldId))
                .limit(1)

            if (!oldUser) {
                return fail("Old user not found.")
            }

            const [newUser] = await db
                .select()
                .from(users)
                .where(eq(users.id, newId))
                .limit(1)

            if (!newUser) {
                return fail("New user not found.")
            }

            const { patch, takenFromOld } = buildSurvivorPatch(
                selection,
                oldUser,
                newUser
            )

            // The survivor is adopting the deleted account's address, so the
            // logins that authenticate as that address have to come with it.
            const moveAuthAccounts = patch.email !== undefined

            await mergeUserRecords(oldId, newId, {
                copyIdentity: false,
                survivorPatch: patch,
                moveAuthAccounts
            })

            const kept =
                takenFromOld.length > 0
                    ? `kept from deleted account: ${takenFromOld.join(", ")}`
                    : "kept no fields from the deleted account"
            const auth = moveAuthAccounts ? "; login methods moved" : ""

            await logAuditEntry({
                userId: session.user.id,
                action: "merge",
                entityType: "users",
                entityId: newId,
                summary: `Merged user ${oldId} into ${newId} (old user deleted); ${kept}${auth}`
            })

            revalidatePath("/dashboard/merge-users")
            return ok(undefined, "Users merged successfully.")
        } catch (error) {
            console.error("Error merging users:", error)
            return fail("Something went wrong while merging users.")
        }
    }
)
