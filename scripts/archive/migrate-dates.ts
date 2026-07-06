/**
 * migrate-dates.ts
 *
 * One-off migration: converts legacy text date/time columns from the
 * current season into the new normalized season_events, event_time_slots,
 * and player_unavailability tables.
 *
 * Only migrates the most recent (current) season.
 *
 * Safe to run multiple times — clears existing events for the season
 * before re-inserting.
 *
 * Run: npx tsx scripts/migrate-dates.ts
 */

import "dotenv/config"
import { db } from "../src/database/db"
import { sql } from "drizzle-orm"

interface LegacySeason {
    [key: string]: unknown
    id: number
    code: string
    year: number
    season: string
    tryout_1_date: string | null
    tryout_1_s1_time: string | null
    tryout_1_s2_time: string | null
    tryout_2_date: string | null
    tryout_2_s1_time: string | null
    tryout_2_s2_time: string | null
    tryout_2_s3_time: string | null
    tryout_3_date: string | null
    tryout_3_s1_time: string | null
    tryout_3_s2_time: string | null
    tryout_3_s3_time: string | null
    season_s1_time: string | null
    season_s2_time: string | null
    season_s3_time: string | null
    season_1_date: string | null
    season_2_date: string | null
    season_3_date: string | null
    season_4_date: string | null
    season_5_date: string | null
    season_6_date: string | null
    captain_select_date: string | null
    draft_1_date: string | null
    draft_2_date: string | null
    draft_3_date: string | null
    draft_4_date: string | null
    draft_5_date: string | null
    draft_6_date: string | null
    playoff_1_date: string | null
    playoff_2_date: string | null
    playoff_3_date: string | null
    late_date: string | null
}

interface LegacySignup {
    [key: string]: unknown
    id: number
    dates_missing: string | null
}

/**
 * Parse a human-readable date string into YYYY-MM-DD format.
 * Handles formats like "Monday, January 13, 2025" and "2025-01-13" and "1/13/2025".
 */
function parseDateToISO(dateStr: string): string | null {
    const trimmed = dateStr.trim()
    if (!trimmed) return null

    // Already ISO format
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed
    }

    // Try parsing with Date constructor
    const d = new Date(trimmed)
    if (!Number.isNaN(d.getTime())) {
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, "0")
        const day = String(d.getDate()).padStart(2, "0")
        return `${year}-${month}-${day}`
    }

    console.warn(`  ⚠ Could not parse date: "${trimmed}"`)
    return null
}

/**
 * Parse a time string into HH:MM:SS format.
 * Handles "7:00", "8:10 PM", "19:00", etc.
 */
function parseTimeToHHMMSS(timeStr: string): string | null {
    const trimmed = timeStr.trim()
    if (!trimmed) return null

    // Already HH:MM:SS
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(trimmed)) {
        return trimmed
    }

    // HH:MM format
    const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
    if (match) {
        let hour = Number.parseInt(match[1], 10)
        const minute = match[2]
        const ampm = match[3]?.toUpperCase()

        if (ampm === "PM" && hour < 12) hour += 12
        if (ampm === "AM" && hour === 12) hour = 0

        return `${String(hour).padStart(2, "0")}:${minute}:00`
    }

    console.warn(`  ⚠ Could not parse time: "${trimmed}"`)
    return null
}

async function main() {
    console.log("Starting date migration...")

    // Read the current season using raw SQL since the schema columns were dropped
    const legacySeasons = await db.execute<LegacySeason>(
        sql`SELECT * FROM seasons ORDER BY id DESC LIMIT 1`
    )

    if (!legacySeasons.rows || legacySeasons.rows.length === 0) {
        console.log("No seasons found. Nothing to migrate.")
        return
    }

    const season = legacySeasons.rows[0]
    console.log(
        `Migrating season: ${season.season} ${season.year} (ID: ${season.id})`
    )

    // Clear existing events for this season (cascade will delete time slots)
    await db.execute(
        sql`DELETE FROM season_events WHERE season_id = ${season.id}`
    )
    console.log("  Cleared existing events.")

    let eventCount = 0
    let slotCount = 0

    // Helper to insert an event and its time slots
    async function insertEvent(
        eventType: string,
        dateStr: string | null,
        sortOrder: number,
        label: string | null,
        timeSlots: { time: string | null; label: string | null }[]
    ) {
        if (!dateStr) return

        const isoDate = parseDateToISO(dateStr)
        if (!isoDate) return

        const result = await db.execute(
            sql`INSERT INTO season_events (season_id, event_type, event_date, sort_order, label)
                VALUES (${season.id}, ${eventType}, ${isoDate}, ${sortOrder}, ${label})
                RETURNING id`
        )
        const eventId = result.rows[0].id as number
        eventCount++

        for (let i = 0; i < timeSlots.length; i++) {
            const ts = timeSlots[i]
            if (!ts.time) continue

            const parsedTime = parseTimeToHHMMSS(ts.time)
            if (!parsedTime) continue

            await db.execute(
                sql`INSERT INTO event_time_slots (event_id, start_time, slot_label, sort_order)
                    VALUES (${eventId}, ${parsedTime}, ${ts.label || `Session ${i + 1}`}, ${i + 1})`
            )
            slotCount++
        }
    }

    // --- Tryouts ---
    await insertEvent("tryout", season.tryout_1_date, 1, "Tryout 1", [
        { time: season.tryout_1_s1_time, label: "Session 1" },
        { time: season.tryout_1_s2_time, label: "Session 2" }
    ])
    await insertEvent("tryout", season.tryout_2_date, 2, "Tryout 2", [
        { time: season.tryout_2_s1_time, label: "Session 1" },
        { time: season.tryout_2_s2_time, label: "Session 2" },
        { time: season.tryout_2_s3_time, label: "Session 3" }
    ])
    await insertEvent("tryout", season.tryout_3_date, 3, "Tryout 3", [
        { time: season.tryout_3_s1_time, label: "Session 1" },
        { time: season.tryout_3_s2_time, label: "Session 2" },
        { time: season.tryout_3_s3_time, label: "Session 3" }
    ])
    console.log("  ✓ Tryouts migrated")

    // --- Regular Season ---
    const seasonTimes = [
        { time: season.season_s1_time, label: "Session 1" },
        { time: season.season_s2_time, label: "Session 2" },
        { time: season.season_s3_time, label: "Session 3" }
    ]
    const seasonDates = [
        season.season_1_date,
        season.season_2_date,
        season.season_3_date,
        season.season_4_date,
        season.season_5_date,
        season.season_6_date
    ]
    for (let i = 0; i < seasonDates.length; i++) {
        await insertEvent(
            "regular_season",
            seasonDates[i],
            i + 1,
            `Week ${i + 1}`,
            seasonTimes
        )
    }
    console.log("  ✓ Regular season weeks migrated")

    // --- Playoffs ---
    await insertEvent("playoff", season.playoff_1_date, 1, "Playoff Week 1", [])
    await insertEvent("playoff", season.playoff_2_date, 2, "Playoff Week 2", [])
    await insertEvent("playoff", season.playoff_3_date, 3, "Playoff Week 3", [])
    console.log("  ✓ Playoffs migrated")

    // --- Drafts ---
    const draftDates = [
        season.draft_1_date,
        season.draft_2_date,
        season.draft_3_date,
        season.draft_4_date,
        season.draft_5_date,
        season.draft_6_date
    ]
    for (let i = 0; i < draftDates.length; i++) {
        await insertEvent("draft", draftDates[i], i + 1, `Draft ${i + 1}`, [])
    }
    console.log("  ✓ Drafts migrated")

    // --- Captain Selection ---
    await insertEvent(
        "captain_select",
        season.captain_select_date,
        1,
        "Captain Selection",
        []
    )
    console.log("  ✓ Captain selection migrated")

    // --- Late Date ---
    await insertEvent(
        "late_date",
        season.late_date,
        1,
        "Late Registration Deadline",
        []
    )
    console.log("  ✓ Late date migrated")

    console.log(`  Total: ${eventCount} events, ${slotCount} time slots`)

    // --- Migrate player unavailability ---
    console.log("\nMigrating player unavailability...")

    // Get all signups for this season that have dates_missing
    const legacySignups = await db.execute<LegacySignup>(
        sql`SELECT id, dates_missing FROM signups
            WHERE season = ${season.id} AND dates_missing IS NOT NULL AND dates_missing != ''`
    )

    if (!legacySignups.rows || legacySignups.rows.length === 0) {
        console.log("  No signups with dates_missing found.")
    } else {
        console.log(
            `  Found ${legacySignups.rows.length} signups with dates_missing`
        )

        // Build a map of event date labels (human-readable) to event IDs
        const eventRows = await db.execute<{
            id: number
            event_date: string
            event_type: string
        }>(
            sql`SELECT id, event_date, event_type FROM season_events WHERE season_id = ${season.id}`
        )

        // Map: lowercase formatted date string → event ID
        const dateToEventId = new Map<string, number>()
        for (const e of eventRows.rows) {
            // Format the date the same way the old wizard form did
            const d = new Date(`${e.event_date}T12:00:00`)
            const formatted = d
                .toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                })
                .toLowerCase()
            dateToEventId.set(formatted, e.id)

            // Also try ISO format
            dateToEventId.set(e.event_date.toLowerCase(), e.id)
        }

        let unavailCount = 0
        const unmatchedDates = new Set<string>()

        for (const signup of legacySignups.rows) {
            const dates = signup
                .dates_missing!.split(",")
                .map((d: string) => d.trim())
                .filter(Boolean)

            for (const dateStr of dates) {
                const eventId = dateToEventId.get(dateStr.toLowerCase())
                if (eventId) {
                    try {
                        await db.execute(
                            sql`INSERT INTO player_unavailability (signup_id, event_id, created_at, updated_at)
                                VALUES (${signup.id}, ${eventId}, NOW(), NOW())
                                ON CONFLICT (signup_id, event_id) DO NOTHING`
                        )
                        unavailCount++
                    } catch (err) {
                        console.warn(
                            `  ⚠ Failed to insert unavailability for signup ${signup.id}, event ${eventId}: ${err}`
                        )
                    }
                } else {
                    unmatchedDates.add(dateStr)
                }
            }
        }

        console.log(`  ✓ Inserted ${unavailCount} unavailability records`)
        if (unmatchedDates.size > 0) {
            console.log(`  ⚠ ${unmatchedDates.size} unmatched date strings:`)
            for (const d of unmatchedDates) {
                console.log(`    - "${d}"`)
            }
        }
    }

    console.log("\n✅ Date migration complete!")
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Migration failed:", err)
        process.exit(1)
    })
