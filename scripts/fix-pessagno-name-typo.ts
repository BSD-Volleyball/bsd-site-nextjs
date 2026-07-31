#!/usr/bin/env tsx
// Corrects a typo in Jo Ann Pessagno's stored first name: "Jo Annn" -> "Jo Ann".
//
// Surfaced while restoring the S23/AB draft order, where the archived roster
// page spells her "Pessagno, Jo Ann (Capt)". The extra 'n' had propagated into
// two columns, because `users.name` -- better-auth's display name -- is
// maintained as `"${first_name} ${last_name}".trim()` and is written alongside
// first_name on every profile edit (src/app/dashboard/settings/actions.ts).
// Updating only first_name would leave the misspelling showing wherever the
// session's display name is rendered, so both move together here.
//
// The audit entry mirrors what the settings action writes, so the change is
// attributable rather than appearing as an unexplained drift in the profile.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/fix-pessagno-name-typo.ts
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/fix-pessagno-name-typo.ts --apply
//
// Read-only unless --apply. Idempotent: the WHERE clause matches only the typo.

import "dotenv/config"
import { and, eq } from "drizzle-orm"
import { db } from "../src/database/db"
import { userRoles, users } from "../src/database/schema"
import { logAuditEntry } from "../src/lib/audit-log"

const TARGET_ID = "7mAgPZJxRyUrxxMsjnr2ywVF4j232ZnD"
const TARGET_EMAIL = "joann423@gmail.com"
const WRONG = "Jo Annn"
const RIGHT = "Jo Ann"

/** audit_log.user is NOT NULL with an FK, so the run needs a real admin. */
const ACTOR_EMAIL = "jlukens@botch.com"

const apply = process.argv.includes("--apply")

async function main() {
    console.log(
        `mode: ${apply ? "APPLY (will write)" : "DRY RUN (read-only)"}\n`
    )

    const [target] = await db
        .select({
            id: users.id,
            email: users.email,
            name: users.name,
            first_name: users.first_name,
            last_name: users.last_name
        })
        .from(users)
        .where(eq(users.id, TARGET_ID))
        .limit(1)

    if (!target) throw new Error(`user ${TARGET_ID} not found`)
    // Ids are opaque; confirm this is the account the script was written for
    // before rewriting a real member's name.
    if (target.email !== TARGET_EMAIL)
        throw new Error(
            `${TARGET_ID} is ${target.email}, expected ${TARGET_EMAIL}`
        )

    if (target.first_name !== WRONG) {
        console.log(
            `first_name is already "${target.first_name}" — nothing to do`
        )
        return
    }

    const [actor] = await db
        .select({ id: users.id })
        .from(userRoles)
        .innerJoin(users, eq(users.id, userRoles.user_id))
        .where(and(eq(users.email, ACTOR_EMAIL), eq(userRoles.role, "admin")))
        .limit(1)
    if (!actor) throw new Error(`no admin account for ${ACTOR_EMAIL}`)

    const name = `${RIGHT} ${target.last_name}`.trim()
    console.log(`  first_name: "${target.first_name}" -> "${RIGHT}"`)
    console.log(`  name:       "${target.name}" -> "${name}"`)

    if (!apply) {
        console.log("\nDry run. Re-run with --apply to write.")
        return
    }

    await db.transaction(async (tx) => {
        await tx
            .update(users)
            .set({ first_name: RIGHT, name, updatedAt: new Date() })
            .where(and(eq(users.id, TARGET_ID), eq(users.first_name, WRONG)))

        await logAuditEntry(
            {
                userId: actor.id,
                action: "update",
                entityType: "users",
                entityId: TARGET_ID,
                summary: `Corrected first name typo "${WRONG}" -> "${RIGHT}"`
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
