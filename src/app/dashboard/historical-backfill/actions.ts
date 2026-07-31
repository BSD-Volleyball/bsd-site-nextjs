"use server"

import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import {
    type ActionResult,
    fail,
    ok,
    requireAdmin,
    requireNonEmptyString,
    requireSession,
    withAction
} from "@/lib/action-helpers"
import { logAuditEntry } from "@/lib/audit-log"
import {
    type HistoricalCoverage,
    fetchHistoricalCoverage
} from "@/lib/historical-coverage"
import {
    type LegacyAccount,
    type MergeTarget,
    fetchLegacyAccounts,
    fetchMergeTargets
} from "@/lib/legacy-accounts"
import { isLegacyEmail } from "@/lib/legacy-matching"
import { mergeUserRecords } from "@/lib/merge-users"

/**
 * Live coverage of the historical backfill. Read-only, but admin-gated like
 * every other exported action: it exposes the full season roster/match census.
 */
export const getHistoricalCoverage = withAction(
    async (): Promise<ActionResult<HistoricalCoverage>> => {
        await requireAdmin()
        return ok(await fetchHistoricalCoverage())
    }
)

/**
 * The `legacy-*` placeholder accounts the archive backfill minted for players
 * it could not bind to a real member, each with a suggested match.
 */
export const getLegacyAccounts = withAction(
    async (): Promise<ActionResult<LegacyAccount[]>> => {
        await requireAdmin()
        return ok(await fetchLegacyAccounts())
    }
)

/**
 * Every real member account, for the "map to" picker. Fetched on demand rather
 * than shipped with the page: it is ~2,000 rows that most visits never open.
 */
export const getMergeTargets = withAction(
    async (): Promise<ActionResult<MergeTarget[]>> => {
        await requireAdmin()
        return ok(await fetchMergeTargets())
    }
)

/**
 * Fold a legacy placeholder into the real member it belongs to: every record
 * moves across, then the placeholder is deleted.
 *
 * The two email checks are the safety rail that makes a one-click row button
 * acceptable. Whatever ids arrive, this action can only ever delete a
 * placeholder account, never a real member's -- so a stale page, a mistyped id
 * or a replayed request cannot cost anyone their account.
 */
export const mergeLegacyAccount = withAction(
    async (
        legacyUserId: unknown,
        targetUserId: unknown
    ): Promise<ActionResult> => {
        const session = await requireSession()
        await requireAdmin()

        const legacyId = requireNonEmptyString(legacyUserId, "Legacy account")
        const targetId = requireNonEmptyString(targetUserId, "Target account")

        if (legacyId === targetId) {
            return fail("Cannot merge an account with itself.")
        }

        const [legacyUser] = await db
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(eq(users.id, legacyId))
            .limit(1)
        if (!legacyUser) {
            return fail("Legacy account not found.")
        }
        if (!isLegacyEmail(legacyUser.email)) {
            return fail(
                "That account is a real member, not a legacy placeholder. Use Merge Users instead."
            )
        }

        const [targetUser] = await db
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(eq(users.id, targetId))
            .limit(1)
        if (!targetUser) {
            return fail("Target account not found.")
        }
        if (isLegacyEmail(targetUser.email)) {
            return fail("Cannot merge one legacy placeholder into another.")
        }

        // copyIdentity: false — a placeholder carries a freshly-issued old_id
        // and no picture, so copying them would overwrite the real member's
        // legacy id and erase their photo.
        await mergeUserRecords(legacyId, targetId, { copyIdentity: false })

        await logAuditEntry({
            userId: session.user.id,
            action: "merge",
            entityType: "users",
            entityId: targetId,
            summary: `Merged legacy account ${legacyUser.email} into ${targetUser.email} (legacy account deleted)`
        })

        revalidatePath("/dashboard/historical-backfill")
        return ok(undefined, "Legacy account merged.")
    }
)
