#!/usr/bin/env npx tsx

/**
 * Extract signup availability data from backup using strings and manual parsing
 * This script parses the binary backup file to find signup data with dates_missing
 */

import { Client } from 'pg'
import { config } from 'dotenv'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'

config({ path: '.env.local' })

const PROD_DB = process.env.DATABASE_URL!
const BACKUP_FILE = '/home/kasm-user/bsd-database-prod-2026-03-30_13-33-01.bak'

function parseDatesMissing(dateStr: string): string[] {
    if (!dateStr || dateStr.trim() === '') return []
    
    // Split on commas and clean up each date
    return dateStr.split(',')
        .map(d => d.trim())
        .filter(d => d.length > 0)
        .map(d => {
            // Handle various date formats found in legacy data
            // "Monday, January 13, 2025" -> "2025-01-13"  
            if (d.includes(',')) {
                try {
                    const parsed = new Date(d)
                    if (!isNaN(parsed.getTime())) {
                        return parsed.toISOString().split('T')[0]
                    }
                } catch (e) {
                    // ignore invalid dates
                }
            }
            return d
        })
        .filter(d => d.match(/^\d{4}-\d{2}-\d{2}$/) || d.includes('2025') || d.includes('2026'))
}

async function extractAndMigrateData() {
    console.log('🔍 Extracting signup data from backup file...')
    
    try {
        // Use strings to extract text data from backup file
        const stringsOutput = execSync(`/usr/bin/strings "${BACKUP_FILE}"`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 })
        
        // Look for patterns that match signup data with dates_missing
        // The backup contains COPY statements followed by tab-separated data
        const lines = stringsOutput.split('\n')
        const signupDataLines = []
        let inSignupsSection = false
        
        console.log('📊 Parsing backup data...')
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            
            // Look for the signups COPY statement 
            if (line.includes('COPY public.signups') && line.includes('dates_missing')) {
                console.log('✅ Found signups section in backup')
                inSignupsSection = true
                continue
            }
            
            // End of signups section
            if (inSignupsSection && (line.startsWith('\\') || line.includes('public.'))) {
                break
            }
            
            // Collect data lines (they contain tabs and look like signup records)
            if (inSignupsSection && line.includes('\t') && line.length > 50) {
                signupDataLines.push(line)
            }
        }
        
        console.log(`🔍 Found ${signupDataLines.length} potential signup records`)
        
        if (signupDataLines.length === 0) {
            console.log('❌ No signup data found in backup - trying alternative parsing')
            
            // Alternative: look for lines that contain date patterns
            const datePatterns = /\d{4}-\d{2}-\d{2}|\w+,\s+\w+\s+\d+,\s+\d{4}/
            const dataLines = lines.filter(line => 
                line.includes('\t') && 
                datePatterns.test(line) &&
                (line.includes('2025') || line.includes('2026'))
            ).slice(0, 50)  // Limit to first 50 for testing
            
            console.log(`🔍 Found ${dataLines.length} lines with date patterns`)
            signupDataLines.push(...dataLines)
        }
        
        // Parse the data lines
        const signupsWithDates = []
        
        for (const line of signupDataLines.slice(0, 20)) { // Process first 20 for testing
            const parts = line.split('\t')
            
            // Expected format: id, season, player, age, captain, pair, pair_pick, pair_reason, dates_missing, ...
            if (parts.length >= 9) {
                const id = parseInt(parts[0])
                const season = parseInt(parts[1])  
                const datesMissing = parts[8]
                
                if (!isNaN(id) && !isNaN(season) && datesMissing && datesMissing !== '\\N') {
                    const dates = parseDatesMissing(datesMissing)
                    if (dates.length > 0) {
                        signupsWithDates.push({
                            signupId: id,
                            seasonId: season,
                            datesMissing: datesMissing,
                            parsedDates: dates
                        })
                    }
                }
            }
        }
        
        console.log(`✅ Parsed ${signupsWithDates.length} signups with availability data`)
        
        if (signupsWithDates.length > 0) {
            console.log('\\n📋 Sample parsed data:')
            signupsWithDates.slice(0, 5).forEach(signup => {
                console.log(`  Signup ${signup.signupId} (Season ${signup.seasonId}):`)
                console.log(`    Raw: ${signup.datesMissing}`)  
                console.log(`    Parsed: ${signup.parsedDates.join(', ')}`)
            })
            
            // Now migrate this data to production
            await migrateAvailabilityData(signupsWithDates)
        } else {
            console.log('❌ No signup availability data could be parsed from backup')
        }
        
    } catch (error) {
        console.error('❌ Error extracting data:', error)
    }
}

async function migrateAvailabilityData(signupsData: any[]) {
    const client = new Client({ connectionString: PROD_DB })
    
    try {
        console.log('\\n🔄 Migrating availability data to production database...')
        await client.connect()
        
        // First, get the current season events to map dates
        const eventsResult = await client.query(`
            SELECT se.id, se.season_id, se.event_date, se.event_type, s.year, s.season
            FROM season_events se 
            JOIN seasons s ON se.season_id = s.id
            WHERE s.year >= 2025
            ORDER BY se.event_date
        `)
        
        const eventsByDate = new Map()
        eventsResult.rows.forEach(event => {
            const key = `${event.year}-${event.season}-${event.event_date}`
            eventsByDate.set(key, event)
        })
        
        console.log(`📅 Found ${eventsResult.rows.length} events to match against`)
        
        let migratedCount = 0
        
        for (const signup of signupsData) {
            // Try to match each parsed date to an event
            for (const dateStr of signup.parsedDates) {
                // Look for matching event by date
                let matchingEvent = null
                
                for (const [key, event] of eventsByDate) {
                    if (key.includes(dateStr) || event.event_date === dateStr) {
                        matchingEvent = event
                        break
                    }
                }
                
                if (matchingEvent) {
                    // Insert into player_unavailability
                    try {
                        await client.query(`
                            INSERT INTO player_unavailability (signup_id, event_id)
                            VALUES ($1, $2)
                            ON CONFLICT (signup_id, event_id) DO NOTHING
                        `, [signup.signupId, matchingEvent.id])
                        
                        migratedCount++
                    } catch (err: unknown) {
                        // Ignore foreign key errors (signup may not exist in current DB)
                        const message = err instanceof Error ? err.message : String(err)
                        if (!message.includes('foreign key')) {
                            console.log(`⚠️  Error inserting availability for signup ${signup.signupId}: ${message}`)
                        }
                    }
                }
            }
        }
        
        console.log(`✅ Successfully migrated ${migratedCount} availability records`)
        
        // Verify the migration
        const finalCount = await client.query('SELECT COUNT(*) as count FROM player_unavailability')
        console.log(`📊 Total player unavailability records: ${finalCount.rows[0].count}`)
        
    } catch (error) {
        console.error('❌ Migration error:', error)
    } finally {
        await client.end()
    }
}

extractAndMigrateData()