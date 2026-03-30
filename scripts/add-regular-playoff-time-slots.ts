/**
 * Add time slots to regular_season and playoff season_events that have none.
 *
 * Regular season: 3 time slots per night — 07:00, 08:10, 09:20
 * Playoff: 4 time slots per night — 07:00, 07:50, 08:40, 09:30
 *
 * Run with: npx tsx scripts/add-regular-playoff-time-slots.ts
 */

import { config } from "dotenv"
import { Client } from "pg"

config({ path: ".env.local" })

const REGULAR_SEASON_SLOTS = [
    { time: "07:00:00", label: "7:00" },
    { time: "08:10:00", label: "8:10" },
    { time: "09:20:00", label: "9:20" }
]

const PLAYOFF_SLOTS = [
    { time: "07:00:00", label: "7:00" },
    { time: "07:50:00", label: "7:50" },
    { time: "08:40:00", label: "8:40" },
    { time: "09:30:00", label: "9:30" }
]

async function main() {
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()

    console.log(
        "🔍 Finding regular_season and playoff events without time slots..."
    )

    const { rows: events } = await client.query<{
        id: number
        event_type: string
        event_date: string
        season_id: number
    }>(
        `SELECT id, event_type, event_date, season_id FROM season_events WHERE event_type IN ('regular_season', 'playoff') ORDER BY season_id, event_date`
    )

    if (events.length === 0) {
        console.log("No regular_season or playoff events found.")
        await client.end()
        return
    }

    console.log(
        `Found ${events.length} events. Checking for missing time slots...`
    )

    let inserted = 0

    for (const event of events) {
        const { rows: existing } = await client.query(
            "SELECT id FROM event_time_slots WHERE event_id = $1",
            [event.id]
        )

        if (existing.length > 0) {
            console.log(
                `  ⏭️  Event ${event.id} (${event.event_type} ${event.event_date}) already has ${existing.length} slots — skipping`
            )
            continue
        }

        const slots =
            event.event_type === "regular_season"
                ? REGULAR_SEASON_SLOTS
                : PLAYOFF_SLOTS

        for (let i = 0; i < slots.length; i++) {
            await client.query(
                "INSERT INTO event_time_slots (event_id, start_time, slot_label, sort_order) VALUES ($1, $2, $3, $4)",
                [event.id, slots[i].time, slots[i].label, i + 1]
            )
            inserted++
        }

        console.log(
            `  ✅ Event ${event.id} (${event.event_type} ${event.event_date}): inserted ${slots.length} slots`
        )
    }

    await client.end()
    console.log(`\n✅ Done. Inserted ${inserted} total time slots.`)
}

main().catch((err) => {
    console.error("Error:", err)
    process.exit(1)
})
