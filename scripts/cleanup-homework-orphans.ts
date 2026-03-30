/**
 * Removes draft_homework entries for players who are no longer signed up
 * for a given season. Run this after manually deleting signups without
 * going through the normal admin UI (which handles cleanup automatically).
 *
 * Usage:
 *   npx tsx scripts/cleanup-homework-orphans.ts [seasonId]
 *
 * If no seasonId is provided, the script will list available seasons and prompt.
 */
import "dotenv/config"
import * as readline from "node:readline"
import { drizzle } from "drizzle-orm/node-postgres"
import { draftHomework, signups, seasons } from "../src/database/schema"
import { eq, inArray, sql } from "drizzle-orm"

async function prompt(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close()
            resolve(answer)
        })
    })
}

async function main() {
    const db = drizzle(process.env.DATABASE_URL!)

    // Determine target season
    let targetSeasonId: number | null = null

    const argSeasonId = process.argv[2]
    if (argSeasonId) {
        const parsed = Number.parseInt(argSeasonId, 10)
        if (!Number.isFinite(parsed) || parsed <= 0) {
            console.error(`Invalid seasonId argument: ${argSeasonId}`)
            process.exit(1)
        }
        targetSeasonId = parsed
    } else {
        // List available seasons
        const allSeasons = await db
            .select({
                id: seasons.id,
                code: seasons.code,
                year: seasons.year,
                season: seasons.season
            })
            .from(seasons)
            .orderBy(sql`${seasons.id} DESC`)
            .limit(10)

        if (allSeasons.length === 0) {
            console.error("No seasons found in the database.")
            process.exit(1)
        }

        console.log("\nAvailable seasons:")
        for (const s of allSeasons) {
            console.log(`  ${s.id}: ${s.year} ${s.season} (${s.code})`)
        }

        const answer = await prompt(
            "\nEnter season ID to clean up (or 'all' for all seasons): "
        )

        if (answer.trim().toLowerCase() === "all") {
            targetSeasonId = null
        } else {
            const parsed = Number.parseInt(answer.trim(), 10)
            if (!Number.isFinite(parsed) || parsed <= 0) {
                console.error("Invalid input.")
                process.exit(1)
            }
            targetSeasonId = parsed
        }
    }

    // Find homework entries with players not in signups for that season
    const seasonLabel =
        targetSeasonId !== null ? `season ${targetSeasonId}` : "all seasons"
    console.log(
        `\nScanning draft_homework for orphaned entries in ${seasonLabel}...`
    )

    const homeworkQuery = db
        .select({
            id: draftHomework.id,
            season: draftHomework.season,
            player: draftHomework.player,
            captain: draftHomework.captain
        })
        .from(draftHomework)

    const allHomework =
        targetSeasonId !== null
            ? await homeworkQuery.where(
                  eq(draftHomework.season, targetSeasonId)
              )
            : await homeworkQuery

    if (allHomework.length === 0) {
        console.log("No homework entries found. Nothing to clean up.")
        return
    }

    // Get unique season IDs referenced in homework
    const seasonIds = [...new Set(allHomework.map((h) => h.season))]

    // For each season, get signed-up player IDs
    const signedUpRows = await db
        .select({ season: signups.season, player: signups.player })
        .from(signups)
        .where(inArray(signups.season, seasonIds))

    const signedUpSet = new Set(
        signedUpRows.map((r) => `${r.season}:${r.player}`)
    )

    // Find orphaned homework entries
    const orphans = allHomework.filter(
        (h) => !signedUpSet.has(`${h.season}:${h.player}`)
    )

    if (orphans.length === 0) {
        console.log(
            "✓ No orphaned homework entries found. All players are still signed up."
        )
        return
    }

    // Group orphans for display
    const bySeason = new Map<number, typeof orphans>()
    for (const o of orphans) {
        const list = bySeason.get(o.season) ?? []
        list.push(o)
        bySeason.set(o.season, list)
    }

    console.log(`\nFound ${orphans.length} orphaned homework entries:\n`)
    for (const [seasonId, entries] of bySeason) {
        const uniquePlayers = [...new Set(entries.map((e) => e.player))]
        console.log(
            `  Season ${seasonId}: ${entries.length} entries across ${uniquePlayers.length} player(s)`
        )
        for (const playerId of uniquePlayers) {
            const playerEntries = entries.filter((e) => e.player === playerId)
            console.log(
                `    - Player ${playerId}: ${playerEntries.length} homework slot(s)`
            )
        }
    }

    const confirm = await prompt("\nDelete these orphaned entries? (yes/no): ")
    if (confirm.trim().toLowerCase() !== "yes") {
        console.log("Aborted. No changes made.")
        return
    }

    const orphanIds = orphans.map((o) => o.id)
    await db.delete(draftHomework).where(inArray(draftHomework.id, orphanIds))

    console.log(`\n✓ Deleted ${orphanIds.length} orphaned homework entries.`)
}

main().catch((err) => {
    console.error("Error:", err)
    process.exit(1)
})
