#!/usr/bin/env npx tsx

/**
 * Creates test season data for Spring 2026 to get the system functional
 * This populates the new normalized tables with realistic dates
 */

import { Client } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

const PROD_DB = process.env.DATABASE_URL!

async function createTestData() {
    const client = new Client({ connectionString: PROD_DB })
    
    try {
        console.log("🏐 Creating test season data for Spring 2026...")
        
        await client.connect()

        // Get the current Spring 2026 season ID
        const seasonResult = await client.query(`
            SELECT id FROM seasons 
            WHERE year = 2026 AND season = 'spring'
        `)

        if (seasonResult.rows.length === 0) {
            console.error("❌ Spring 2026 season not found in database")
            process.exit(1)
        }

        const seasonId = seasonResult.rows[0].id
        console.log(`✅ Found Spring 2026 season with ID: ${seasonId}`)

        // Clear existing events for this season
        await client.query('DELETE FROM season_events WHERE season_id = $1', [seasonId])
        console.log("🧹 Cleared existing events")

        // Create realistic Spring 2026 events
        const events = [
            // Tryouts - typically early in the season
            { type: "tryout", date: "2026-04-06", name: "Tryout #1" },
            { type: "tryout", date: "2026-04-08", name: "Tryout #2" },
            
            // Captain selection - between tryouts and regular season  
            { type: "captain_select", date: "2026-04-12", name: "Captain Selection" },
            
            // Drafts - after captain selection
            { type: "draft", date: "2026-04-14", name: "Draft #1" },
            { type: "draft", date: "2026-04-15", name: "Draft #2" },
            { type: "draft", date: "2026-04-16", name: "Draft #3" },
            
            // Regular season games - Mondays and Wednesdays typically
            { type: "regular_season", date: "2026-04-20", name: "Week 1" },
            { type: "regular_season", date: "2026-04-22", name: "Week 1" },
            { type: "regular_season", date: "2026-04-27", name: "Week 2" },
            { type: "regular_season", date: "2026-04-29", name: "Week 2" },
            { type: "regular_season", date: "2026-05-04", name: "Week 3" },
            { type: "regular_season", date: "2026-05-06", name: "Week 3" },
            { type: "regular_season", date: "2026-05-11", name: "Week 4" },
            { type: "regular_season", date: "2026-05-13", name: "Week 4" },
            { type: "regular_season", date: "2026-05-18", name: "Week 5" },
            { type: "regular_season", date: "2026-05-20", name: "Week 5" },
            { type: "regular_season", date: "2026-05-25", name: "Week 6" },
            { type: "regular_season", date: "2026-05-27", name: "Week 6" },
            
            // Playoffs - after regular season
            { type: "playoff", date: "2026-06-01", name: "Playoff Round 1" },
            { type: "playoff", date: "2026-06-03", name: "Playoff Round 2" },
            { type: "playoff", date: "2026-06-08", name: "Championship" },
            
            // Late date - price increase deadline
            { type: "late_date", date: "2026-04-01", name: "Late Registration Starts" }
        ]

        // Insert events
        for (let i = 0; i < events.length; i++) {
            const event = events[i]
            const eventResult = await client.query(`
                INSERT INTO season_events (season_id, event_type, event_date, label, sort_order) 
                VALUES ($1, $2, $3, $4, $5) 
                RETURNING id
            `, [seasonId, event.type, event.date, event.name, i + 1])

            const eventId = eventResult.rows[0].id
            console.log(`📅 Created ${event.type}: ${event.name} on ${event.date}`)

            // Add time slots for events that need them
            if (event.type === "tryout") {
                // Tryouts typically have 2 time slots
                await client.query(`
                    INSERT INTO event_time_slots (event_id, start_time, slot_label, sort_order) VALUES 
                    ($1, '19:00:00', 'Session 1', 1),
                    ($1, '20:15:00', 'Session 2', 2)
                `, [eventId])
                console.log(`  ⏰ Added time slots: 7:00 PM, 8:15 PM`)
            } else if (event.type === "regular_season") {
                // Regular season games have 3 time slots
                await client.query(`
                    INSERT INTO event_time_slots (event_id, start_time, slot_label, sort_order) VALUES 
                    ($1, '19:00:00', 'Game 1', 1),
                    ($1, '20:00:00', 'Game 2', 2),
                    ($1, '21:00:00', 'Game 3', 3)
                `, [eventId])
                console.log(`  ⏰ Added time slots: 7:00 PM, 8:00 PM, 9:00 PM`)
            } else if (event.type === "playoff") {
                // Playoffs may have fewer time slots
                await client.query(`
                    INSERT INTO event_time_slots (event_id, start_time, slot_label, sort_order) VALUES 
                    ($1, '19:00:00', 'Game 1', 1),
                    ($1, '20:30:00', 'Game 2', 2)
                `, [eventId])
                console.log(`  ⏰ Added time slots: 7:00 PM, 8:30 PM`)
            } else if (event.type === "draft") {
                // Drafts have a single start time
                await client.query(`
                    INSERT INTO event_time_slots (event_id, start_time, slot_label, sort_order) VALUES 
                    ($1, '19:00:00', 'Draft Start', 1)
                `, [eventId])
                console.log(`  ⏰ Added time slot: 7:00 PM`)
            }
        }

        console.log("\n✅ Test data creation completed!")
        console.log("🏐 Spring 2026 season is now ready to use")
        console.log("📋 You can modify the dates via /dashboard/season-config/")

    } catch (error) {
        console.error("❌ Error creating test data:", error)
        process.exit(1)
    } finally {
        await client.end()
    }
}

createTestData()