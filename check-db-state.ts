import { Client } from "pg"
import { config } from "dotenv"

// Load environment variables
config({ path: ".env.local" })

async function checkDatabaseState() {
    console.log("DATABASE_URL configured:", !!process.env.DATABASE_URL)
    console.log("DATABASE_URL length:", process.env.DATABASE_URL?.length)

    const client = new Client({
        connectionString: process.env.DATABASE_URL
    })

    try {
        await client.connect()
        console.log("Connected to database successfully")

        // Check seasons table structure
        const seasonsColumns = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'seasons' AND table_schema = 'public' 
            ORDER BY ordinal_position
        `)
        console.log("Seasons table columns:")
        seasonsColumns.rows.forEach((row) =>
            console.log("  -", row.column_name)
        )

        // Check if season_events exist and count
        const eventsCount = await client.query(
            "SELECT COUNT(*) as count FROM season_events"
        )
        console.log(`\nSeason events count: ${eventsCount.rows[0].count}`)

        // Check current season info
        const currentSeason = await client.query(`
            SELECT id, code, year, season, phase, season_amount, late_amount, max_players 
            FROM seasons 
            ORDER BY id DESC 
            LIMIT 1
        `)

        if (currentSeason.rows.length > 0) {
            console.log("\nCurrent season:")
            const season = currentSeason.rows[0]
            console.log(`  ID: ${season.id}`)
            console.log(`  Code: ${season.code}`)
            console.log(`  Year: ${season.year}`)
            console.log(`  Season: ${season.season}`)
            console.log(`  Phase: ${season.phase}`)
            console.log(`  Amount: ${season.season_amount}`)
            console.log(`  Late Amount: ${season.late_amount}`)
            console.log(`  Max Players: ${season.max_players}`)
        }

        // Check if there are any existing events for the current season
        if (currentSeason.rows.length > 0) {
            const seasonEvents = await client.query(
                `
                SELECT event_type, event_date, COUNT(*) as count
                FROM season_events 
                WHERE season_id = $1
                GROUP BY event_type, event_date
                ORDER BY event_type, event_date
            `,
                [currentSeason.rows[0].id]
            )

            console.log(
                `\nExisting events for season ${currentSeason.rows[0].id}:`
            )
            if (seasonEvents.rows.length === 0) {
                console.log("  No events found - data migration needed")
            } else {
                seasonEvents.rows.forEach((row) => {
                    console.log(
                        `  ${row.event_type}: ${row.event_date} (${row.count} entries)`
                    )
                })
            }
        }
    } catch (error) {
        console.error("Database error:", error)
    } finally {
        await client.end()
    }
}

checkDatabaseState()
