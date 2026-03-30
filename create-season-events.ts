import { Client } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

async function createMinimalSeasonEvents() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    })
    
    try {
        await client.connect()
        console.log('Creating minimal season events for Spring 2026...')
        
        // Current season ID from our check
        const seasonId = 68
        
        // Clear any existing events first (in case we run this multiple times)
        await client.query('DELETE FROM season_events WHERE season_id = $1', [seasonId])
        console.log('Cleared existing events')
        
        // Create basic season structure with placeholder dates
        // These dates are for Spring 2026 and should be updated via admin interface
        const events = [
            // Tryouts (3 sessions)
            { type: 'tryout', date: '2026-02-15', order: 1, label: 'Tryout 1' },
            { type: 'tryout', date: '2026-02-22', order: 2, label: 'Tryout 2' },
            { type: 'tryout', date: '2026-03-01', order: 3, label: 'Tryout 3' },
            
            // Captain selection
            { type: 'captain_select', date: '2026-03-08', order: 1, label: 'Captain Selection' },
            
            // Drafts (6 divisions)
            { type: 'draft', date: '2026-03-15', order: 1, label: 'AA Division Draft' },
            { type: 'draft', date: '2026-03-15', order: 2, label: 'A Division Draft' },
            { type: 'draft', date: '2026-03-16', order: 3, label: 'BB Division Draft' },
            { type: 'draft', date: '2026-03-16', order: 4, label: 'B Division Draft' },
            { type: 'draft', date: '2026-03-17', order: 5, label: 'CC Division Draft' },
            { type: 'draft', date: '2026-03-17', order: 6, label: 'C Division Draft' },
            
            // Regular season (6 weeks)
            { type: 'regular_season', date: '2026-04-05', order: 1, label: 'Week 1' },
            { type: 'regular_season', date: '2026-04-12', order: 2, label: 'Week 2' },
            { type: 'regular_season', date: '2026-04-19', order: 3, label: 'Week 3' },
            { type: 'regular_season', date: '2026-04-26', order: 4, label: 'Week 4' },
            { type: 'regular_season', date: '2026-05-03', order: 5, label: 'Week 5' },
            { type: 'regular_season', date: '2026-05-10', order: 6, label: 'Week 6' },
            
            // Playoffs (3 weeks)
            { type: 'playoff', date: '2026-05-17', order: 1, label: 'Playoff Week 1' },
            { type: 'playoff', date: '2026-05-24', order: 2, label: 'Playoff Week 2' },
            { type: 'playoff', date: '2026-05-31', order: 3, label: 'Championship' },
            
            // Late registration cutoff
            { type: 'late_date', date: '2026-02-01', order: 1, label: 'Late Registration Begins' }
        ]
        
        // Insert events
        for (const event of events) {
            const result = await client.query(`
                INSERT INTO season_events (season_id, event_type, event_date, sort_order, label)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            `, [seasonId, event.type, event.date, event.order, event.label])
            
            console.log(`Created \${event.type} event: \${event.label} on \${event.date}`)
            
            // Add time slots for tryouts and regular season
            if (event.type === 'tryout') {
                const eventId = result.rows[0].id
                
                // Tryouts have multiple sessions
                const timeSlots = [
                    { time: '11:00:00', label: 'Session 1', order: 1 },
                    { time: '13:00:00', label: 'Session 2', order: 2 },
                    { time: '15:00:00', label: 'Session 3', order: 3 }
                ]
                
                for (const slot of timeSlots) {
                    await client.query(`
                        INSERT INTO event_time_slots (event_id, start_time, slot_label, sort_order)
                        VALUES ($1, $2, $3, $4)
                    `, [eventId, slot.time, slot.label, slot.order])
                }
            }
            
            if (event.type === 'regular_season') {
                const eventId = result.rows[0].id
                
                // Regular season has 3 time slots
                const timeSlots = [
                    { time: '19:00:00', label: 'Session 1', order: 1 },
                    { time: '20:00:00', label: 'Session 2', order: 2 },
                    { time: '21:00:00', label: 'Session 3', order: 3 }
                ]
                
                for (const slot of timeSlots) {
                    await client.query(`
                        INSERT INTO event_time_slots (event_id, start_time, slot_label, sort_order)
                        VALUES ($1, $2, $3, $4)
                    `, [eventId, slot.time, slot.label, slot.order])
                }
            }
        }
        
        // Verify the migration
        const eventCount = await client.query('SELECT COUNT(*) as count FROM season_events WHERE season_id = $1', [seasonId])
        const slotCount = await client.query(`
            SELECT COUNT(*) as count 
            FROM event_time_slots ets
            JOIN season_events se ON ets.event_id = se.id
            WHERE se.season_id = $1
        `, [seasonId])
        
        console.log(`\nMigration complete!`)
        console.log(`- Created \${eventCount.rows[0].count} season events`)
        console.log(`- Created \${slotCount.rows[0].count} time slots`)
        console.log(`\nNext steps:`)
        console.log(`1. Visit /dashboard/season-config/ to review and adjust dates/times`)
        console.log(`2. The dates above are placeholders - please update them to match your actual schedule`)
        
    } catch (error) {
        console.error('Migration error:', error)
    } finally {
        await client.end()
    }
}

createMinimalSeasonEvents()