/**
 * resend-sync-season-segments.ts
 *
 * Bootstraps all current-season Resend segments (season_signups,
 * season_division, season_team) and populates them from the DB.
 *
 * Uses stored resend_contact_id values — no contact creation API calls —
 * so this is much lighter than a full resync and avoids rate limiting.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx --conditions react-server \
 *     scripts/resend-sync-season-segments.ts
 */

import "dotenv/config"
import { syncCurrentSeasonSegments } from "@/lib/resend-sync"

async function main() {
    console.log("=== Resend Season Segment Sync ===\n")
    console.log(
        "Creating and populating division/team segments from DB drafts...\n"
    )

    await syncCurrentSeasonSegments()

    console.log("\n=== Done ===")
    process.exit(0)
}

main().catch((err) => {
    console.error("Fatal error:", err)
    process.exit(1)
})
