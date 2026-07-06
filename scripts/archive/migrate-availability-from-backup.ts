/**
 * Migrate legacy dates_missing data from backup to new player_unavailability table.
 *
 * Steps:
 * 1. Delete existing test events for season 68
 * 2. Create correct season_events matching the original backup schedule
 * 3. Parse dates_missing from backup signups data
 * 4. Insert player_unavailability records
 */

import { config } from "dotenv"
import { readFileSync } from "node:fs"
import { Client } from "pg"

config({ path: ".env.local" })

// Original season 68 dates from the backup
const SEASON_ID = 68
const _SEASON_YEAR = 2026

const ORIGINAL_EVENTS = {
    late_date: { date: "2026-02-24", label: "Late Registration Starts" },
    captain_select: { date: "2026-03-02", label: "Captain Selection" },
    tryouts: [
        { date: "2026-03-05", label: "Tryout #1" },
        { date: "2026-03-12", label: "Tryout #2" },
        { date: "2026-03-19", label: "Tryout #3" }
    ],
    drafts: [
        { date: "2026-03-19", label: "Draft #1" },
        { date: "2026-03-22", label: "Draft #2" },
        { date: "2026-03-24", label: "Draft #3" },
        { date: "2026-03-26", label: "Draft #4" },
        { date: "2026-03-29", label: "Draft #5" },
        { date: "2026-03-31", label: "Draft #6" }
    ],
    regular_season: [
        { date: "2026-04-02", label: "Week 1" },
        { date: "2026-04-09", label: "Week 2" },
        { date: "2026-04-16", label: "Week 3" },
        { date: "2026-04-23", label: "Week 4" },
        { date: "2026-04-30", label: "Week 5" },
        { date: "2026-05-07", label: "Week 6" }
    ],
    playoffs: [
        { date: "2026-05-14", label: "Playoff Round 1" },
        { date: "2026-05-21", label: "Playoff Round 2" },
        { date: "2026-05-28", label: "Championship" }
    ]
}

const TRYOUT_TIMES = {
    "2026-03-05": ["19:00:00", "20:30:00"], // 7pm, 8:30pm
    "2026-03-12": ["19:00:00", "20:00:00", "21:00:00"], // 7pm, 8pm, 9pm
    "2026-03-19": ["19:00:00", "20:00:00", "21:00:00"] // 7pm, 8pm, 9pm
}

// Build a lookup: MM/DD -> YYYY-MM-DD for season 68
function buildDateLookup(): Map<string, string> {
    const lookup = new Map<string, string>()
    const allDates = [
        ...ORIGINAL_EVENTS.tryouts,
        ...ORIGINAL_EVENTS.regular_season,
        ...ORIGINAL_EVENTS.playoffs
    ]
    for (const e of allDates) {
        const d = new Date(`${e.date}T12:00:00`)
        const mm = String(d.getMonth() + 1).padStart(2, "0")
        const dd = String(d.getDate()).padStart(2, "0")
        lookup.set(`${mm}/${dd}`, e.date)
        // Also handle without leading zero
        lookup.set(`${d.getMonth() + 1}/${d.getDate()}`, e.date)
    }
    return lookup
}

// Parse dates_missing text: "04/02, 05/14" -> ["04/02", "05/14"]
function parseDatesMissing(text: string): string[] {
    return text
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => {
            // Handle MM/DD/YYYY format -> MM/DD
            const parts = s.split("/")
            if (parts.length === 3) return `${parts[0]}/${parts[1]}`
            return s
        })
}

async function main() {
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()

    try {
        await client.query("BEGIN")

        // Step 1: Delete existing test events and cascaded data for season 68
        console.log("🗑️  Deleting existing test events for season 68...")
        const deleted = await client.query(
            "DELETE FROM season_events WHERE season_id = $1 RETURNING id",
            [SEASON_ID]
        )
        console.log(
            `   Deleted ${deleted.rowCount} existing events (cascade deletes time_slots and unavailability)`
        )

        // Step 2: Create correct events
        console.log("\n📅 Creating correct season events from backup data...")

        const eventIdMap = new Map<string, number>() // date -> event_id
        let sortOrder = 0

        async function insertEvent(type: string, date: string, label: string) {
            sortOrder++
            const res = await client.query(
                `INSERT INTO season_events (season_id, event_type, event_date, label, sort_order)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [SEASON_ID, type, date, label, sortOrder]
            )
            return res.rows[0].id
        }

        // Late date
        const lateId = await insertEvent(
            "late_date",
            ORIGINAL_EVENTS.late_date.date,
            ORIGINAL_EVENTS.late_date.label
        )
        console.log(
            `   Created late_date: ${ORIGINAL_EVENTS.late_date.date} (ID ${lateId})`
        )

        // Captain select
        const captId = await insertEvent(
            "captain_select",
            ORIGINAL_EVENTS.captain_select.date,
            ORIGINAL_EVENTS.captain_select.label
        )
        console.log(
            `   Created captain_select: ${ORIGINAL_EVENTS.captain_select.date} (ID ${captId})`
        )

        // Tryouts
        for (const t of ORIGINAL_EVENTS.tryouts) {
            const id = await insertEvent("tryout", t.date, t.label)
            eventIdMap.set(t.date, id)
            console.log(`   Created tryout: ${t.date} - ${t.label} (ID ${id})`)

            // Add time slots
            const times = TRYOUT_TIMES[t.date as keyof typeof TRYOUT_TIMES]
            if (times) {
                for (let i = 0; i < times.length; i++) {
                    await client.query(
                        `INSERT INTO event_time_slots (event_id, start_time, sort_order, slot_label)
                         VALUES ($1, $2, $3, $4)`,
                        [id, times[i], i + 1, `Session ${i + 1}`]
                    )
                }
                console.log(`     Added ${times.length} time slots`)
            }
        }

        // Drafts
        for (const d of ORIGINAL_EVENTS.drafts) {
            const id = await insertEvent("draft", d.date, d.label)
            eventIdMap.set(d.date, id)
            console.log(`   Created draft: ${d.date} - ${d.label} (ID ${id})`)
        }

        // Regular season
        for (const s of ORIGINAL_EVENTS.regular_season) {
            const id = await insertEvent("regular_season", s.date, s.label)
            eventIdMap.set(s.date, id)
            console.log(
                `   Created regular_season: ${s.date} - ${s.label} (ID ${id})`
            )
        }

        // Playoffs
        for (const p of ORIGINAL_EVENTS.playoffs) {
            const id = await insertEvent("playoff", p.date, p.label)
            eventIdMap.set(p.date, id)
            console.log(`   Created playoff: ${p.date} - ${p.label} (ID ${id})`)
        }

        // Build event_date -> event_id[] lookup (multiple events can share a date)
        const allEventsRes = await client.query(
            `SELECT id, event_date FROM season_events WHERE season_id = $1`,
            [SEASON_ID]
        )
        const eventIdsMap = new Map<string, number[]>()
        for (const row of allEventsRes.rows) {
            const d = new Date(row.event_date)
            const yyyy = d.getUTCFullYear()
            const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
            const dd = String(d.getUTCDate()).padStart(2, "0")
            const isoDate = `${yyyy}-${mm}-${dd}`
            const existing = eventIdsMap.get(isoDate) || []
            existing.push(row.id)
            eventIdsMap.set(isoDate, existing)
        }

        console.log(`\n📊 Event ID map (${eventIdsMap.size} dates):`)
        for (const [date, ids] of eventIdsMap) {
            console.log(`   ${date} -> event IDs [${ids.join(", ")}]`)
        }

        // Step 3: Parse backup signups data
        console.log("\n📦 Parsing dates_missing from backup...")
        const backupSql = readFileSync("/tmp/signups_data.sql", "utf-8")
        const copyMatch = backupSql.match(
            /COPY public\.signups \(([^)]+)\) FROM stdin;\n([\s\S]*?)\n\\\./
        )
        if (!copyMatch) throw new Error("Could not find COPY data in backup")

        const columns = copyMatch[1].split(", ")
        const datesMissingIdx = columns.indexOf("dates_missing")
        const lines = copyMatch[2].trim().split("\n")

        const dateLookup = buildDateLookup()
        console.log(`   Date lookup entries: ${dateLookup.size}`)

        let insertedCount = 0
        let skippedNoMatch = 0
        let skippedEmpty = 0
        const unmatchedDates = new Set<string>()

        for (const line of lines) {
            const fields = line.split("\t")
            const signupId = parseInt(fields[0], 10)
            const datesMissing = fields[datesMissingIdx]

            if (
                !datesMissing ||
                datesMissing === "" ||
                datesMissing === "\\N"
            ) {
                skippedEmpty++
                continue
            }

            const dates = parseDatesMissing(datesMissing)
            for (const dateStr of dates) {
                // Look up the full date
                const fullDate = dateLookup.get(dateStr)
                if (!fullDate) {
                    unmatchedDates.add(dateStr)
                    skippedNoMatch++
                    continue
                }

                const eventIds = eventIdsMap.get(fullDate)
                if (!eventIds || eventIds.length === 0) {
                    unmatchedDates.add(dateStr)
                    skippedNoMatch++
                    continue
                }

                // Check if signup still exists in prod DB
                const signupExists = await client.query(
                    "SELECT id FROM signups WHERE id = $1",
                    [signupId]
                )
                if (signupExists.rows.length === 0) {
                    console.log(
                        `   ⚠️  Signup ${signupId} not found in database, skipping`
                    )
                    continue
                }

                // Insert unavailability for ALL events on this date
                for (const eventId of eventIds) {
                    try {
                        await client.query(
                            `INSERT INTO player_unavailability (signup_id, event_id, created_at, updated_at)
                             VALUES ($1, $2, NOW(), NOW())
                             ON CONFLICT (signup_id, event_id) DO NOTHING`,
                            [signupId, eventId]
                        )
                        insertedCount++
                        // biome-ignore lint/suspicious/noExplicitAny: accessing .message on caught error
                    } catch (err: any) {
                        console.log(
                            `   ⚠️  Error inserting unavailability for signup ${signupId}, event ${eventId}: ${err.message}`
                        )
                    }
                }
            }
        }

        console.log(`\n✅ Migration results:`)
        console.log(`   Inserted: ${insertedCount} unavailability records`)
        console.log(`   Skipped (empty dates_missing): ${skippedEmpty}`)
        console.log(`   Skipped (no matching event): ${skippedNoMatch}`)
        if (unmatchedDates.size > 0) {
            console.log(
                `   ⚠️  Unmatched date strings: ${Array.from(unmatchedDates).join(", ")}`
            )
        }

        // Step 4: Verify
        const verifyCount = await client.query(
            "SELECT COUNT(*) as cnt FROM player_unavailability"
        )
        console.log(
            `\n📊 Total unavailability records in DB: ${verifyCount.rows[0].cnt}`
        )

        const sampleData = await client.query(`
            SELECT pu.signup_id, u.first_name, u.last_name, se.label, se.event_date
            FROM player_unavailability pu
            JOIN signups s ON pu.signup_id = s.id
            JOIN users u ON s.player = u.id
            JOIN season_events se ON pu.event_id = se.id
            ORDER BY u.last_name, se.event_date
            LIMIT 20
        `)
        console.log(`\n📋 Sample unavailability records:`)
        for (const row of sampleData.rows) {
            const d = new Date(row.event_date)
            const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
            const dd = String(d.getUTCDate()).padStart(2, "0")
            console.log(
                `   ${row.first_name} ${row.last_name} (signup ${row.signup_id}): ${row.label} (${mm}/${dd})`
            )
        }

        await client.query("COMMIT")
        console.log("\n🎉 Migration committed successfully!")
    } catch (err) {
        await client.query("ROLLBACK")
        console.error("\n❌ Migration failed, rolled back:", err)
        throw err
    } finally {
        await client.end()
    }
}

main()
