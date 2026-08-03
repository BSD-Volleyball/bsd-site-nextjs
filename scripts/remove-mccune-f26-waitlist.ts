#!/usr/bin/env tsx
// Removes Connor McCune's Fall 2026 waitlist entry.
//
// Registration was gated on phase === "registration_open", so advancing F26 to
// select_commissioners closed signups even though the season was under its
// 280-player cap (fixed in 79e47dc). During that window the dashboard offered
// the waitlist instead of the signup flow, and Connor joined it at
// 2026-08-03 14:55 EDT -- ~45 minutes before the fix landed. He is the only
// waitlist row for the season, so no one else was caught by the same gap.
//
// The waitlist row is an artifact of the bug, not a real request: the season
// still has open capacity and registration reopened, so he should sign up
// normally rather than sit behind an approval step. There is no delete path in
// the admin UI (view-waitlist/actions.ts exposes approve/unapprove only), hence
// this script.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/remove-mccune-f26-waitlist.ts
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/remove-mccune-f26-waitlist.ts --apply
//
// Read-only unless --apply. Idempotent: exits cleanly if the row is already gone.

import "dotenv/config"
import { and, eq } from "drizzle-orm"
import { db } from "../src/database/db"
import { userRoles, users, waitlist } from "../src/database/schema"
import { logAuditEntry } from "../src/lib/audit-log"

const TARGET_ID = "U345jkfQv7ML47xuBq2bTCms8XrHUruk"
const TARGET_EMAIL = "connormccune3@gmail.com"
const SEASON_ID = 69 // F26

/** audit_log.user is NOT NULL with an FK, so the run needs a real admin. */
const ACTOR_EMAIL = "jlukens@botch.com"

const apply = process.argv.includes("--apply")

async function main() {
    console.log(
        `mode: ${apply ? "APPLY (will write)" : "DRY RUN (read-only)"}\n`
    )

    const [entry] = await db
        .select({
            id: waitlist.id,
            approved: waitlist.approved,
            created_at: waitlist.created_at,
            email: users.email,
            name: users.name
        })
        .from(waitlist)
        .innerJoin(users, eq(users.id, waitlist.user))
        .where(
            and(eq(waitlist.user, TARGET_ID), eq(waitlist.season, SEASON_ID))
        )
        .limit(1)

    if (!entry) {
        console.log(
            `no season ${SEASON_ID} waitlist row for ${TARGET_ID} — nothing to do`
        )
        return
    }

    // Ids are opaque; confirm this is the account the script was written for
    // before deleting a real member's row.
    if (entry.email !== TARGET_EMAIL)
        throw new Error(
            `${TARGET_ID} is ${entry.email}, expected ${TARGET_EMAIL}`
        )

    const [actor] = await db
        .select({ id: users.id })
        .from(userRoles)
        .innerJoin(users, eq(users.id, userRoles.user_id))
        .where(and(eq(users.email, ACTOR_EMAIL), eq(userRoles.role, "admin")))
        .limit(1)
    if (!actor) throw new Error(`no admin account for ${ACTOR_EMAIL}`)

    console.log(
        `  delete waitlist #${entry.id}: ${entry.name} <${entry.email}>, ` +
            `approved=${entry.approved}, joined ${entry.created_at.toISOString()}`
    )

    if (!apply) {
        console.log("\nDry run. Re-run with --apply to write.")
        return
    }

    await db.transaction(async (tx) => {
        await tx.delete(waitlist).where(eq(waitlist.id, entry.id))

        await logAuditEntry(
            {
                userId: actor.id,
                action: "delete",
                entityType: "waitlist",
                entityId: entry.id.toString(),
                summary:
                    `Removed waitlist entry for user ${TARGET_ID} — joined while ` +
                    `F26 registration was inadvertently closed by the phase gate`
            },
            tx
        )
    })

    console.log("\nApplied.")
}

main().catch((e) => {
    console.error(e.message ?? e)
    process.exit(1)
})
