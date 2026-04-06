/**
 * resend-bulk-sync.ts
 *
 * One-time script to bootstrap Resend with all existing users and
 * current-season segments. Run after applying the schema migration.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/resend-bulk-sync.ts
 */

import "dotenv/config"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import {
    syncUserToResend,
    ensureTopics,
    ensureSegment
} from "@/lib/resend-sync"

async function main() {
    console.log("=== Resend Bulk Sync ===\n")

    // 1. Ensure topics exist
    console.log("Creating topics...")
    const topics = await ensureTopics()
    console.log(`  General Updates: ${topics.generalUpdatesId ?? "FAILED"}`)
    console.log(`  In Season Updates: ${topics.inSeasonUpdatesId ?? "FAILED"}`)

    // 2. Ensure "All Users" segment exists
    console.log("\nEnsuring 'All Users' segment...")
    const allUsersSegmentId = await ensureSegment("all_users", {
        name: "All Users"
    })
    console.log(`  All Users segment: ${allUsersSegmentId ?? "FAILED"}`)

    // 3. Load all users with emails
    console.log("\nLoading users...")
    const allUsers = await db
        .select({
            id: users.id,
            email: users.email,
            first_name: users.first_name,
            last_name: users.last_name
        })
        .from(users)

    console.log(`  Found ${allUsers.length} users\n`)

    // 4. Sync each user (includes season segments if applicable)
    let synced = 0
    let failed = 0

    for (const user of allUsers) {
        try {
            await syncUserToResend(user.id)
            synced++
            if (synced % 10 === 0) {
                console.log(
                    `  Progress: ${synced}/${allUsers.length} synced...`
                )
            }
        } catch (err) {
            console.error(`  FAILED for user ${user.id} (${user.email}):`, err)
            failed++
        }
    }

    console.log(`\n=== Complete ===`)
    console.log(`  Synced: ${synced}`)
    console.log(`  Failed: ${failed}`)

    process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
    console.error("Fatal error:", err)
    process.exit(1)
})
