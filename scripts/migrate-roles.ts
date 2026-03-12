/**
 * migrate-roles.ts
 *
 * One-off migration: populates the new user_roles table from the three
 * legacy role sources:
 *   1. users.role column ("admin" / "director") → global admin role
 *   2. commissioners table (season + division) → commissioner roles
 *   3. teams table (captain per team) → captain roles
 *
 * Safe to run multiple times — uses grantRole which skips duplicates.
 *
 * Run: npx tsx scripts/migrate-roles.ts
 */

import "dotenv/config"
import { db } from "../src/database/db"
import { commissioners, teams, users } from "../src/database/schema"
import { grantRole } from "../src/lib/rbac"
import { isNotNull } from "drizzle-orm"

async function main() {
    console.log("Starting role migration...")

    // 1. Migrate admin/director users
    const adminUsers = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(isNotNull(users.role))

    let adminCount = 0
    for (const user of adminUsers) {
        if (user.role === "admin" || user.role === "director") {
            // Both map to "admin" in the new system (they were always identical)
            await grantRole(user.id, "admin")
            adminCount++
            console.log(`  admin: ${user.id} (was ${user.role})`)
        }
    }
    console.log(`Migrated ${adminCount} admin/director users.`)

    // 2. Migrate commissioners
    const commissionerRows = await db
        .select({
            userId: commissioners.commissioner,
            seasonId: commissioners.season,
            divisionId: commissioners.division
        })
        .from(commissioners)

    let commissionerCount = 0
    for (const row of commissionerRows) {
        await grantRole(row.userId, "commissioner", {
            seasonId: row.seasonId,
            divisionId: row.divisionId
        })
        commissionerCount++
    }
    console.log(`Migrated ${commissionerCount} commissioner assignments.`)

    // 3. Migrate captains
    const teamRows = await db
        .select({
            captainId: teams.captain,
            seasonId: teams.season,
            divisionId: teams.division
        })
        .from(teams)

    let captainCount = 0
    for (const row of teamRows) {
        await grantRole(row.captainId, "captain", {
            seasonId: row.seasonId,
            divisionId: row.divisionId
        })
        captainCount++
    }
    console.log(`Migrated ${captainCount} captain assignments.`)

    console.log("\nRole migration complete.")
    console.log(`  ${adminCount} admin roles`)
    console.log(`  ${commissionerCount} commissioner roles`)
    console.log(`  ${captainCount} captain roles`)
}

main().catch((err) => {
    console.error("Migration failed:", err)
    process.exit(1)
})
