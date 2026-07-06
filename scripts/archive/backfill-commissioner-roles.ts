import "dotenv/config"

/**
 * Backfill the user_roles table from the legacy commissioners table so
 * user_roles becomes the sole authority for commissioner assignments.
 *
 * Idempotent: skips rows that already exist (same dedupe rule as
 * rbac.grantRole, inlined because rbac.ts pulls in server-only modules).
 *
 * Run with:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/backfill-commissioner-roles.ts
 */

import { db } from "../src/database/db"
import { commissioners, userRoles } from "../src/database/schema"
import { and, eq } from "drizzle-orm"

async function main() {
    const legacyRows = await db
        .select({
            season: commissioners.season,
            commissioner: commissioners.commissioner,
            division: commissioners.division
        })
        .from(commissioners)

    console.log(`Legacy commissioners rows: ${legacyRows.length}`)

    let created = 0
    let existing = 0
    for (const row of legacyRows) {
        const [already] = await db
            .select({ id: userRoles.id })
            .from(userRoles)
            .where(
                and(
                    eq(userRoles.user_id, row.commissioner),
                    eq(userRoles.role, "commissioner"),
                    eq(userRoles.season_id, row.season),
                    eq(userRoles.division_id, row.division)
                )
            )
            .limit(1)

        if (already) {
            existing++
            continue
        }

        await db.insert(userRoles).values({
            user_id: row.commissioner,
            role: "commissioner",
            season_id: row.season,
            division_id: row.division,
            granted_by: null
        })
        created++
    }

    // Reconciliation: per-season counts in both tables
    const roleRows = await db
        .select({
            seasonId: userRoles.season_id,
            userId: userRoles.user_id,
            divisionId: userRoles.division_id
        })
        .from(userRoles)
        .where(eq(userRoles.role, "commissioner"))

    const legacyBySeason = new Map<number, number>()
    for (const r of legacyRows) {
        legacyBySeason.set(r.season, (legacyBySeason.get(r.season) ?? 0) + 1)
    }
    const rolesBySeason = new Map<string, number>()
    for (const r of roleRows) {
        const key = r.seasonId === null ? "global" : String(r.seasonId)
        rolesBySeason.set(key, (rolesBySeason.get(key) ?? 0) + 1)
    }

    console.log(`Created: ${created}, already present: ${existing}`)
    console.log("Per-season counts (legacy commissioners vs user_roles):")
    const seasons = new Set([
        ...legacyBySeason.keys(),
        ...[...rolesBySeason.keys()].filter((k) => k !== "global").map(Number)
    ])
    for (const s of [...seasons].sort((a, b) => a - b)) {
        console.log(
            `  season ${s}: legacy=${legacyBySeason.get(s) ?? 0} roles=${rolesBySeason.get(String(s)) ?? 0}`
        )
    }
    if (rolesBySeason.has("global")) {
        console.log(
            `  league-wide (season NULL) commissioner roles: ${rolesBySeason.get("global")}`
        )
    }
    process.exit(0)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
