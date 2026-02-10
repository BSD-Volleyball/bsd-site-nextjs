#!/usr/bin/env tsx
/**
 * Batch Import Draft Data from CSV Files
 *
 * Reads CSV draft files from ~/bsd-drafts/ directory, parses team/player data,
 * resolves users against the database, and inserts teams + draft picks.
 *
 * Usage:
 *   npx tsx scripts/import-draft-csv.ts                    # Process all files
 *   npx tsx scripts/import-draft-csv.ts F24A F24AA         # Process specific files
 *   npx tsx scripts/import-draft-csv.ts --dry-run          # Parse only, no database writes
 *
 * Filename format:
 *   [F|S|U][YY][Division]
 *   F = fall, S = spring, U = summer
 *   YY = two-digit year
 *   Division = A, AA, AB, ABA, ABB, BB, BBB
 */

import "dotenv/config"
import { db } from "../src/database/db"
import { users, seasons, divisions, teams, drafts } from "../src/database/schema"
import { eq, and } from "drizzle-orm"
import * as readline from "readline"
import * as fs from "fs"
import * as path from "path"

const DRAFTS_DIR = path.join(process.env.HOME || "~", "bsd-drafts")
const MAPPING_FILE = path.join(process.env.HOME || "~", "draft-mapping-fix.csv")
const MAX_PLAYERS_PER_TEAM = 9

// Name mapping from draft files to correct database names
// Key: "lastname, firstname" (lowercase), Value: { firstName, lastName }
let nameMapping: Map<string, { firstName: string; lastName: string }> = new Map()

function loadNameMapping(): void {
    if (!fs.existsSync(MAPPING_FILE)) {
        console.log("No name mapping file found, skipping.")
        return
    }

    const content = fs.readFileSync(MAPPING_FILE, "utf-8")
    const lines = content.split("\n")

    // Skip header row
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue

        const fields = parseCSVLine(line)
        if (fields.length < 2) continue

        const wrongName = fields[0].trim().replace(/^"|"$/g, "")
        const goodName = fields[1].trim().replace(/^"|"$/g, "")

        if (!wrongName || !goodName) continue

        // Both are in "Last, First" format
        const key = wrongName.toLowerCase()
        const [goodLast, goodFirst] = goodName.split(",").map(s => s.trim())

        nameMapping.set(key, {
            firstName: goodFirst || "",
            lastName: goodLast || ""
        })
    }

    console.log(`Loaded ${nameMapping.size} name mappings`)
}

function lookupMappedName(firstName: string, lastName: string): { firstName: string; lastName: string } | null {
    // Try "Last, First" format
    const key = `${lastName}, ${firstName}`.toLowerCase()
    return nameMapping.get(key) || null
}

interface User {
    id: string
    first_name: string
    last_name: string
    preffered_name: string | null
}

interface ParsedName {
    firstName: string
    lastName: string
    original: string
}

interface TeamData {
    captainLastName: string
    captain: User | null
    players: { name: ParsedName; user: User | null }[]
    teamName: string
}

interface ParsedData {
    season: string
    year: number
    divisionName: string
    teams: TeamData[]
    filename: string
}

// --- Readline helpers ---

let rl: readline.Interface | null = null

function getReadline(): readline.Interface {
    if (!rl) {
        let input: NodeJS.ReadableStream = process.stdin
        try {
            input = fs.createReadStream("/dev/tty")
        } catch {
            // Fall back to stdin
        }
        rl = readline.createInterface({
            input,
            output: process.stdout
        })
    }
    return rl
}

function question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
        getReadline().question(prompt, (answer) => {
            resolve(answer.trim())
        })
    })
}

function closeReadline() {
    if (rl) {
        rl.close()
        rl = null
    }
}

// --- Name parsing ---

function parseName(nameStr: string): ParsedName {
    const trimmed = nameStr.trim()
    if (!trimmed) {
        return { firstName: "", lastName: "", original: "" }
    }

    // Check for "Last, First" format
    if (trimmed.includes(",")) {
        const [last, first] = trimmed.split(",").map(s => s.trim())
        return { firstName: first || "", lastName: last || "", original: trimmed }
    }

    // "First Last" format - split on spaces, last word is last name
    const parts = trimmed.split(/\s+/)
    if (parts.length === 1) {
        return { firstName: parts[0], lastName: "", original: trimmed }
    }

    const lastName = parts.pop() || ""
    const firstName = parts.join(" ")
    return { firstName, lastName, original: trimmed }
}

// --- Filename parsing ---

function parseFilename(filename: string): { season: string; year: number; divisionName: string } {
    const seasonLetter = filename[0].toUpperCase()
    const seasonMap: Record<string, string> = { F: "fall", S: "spring", U: "summer" }
    const season = seasonMap[seasonLetter]
    if (!season) {
        throw new Error(`Unknown season letter "${seasonLetter}" in filename "${filename}"`)
    }

    const yearStr = filename.substring(1, 3)
    const yearNum = parseInt(yearStr, 10)
    if (isNaN(yearNum)) {
        throw new Error(`Invalid year "${yearStr}" in filename "${filename}"`)
    }
    // Convert 2-digit year: 00-49 → 2000s, 50-99 → 1900s
    const year = yearNum < 50 ? 2000 + yearNum : 1900 + yearNum

    const divisionName = filename.substring(3)
    if (!divisionName) {
        throw new Error(`No division found in filename "${filename}"`)
    }

    return { season, year, divisionName }
}

// --- CSV parsing ---

function parseCSVLine(line: string): string[] {
    // Simple CSV parsing - split on commas, handle quoted fields
    const result: string[] = []
    let current = ""
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"'
                i++
            } else {
                inQuotes = !inQuotes
            }
        } else if (ch === "," && !inQuotes) {
            result.push(current)
            current = ""
        } else {
            current += ch
        }
    }
    result.push(current)
    return result
}

function parseCsvFile(filePath: string, filename: string): ParsedData {
    const { season, year, divisionName } = parseFilename(filename)
    const content = fs.readFileSync(filePath, "utf-8")
    const lines = content.split("\n")

    // Find the data start row: "1,2,3,...,N" where N is the number of teams (up to 8)
    let startRow = -1
    let numTeams = 0

    for (let i = 0; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i])
        const trimmed = fields.map(f => f.trim())

        // Count consecutive numbers starting from 1
        let count = 0
        for (let j = 0; j < trimmed.length; j++) {
            if (trimmed[j] === String(j + 1)) {
                count++
            } else {
                break
            }
        }

        if (count >= 4) {
            startRow = i
            numTeams = count
            break
        }
    }

    if (startRow === -1) {
        throw new Error(`Could not find team number marker row (1,2,3,4... ) in file "${filename}"`)
    }

    // Next row has captain last names
    const captainRow = startRow + 1
    if (captainRow >= lines.length) {
        throw new Error(`Captain row missing in file "${filename}"`)
    }

    const captainFields = parseCSVLine(lines[captainRow])
    const captainNames = captainFields.slice(0, numTeams).map(s => s.trim())

    // Validate we got captain names
    if (captainNames.some(n => !n)) {
        throw new Error(`Missing captain name in file "${filename}": [${captainNames.join(", ")}]`)
    }

    // Initialize team data - captain name may be "last" or "first last"
    const teamDataArr: TeamData[] = captainNames.map(name => {
        const parts = name.split(/\s+/)
        // If multiple words, last word is the last name; otherwise treat the whole thing as last name
        const captainLastName = parts.length > 1 ? parts[parts.length - 1] : parts[0]
        return {
            captainLastName,
            captain: null,
            players: [],
            teamName: ""
        }
    })

    // Parse player rows (up to MAX_PLAYERS_PER_TEAM rows, stop when all columns are empty)
    for (let i = 0; i < MAX_PLAYERS_PER_TEAM; i++) {
        const rowIdx = captainRow + 1 + i
        if (rowIdx >= lines.length) break

        const fields = parseCSVLine(lines[rowIdx])

        // Check if all team columns in this row are empty
        const hasAnyPlayer = fields.slice(0, numTeams).some(f => f.trim() !== "")
        if (!hasAnyPlayer) break

        for (let t = 0; t < numTeams; t++) {
            const nameStr = (fields[t] || "").trim()
            if (nameStr) {
                const parsed = parseName(nameStr)
                teamDataArr[t].players.push({ name: parsed, user: null })
            }
        }
    }

    return { season, year, divisionName, teams: teamDataArr, filename }
}

// --- User matching ---

function findUserByName(firstName: string, lastName: string, allUsers: User[]): User[] {
    const normFirst = firstName.toLowerCase().trim()
    const normLast = lastName.toLowerCase().trim()

    if (!normLast) return []

    return allUsers.filter(u => {
        const uFirst = u.first_name.toLowerCase()
        const uLast = u.last_name.toLowerCase()
        const uPref = (u.preffered_name || "").toLowerCase()

        if (uLast !== normLast) return false

        return uFirst === normFirst ||
               uFirst.startsWith(normFirst) ||
               normFirst.startsWith(uFirst) ||
               (uPref !== "" && (
                   uPref === normFirst ||
                   uPref.startsWith(normFirst) ||
                   normFirst.startsWith(uPref)
               ))
    })
}

function findUserWithMapping(firstName: string, lastName: string, allUsers: User[]): { matches: User[]; mapped: boolean; mappedName?: string } {
    // Try direct lookup first
    const directMatches = findUserByName(firstName, lastName, allUsers)
    if (directMatches.length > 0) {
        return { matches: directMatches, mapped: false }
    }

    // Try mapping lookup
    const mapped = lookupMappedName(firstName, lastName)
    if (mapped) {
        const mappedMatches = findUserByName(mapped.firstName, mapped.lastName, allUsers)
        const mappedName = `${mapped.firstName} ${mapped.lastName}`
        return { matches: mappedMatches, mapped: true, mappedName }
    }

    return { matches: [], mapped: false }
}

function addRuntimeMapping(firstName: string, lastName: string, user: User): void {
    const key = `${lastName}, ${firstName}`.toLowerCase()
    nameMapping.set(key, {
        firstName: user.first_name,
        lastName: user.last_name
    })
    console.log(`  (remembered mapping: ${firstName} ${lastName} → ${user.first_name} ${user.last_name})`)
}

function findUserByLastName(lastName: string, allUsers: User[]): User[] {
    const normLast = lastName.toLowerCase().trim()
    return allUsers.filter(u => u.last_name.toLowerCase() === normLast)
}

async function promptForUserId(
    description: string,
    candidates: User[],
    allUsers: User[]
): Promise<string> {
    console.log(`\n${description}`)

    if (candidates.length > 0) {
        console.log("Possible matches:")
        candidates.forEach((u, i) => {
            const pref = u.preffered_name ? ` (${u.preffered_name})` : ""
            console.log(`  ${i + 1}. ${u.first_name}${pref} ${u.last_name} [${u.id}]`)
        })
        console.log("  0. None of these (enter ID manually)")

        const choice = await question("Enter choice (number or user ID): ")

        const num = parseInt(choice, 10)
        if (num > 0 && num <= candidates.length) {
            return candidates[num - 1].id
        }
        if (num === 0 || choice.length > 10) {
            const userId = num === 0 ? await question("Enter user ID: ") : choice
            const found = allUsers.find(u => u.id === userId)
            if (found) {
                console.log(`  → Selected: ${found.first_name} ${found.last_name}`)
                return userId
            }
            console.log(`  ⚠ User ID "${userId}" not found in database`)
            return promptForUserId(description, candidates, allUsers)
        }
    }

    const userId = await question("Enter user ID: ")
    const found = allUsers.find(u => u.id === userId)
    if (found) {
        console.log(`  → Selected: ${found.first_name} ${found.last_name}`)
        return userId
    }
    console.log(`  ⚠ User ID "${userId}" not found in database`)
    return promptForUserId(description, [], allUsers)
}

// --- User resolution ---

async function resolveUsers(data: ParsedData, allUsers: User[]): Promise<void> {
    console.log(`\nResolving users for ${data.season} ${data.year} ${data.divisionName}...`)
    console.log(`Found ${data.teams.length} teams\n`)

    // First, resolve captains
    for (let t = 0; t < data.teams.length; t++) {
        const team = data.teams[t]
        console.log(`\n--- Team ${t + 1} (Captain: ${team.captainLastName}) ---`)

        // Find players with matching last name to identify captain
        const captainCandidatesFromTeam = team.players.filter(
            p => p.name.lastName.toLowerCase() === team.captainLastName.toLowerCase()
        )

        if (captainCandidatesFromTeam.length === 1) {
            const captainName = captainCandidatesFromTeam[0].name
            const { matches, mapped, mappedName } = findUserWithMapping(captainName.firstName, captainName.lastName, allUsers)

            if (matches.length === 1) {
                team.captain = matches[0]
                team.teamName = `Team ${team.captain.last_name}`
                const suffix = mapped ? ` (mapped from ${captainName.original})` : ""
                console.log(`Captain: ${team.captain.first_name} ${team.captain.last_name}${suffix} ✓`)
            } else {
                const userId = await promptForUserId(
                    `Captain "${captainName.original}"${mapped ? ` (mapped to "${mappedName}")` : ""} - ${matches.length > 1 ? "multiple" : "no"} matches:`,
                    matches,
                    allUsers
                )
                team.captain = allUsers.find(u => u.id === userId)!
                team.teamName = `Team ${team.captain.last_name}`
                addRuntimeMapping(captainName.firstName, captainName.lastName, team.captain)
            }
        } else if (captainCandidatesFromTeam.length > 1) {
            console.log(`Multiple players with last name "${team.captainLastName}":`)
            captainCandidatesFromTeam.forEach((p, i) => {
                console.log(`  ${i + 1}. ${p.name.original}`)
            })
            const choice = await question("Which one is the captain? (enter number): ")
            const idx = parseInt(choice, 10) - 1

            if (idx >= 0 && idx < captainCandidatesFromTeam.length) {
                const captainName = captainCandidatesFromTeam[idx].name
                const { matches, mapped, mappedName } = findUserWithMapping(captainName.firstName, captainName.lastName, allUsers)

                if (matches.length === 1) {
                    team.captain = matches[0]
                    team.teamName = `Team ${team.captain.last_name}`
                    const suffix = mapped ? ` (mapped from ${captainName.original})` : ""
                    console.log(`Captain: ${team.captain.first_name} ${team.captain.last_name}${suffix} ✓`)
                } else {
                    const userId = await promptForUserId(
                        `Captain "${captainName.original}"${mapped ? ` (mapped to "${mappedName}")` : ""}:`,
                        matches,
                        allUsers
                    )
                    team.captain = allUsers.find(u => u.id === userId)!
                    team.teamName = `Team ${team.captain.last_name}`
                    addRuntimeMapping(captainName.firstName, captainName.lastName, team.captain)
                }
            } else {
                throw new Error("Invalid selection")
            }
        } else {
            // No player with captain's last name - search database directly
            const matches = findUserByLastName(team.captainLastName, allUsers)
            const userId = await promptForUserId(
                `Could not find captain with last name "${team.captainLastName}" in player list:`,
                matches,
                allUsers
            )
            team.captain = allUsers.find(u => u.id === userId)!
            team.teamName = `Team ${team.captain.last_name}`
            addRuntimeMapping("", team.captainLastName, team.captain)
        }
    }

    // Now resolve all players
    for (let t = 0; t < data.teams.length; t++) {
        const team = data.teams[t]
        console.log(`\n--- Resolving players for ${team.teamName} ---`)

        for (const player of team.players) {
            const { matches, mapped, mappedName } = findUserWithMapping(player.name.firstName, player.name.lastName, allUsers)

            if (matches.length === 1) {
                player.user = matches[0]
                const suffix = mapped ? ` (mapped from ${player.name.original})` : ""
                console.log(`  ${player.name.original} → ${player.user.first_name} ${player.user.last_name}${suffix} ✓`)
            } else if (matches.length > 1) {
                const captainMatch = matches.find(m => m.id === team.captain?.id)
                if (captainMatch && player.name.lastName.toLowerCase() === team.captainLastName.toLowerCase()) {
                    player.user = captainMatch
                    console.log(`  ${player.name.original} → ${player.user.first_name} ${player.user.last_name} (captain) ✓`)
                } else {
                    const userId = await promptForUserId(
                        `Player "${player.name.original}"${mapped ? ` (mapped to "${mappedName}")` : ""} - multiple matches:`,
                        matches,
                        allUsers
                    )
                    player.user = allUsers.find(u => u.id === userId)!
                    addRuntimeMapping(player.name.firstName, player.name.lastName, player.user)
                }
            } else {
                const userId = await promptForUserId(
                    `Player "${player.name.original}" - no matches found:`,
                    [],
                    allUsers
                )
                player.user = allUsers.find(u => u.id === userId)!
                addRuntimeMapping(player.name.firstName, player.name.lastName, player.user)
            }
        }
    }
}

// --- Database lookups ---

async function lookupSeasonAndDivision(
    season: string,
    year: number,
    divisionName: string
): Promise<{ seasonId: number; divisionId: number; divisionLevel: number }> {
    const [seasonRow] = await db
        .select({ id: seasons.id })
        .from(seasons)
        .where(and(eq(seasons.season, season), eq(seasons.year, year)))
        .limit(1)

    if (!seasonRow) {
        throw new Error(`Season "${season} ${year}" not found in database`)
    }

    const [divisionRow] = await db
        .select({ id: divisions.id, level: divisions.level })
        .from(divisions)
        .where(eq(divisions.name, divisionName))
        .limit(1)

    if (!divisionRow) {
        throw new Error(`Division "${divisionName}" not found in database`)
    }

    return {
        seasonId: seasonRow.id,
        divisionId: divisionRow.id,
        divisionLevel: divisionRow.level
    }
}

async function checkExistingDrafts(seasonId: number, divisionId: number): Promise<boolean> {
    const existing = await db
        .select({ id: drafts.id })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .where(and(eq(teams.season, seasonId), eq(teams.division, divisionId)))
        .limit(1)

    return existing.length > 0
}

// --- Display and insert ---

function displaySummary(
    data: ParsedData,
    seasonId: number,
    divisionId: number,
    divisionLevel: number
): number {
    const numTeams = data.teams.length
    let totalPicks = 0

    console.log("\n" + "=".repeat(60))
    console.log(`IMPORT SUMMARY: ${data.filename}`)
    console.log("=".repeat(60))
    console.log(`Season: ${data.season} ${data.year}`)
    console.log(`Division: ${data.divisionName} (Level ${divisionLevel})`)
    console.log(`Season ID: ${seasonId}, Division ID: ${divisionId}`)
    console.log("")
    console.log("TEAMS TO CREATE:")
    console.log("-".repeat(60))

    for (let t = 0; t < data.teams.length; t++) {
        const team = data.teams[t]
        const teamNumber = t + 1
        console.log(`\n  Team ${teamNumber}: ${team.teamName}`)
        console.log(`  Captain: ${team.captain!.first_name} ${team.captain!.last_name}`)
        console.log(`  Players (${team.players.length}):`)

        for (let p = 0; p < team.players.length; p++) {
            const player = team.players[p]
            const round = p + 1

            const isOddRound = round % 2 === 1
            const baseValue = ((divisionLevel - 1) * 50) + ((round - 1) * numTeams)
            const positionValue = isOddRound ? teamNumber : (numTeams + 1 - teamNumber)
            const overall = baseValue + positionValue

            console.log(`    R${round} (#${overall}): ${player.user!.first_name} ${player.user!.last_name}`)
            totalPicks++
        }
    }

    console.log("")
    console.log("-".repeat(60))
    console.log(`Total: ${numTeams} teams, ${totalPicks} draft picks`)
    console.log("=".repeat(60))

    return totalPicks
}

async function insertData(
    data: ParsedData,
    seasonId: number,
    divisionId: number,
    divisionLevel: number
): Promise<void> {
    const numTeams = data.teams.length

    console.log("\nInserting teams...")

    const teamIds: number[] = []
    for (let t = 0; t < data.teams.length; t++) {
        const team = data.teams[t]
        const [inserted] = await db
            .insert(teams)
            .values({
                season: seasonId,
                captain: team.captain!.id,
                division: divisionId,
                name: team.teamName,
                number: t + 1
            })
            .returning({ id: teams.id })

        teamIds.push(inserted.id)
        console.log(`  ✓ Created ${team.teamName} (ID: ${inserted.id})`)
    }

    console.log("\nInserting draft picks...")

    const draftPicks: { team: number; user: string; round: number; overall: number }[] = []

    for (let t = 0; t < data.teams.length; t++) {
        const team = data.teams[t]
        const teamId = teamIds[t]
        const teamNumber = t + 1

        for (let p = 0; p < team.players.length; p++) {
            const player = team.players[p]
            const round = p + 1

            const isOddRound = round % 2 === 1
            const baseValue = ((divisionLevel - 1) * 50) + ((round - 1) * numTeams)
            const positionValue = isOddRound ? teamNumber : (numTeams + 1 - teamNumber)
            const overall = baseValue + positionValue

            draftPicks.push({
                team: teamId,
                user: player.user!.id,
                round,
                overall
            })
        }
    }

    await db.insert(drafts).values(draftPicks)
    console.log(`  ✓ Inserted ${draftPicks.length} draft picks`)
}

// --- Main ---

async function main() {
    try {
        const args = process.argv.slice(2)
        const dryRun = args.includes("--dry-run")
        const fileArgs = args.filter(a => !a.startsWith("--"))

        // Load name mapping
        loadNameMapping()

        // Load all users
        console.log("Loading users from database...")
        const allUsers = await db
            .select({
                id: users.id,
                first_name: users.first_name,
                last_name: users.last_name,
                preffered_name: users.preffered_name
            })
            .from(users)
        console.log(`Loaded ${allUsers.length} users`)

        // Get list of files to process
        let filenames: string[]
        if (fileArgs.length > 0) {
            filenames = fileArgs
        } else {
            filenames = fs.readdirSync(DRAFTS_DIR)
                .filter(f => /^[FSU]\d{2}/.test(f) && f !== "SystemData")
                .sort()
        }

        console.log(`\nFiles to process: ${filenames.length}`)
        console.log(filenames.join(", "))

        let processed = 0
        let skipped = 0
        let failed = 0

        for (let fi = 0; fi < filenames.length; fi++) {
            const filename = filenames[fi]
            const filePath = path.join(DRAFTS_DIR, filename)

            console.log(`\n${"#".repeat(60)}`)
            console.log(`# FILE ${fi + 1}/${filenames.length}: ${filename}`)
            console.log(`${"#".repeat(60)}`)

            if (!fs.existsSync(filePath)) {
                console.log(`  ⚠ File not found: ${filePath}`)
                failed++
                continue
            }

            try {
                // Parse the file
                const data = parseCsvFile(filePath, filename)
                console.log(`Parsed: ${data.season} ${data.year} ${data.divisionName}`)
                console.log(`Teams: ${data.teams.length}`)

                // Look up season and division
                const { seasonId, divisionId, divisionLevel } = await lookupSeasonAndDivision(
                    data.season,
                    data.year,
                    data.divisionName
                )
                console.log(`Season ID: ${seasonId}, Division ID: ${divisionId}, Level: ${divisionLevel}`)

                // Check for existing drafts
                if (await checkExistingDrafts(seasonId, divisionId)) {
                    console.log(`  ⚠ Drafts already exist for ${data.season} ${data.year} ${data.divisionName}, skipping.`)
                    skipped++
                    continue
                }

                // Resolve users
                await resolveUsers(data, allUsers)

                // Display summary
                displaySummary(data, seasonId, divisionId, divisionLevel)

                if (dryRun) {
                    console.log("\n[DRY RUN] Skipping database insert.")
                    processed++
                    continue
                }

                // Ask for confirmation
                const confirm = await question(`\nInsert ${filename} into the database? [Y/n]: `)

                if (confirm.toLowerCase() === "n" || confirm.toLowerCase() === "no") {
                    console.log(`\nSkipped ${filename}.`)
                    skipped++
                    continue
                }

                // Insert data
                await insertData(data, seasonId, divisionId, divisionLevel)
                console.log(`\n✓ Successfully imported ${filename}!`)
                processed++
            } catch (error) {
                console.error(`\n✗ Error processing ${filename}:`, error instanceof Error ? error.message : error)
                const cont = await question("\nContinue with next file? [Y/n]: ")
                if (cont.toLowerCase() === "n" || cont.toLowerCase() === "no") {
                    break
                }
                failed++
            }
        }

        console.log(`\n${"=".repeat(60)}`)
        console.log("BATCH IMPORT COMPLETE")
        console.log(`  Processed: ${processed}`)
        console.log(`  Skipped:   ${skipped}`)
        console.log(`  Failed:    ${failed}`)
        console.log(`  Total:     ${filenames.length}`)
        console.log("=".repeat(60))

        closeReadline()
        process.exit(0)
    } catch (error) {
        console.error("\nFatal error:", error instanceof Error ? error.message : error)
        closeReadline()
        process.exit(1)
    }
}

main()
