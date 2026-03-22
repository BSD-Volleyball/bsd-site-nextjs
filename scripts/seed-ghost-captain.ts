/**
 * Run with: npx tsx scripts/seed-ghost-captain.ts
 *
 * Inserts the ghost-captain sentinel user record if it does not already exist.
 * This record is used when a team slot has no confirmed captain available at
 * draft time — commissioners draft for "ghost" teams in their place.
 */

// Load env: check .env.local first (Next.js convention), fall back to .env
import { config } from "dotenv"
config({ path: ".env.local" })
config() // no-op if already loaded
import { db } from "../src/database/db"
import { users } from "../src/database/schema"
import { eq } from "drizzle-orm"
import { GHOST_CAPTAIN_ID } from "../src/lib/ghost-captain"

async function main() {
    const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, GHOST_CAPTAIN_ID))
        .limit(1)

    if (existing) {
        console.log("Ghost captain already exists — skipping.")
        return
    }

    await db.insert(users).values({
        id: GHOST_CAPTAIN_ID,
        name: "Ghost Captain",
        first_name: "Ghost",
        last_name: "Captain",
        email: "ghost@system.internal",
        emailVerified: false,
        seasons_list: "false",
        notification_list: "false",
        captain_eligible: false,
        onboarding_completed: true,
        createdAt: new Date(),
        updatedAt: new Date()
    })

    console.log("Ghost captain inserted successfully.")
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
