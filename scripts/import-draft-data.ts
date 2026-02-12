#!/usr/bin/env tsx
/**
 * Import Draft Data Script
 *
 * Parses semi-structured draft data and generates SQL to insert teams and draft picks.
 *
 * Usage:
 *   npx tsx scripts/import-draft-data.ts --file input.txt
 *   npx tsx scripts/import-draft-data.ts --interactive
 *
 * Input format:
 *   Line 1: Season Year Division (e.g., "Spring 2024 A")
 *   Line 2: Tab-separated captain last names in team order
 *   Remaining lines: Tab-separated player names per team column
 *   Player names can be "First Last" or "Last, First" format
 */

import "dotenv/config"
import { db } from "../src/database/db"
import {
    users,
    seasons,
    divisions,
    teams,
    drafts
} from "../src/database/schema"
import { eq, and } from "drizzle-orm"
import * as readline from "node:readline"

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
}

let rl: readline.Interface | null = null

function getReadline(): readline.Interface {
    if (!rl) {
        // Use /dev/tty for interactive input when stdin might be used for file input
        const fs = require("node:fs")
        let input = process.stdin
        try {
            input = fs.createReadStream("/dev/tty")
        } catch {
            // Fall back to stdin if /dev/tty is not available
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

function parseName(nameStr: string): ParsedName {
    const trimmed = nameStr.trim()
    if (!trimmed) {
        return { firstName: "", lastName: "", original: "" }
    }

    // Check for "Last, First" format
    if (trimmed.includes(",")) {
        const [last, first] = trimmed.split(",").map((s) => s.trim())
        return {
            firstName: first || "",
            lastName: last || "",
            original: trimmed
        }
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

function parseInputData(input: string): ParsedData {
    const lines = input
        .trim()
        .split("\n")
        .filter((line) => line.trim())

    if (lines.length < 3) {
        throw new Error(
            "Input must have at least 3 lines: header, captains, and players"
        )
    }

    // Parse header: "Spring 2024 A"
    const headerParts = lines[0].trim().split(/\s+/)
    if (headerParts.length < 3) {
        throw new Error(
            `Invalid header format: "${lines[0]}". Expected "Season Year Division"`
        )
    }

    const season = headerParts[0].toLowerCase()
    const year = parseInt(headerParts[1], 10)
    const divisionName = headerParts.slice(2).join(" ")

    if (Number.isNaN(year)) {
        throw new Error(`Invalid year in header: "${headerParts[1]}"`)
    }

    // Parse captain last names (tab-separated)
    const captainLastNames = lines[1]
        .split("\t")
        .map((s) => s.trim())
        .filter(Boolean)
    const numTeams = captainLastNames.length

    if (numTeams === 0) {
        throw new Error("No captain last names found on line 2")
    }

    // Initialize team data
    const teams: TeamData[] = captainLastNames.map((lastName) => ({
        captainLastName: lastName,
        captain: null,
        players: [],
        teamName: ""
    }))

    // Parse player rows
    for (let i = 2; i < lines.length; i++) {
        const playerNames = lines[i].split("\t").map((s) => s.trim())

        for (let t = 0; t < numTeams; t++) {
            const nameStr = playerNames[t] || ""
            if (nameStr) {
                const parsed = parseName(nameStr)
                teams[t].players.push({ name: parsed, user: null })
            }
        }
    }

    return { season, year, divisionName, teams }
}

async function findUserByName(
    firstName: string,
    lastName: string,
    allUsers: User[]
): Promise<User[]> {
    // Normalize for comparison
    const normFirst = firstName.toLowerCase().trim()
    const normLast = lastName.toLowerCase().trim()

    return allUsers.filter((u) => {
        const uFirst = u.first_name.toLowerCase()
        const uLast = u.last_name.toLowerCase()
        const uPref = (u.preffered_name || "").toLowerCase()

        // Match last name exactly
        if (uLast !== normLast) return false

        // Match first name or preferred name
        return (
            uFirst === normFirst ||
            uFirst.startsWith(normFirst) ||
            normFirst.startsWith(uFirst) ||
            uPref === normFirst ||
            uPref.startsWith(normFirst)
        )
    })
}

async function findUserByLastName(
    lastName: string,
    allUsers: User[]
): Promise<User[]> {
    const normLast = lastName.toLowerCase().trim()
    return allUsers.filter((u) => u.last_name.toLowerCase() === normLast)
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
            console.log(
                `  ${i + 1}. ${u.first_name}${pref} ${u.last_name} [${u.id}]`
            )
        })
        console.log("  0. None of these (enter ID manually)")

        const choice = await question("Enter choice (number or user ID): ")

        const num = parseInt(choice, 10)
        if (num > 0 && num <= candidates.length) {
            return candidates[num - 1].id
        }
        if (num === 0 || choice.length > 10) {
            // Validate the ID exists
            const userId =
                num === 0 ? await question("Enter user ID: ") : choice
            const found = allUsers.find((u) => u.id === userId)
            if (found) {
                console.log(
                    `  → Selected: ${found.first_name} ${found.last_name}`
                )
                return userId
            }
            console.log(`  ⚠ User ID "${userId}" not found in database`)
            return promptForUserId(description, candidates, allUsers)
        }
    }

    const userId = await question("Enter user ID: ")
    const found = allUsers.find((u) => u.id === userId)
    if (found) {
        console.log(`  → Selected: ${found.first_name} ${found.last_name}`)
        return userId
    }
    console.log(`  ⚠ User ID "${userId}" not found in database`)
    return promptForUserId(description, [], allUsers)
}

async function resolveUsers(data: ParsedData, allUsers: User[]): Promise<void> {
    console.log(
        `\nResolving users for ${data.season} ${data.year} ${data.divisionName}...`
    )
    console.log(`Found ${data.teams.length} teams\n`)

    // First, resolve captains
    for (let t = 0; t < data.teams.length; t++) {
        const team = data.teams[t]
        console.log(
            `\n--- Team ${t + 1} (Captain: ${team.captainLastName}) ---`
        )

        // Find players with matching last name to identify captain
        const captainCandidatesFromTeam = team.players.filter(
            (p) =>
                p.name.lastName.toLowerCase() ===
                team.captainLastName.toLowerCase()
        )

        if (captainCandidatesFromTeam.length === 1) {
            // Clear match - use this player's full name to find captain
            const captainName = captainCandidatesFromTeam[0].name
            const matches = await findUserByName(
                captainName.firstName,
                captainName.lastName,
                allUsers
            )

            if (matches.length === 1) {
                team.captain = matches[0]
                team.teamName = `Team ${team.captain.last_name}`
                console.log(
                    `Captain: ${team.captain.first_name} ${team.captain.last_name} ✓`
                )
            } else {
                const userId = await promptForUserId(
                    `Captain "${captainName.original}" - multiple or no matches:`,
                    matches,
                    allUsers
                )
                team.captain = allUsers.find((u) => u.id === userId)!
                team.teamName = `Team ${team.captain.last_name}`
            }
        } else if (captainCandidatesFromTeam.length > 1) {
            // Multiple players with same last name as captain
            console.log(
                `Multiple players with last name "${team.captainLastName}":`
            )
            captainCandidatesFromTeam.forEach((p, i) => {
                console.log(`  ${i + 1}. ${p.name.original}`)
            })
            const choice = await question(
                "Which one is the captain? (enter number): "
            )
            const idx = parseInt(choice, 10) - 1

            if (idx >= 0 && idx < captainCandidatesFromTeam.length) {
                const captainName = captainCandidatesFromTeam[idx].name
                const matches = await findUserByName(
                    captainName.firstName,
                    captainName.lastName,
                    allUsers
                )

                if (matches.length === 1) {
                    team.captain = matches[0]
                    team.teamName = `Team ${team.captain.last_name}`
                    console.log(
                        `Captain: ${team.captain.first_name} ${team.captain.last_name} ✓`
                    )
                } else {
                    const userId = await promptForUserId(
                        `Captain "${captainName.original}":`,
                        matches,
                        allUsers
                    )
                    team.captain = allUsers.find((u) => u.id === userId)!
                    team.teamName = `Team ${team.captain.last_name}`
                }
            } else {
                throw new Error("Invalid selection")
            }
        } else {
            // No player with captain's last name - search database directly
            const matches = await findUserByLastName(
                team.captainLastName,
                allUsers
            )
            const userId = await promptForUserId(
                `Could not find captain with last name "${team.captainLastName}" in player list:`,
                matches,
                allUsers
            )
            team.captain = allUsers.find((u) => u.id === userId)!
            team.teamName = `Team ${team.captain.last_name}`
        }
    }

    // Now resolve all players
    for (let t = 0; t < data.teams.length; t++) {
        const team = data.teams[t]
        console.log(`\n--- Resolving players for ${team.teamName} ---`)

        for (const player of team.players) {
            const matches = await findUserByName(
                player.name.firstName,
                player.name.lastName,
                allUsers
            )

            if (matches.length === 1) {
                player.user = matches[0]
                console.log(
                    `  ${player.name.original} → ${player.user.first_name} ${player.user.last_name} ✓`
                )
            } else if (matches.length > 1) {
                // Check if captain is one of the matches
                const captainMatch = matches.find(
                    (m) => m.id === team.captain?.id
                )
                if (
                    captainMatch &&
                    player.name.lastName.toLowerCase() ===
                        team.captainLastName.toLowerCase()
                ) {
                    player.user = captainMatch
                    console.log(
                        `  ${player.name.original} → ${player.user.first_name} ${player.user.last_name} (captain) ✓`
                    )
                } else {
                    const userId = await promptForUserId(
                        `Player "${player.name.original}" - multiple matches:`,
                        matches,
                        allUsers
                    )
                    player.user = allUsers.find((u) => u.id === userId)!
                }
            } else {
                const userId = await promptForUserId(
                    `Player "${player.name.original}" - no matches found:`,
                    [],
                    allUsers
                )
                player.user = allUsers.find((u) => u.id === userId)!
            }
        }
    }
}

async function lookupSeasonAndDivision(
    season: string,
    year: number,
    divisionName: string
): Promise<{ seasonId: number; divisionId: number; divisionLevel: number }> {
    // Find season
    const [seasonRow] = await db
        .select({ id: seasons.id })
        .from(seasons)
        .where(and(eq(seasons.season, season), eq(seasons.year, year)))
        .limit(1)

    if (!seasonRow) {
        throw new Error(`Season "${season} ${year}" not found in database`)
    }

    // Find division
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

function displaySummary(
    data: ParsedData,
    seasonId: number,
    divisionId: number,
    divisionLevel: number
): number {
    const numTeams = data.teams.length
    let totalPicks = 0

    console.log(`\n${"=".repeat(60)}`)
    console.log("IMPORT SUMMARY")
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
        console.log(
            `  Captain: ${team.captain!.first_name} ${team.captain!.last_name}`
        )
        console.log(`  Players (${team.players.length}):`)

        for (let p = 0; p < team.players.length; p++) {
            const player = team.players[p]
            const round = p + 1

            // Snake draft: odd rounds go 1-N, even rounds go N-1
            const isOddRound = round % 2 === 1
            const baseValue = (divisionLevel - 1) * 50 + (round - 1) * numTeams
            const positionValue = isOddRound
                ? teamNumber
                : numTeams + 1 - teamNumber
            const overall = baseValue + positionValue

            console.log(
                `    R${round} (#${overall}): ${player.user!.first_name} ${player.user!.last_name}`
            )
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

    // Insert teams and collect their IDs
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

    // Insert draft picks
    const draftPicks: {
        team: number
        user: string
        round: number
        overall: number
    }[] = []

    for (let t = 0; t < data.teams.length; t++) {
        const team = data.teams[t]
        const teamId = teamIds[t]
        const teamNumber = t + 1

        for (let p = 0; p < team.players.length; p++) {
            const player = team.players[p]
            const round = p + 1

            // Snake draft: odd rounds go 1-N, even rounds go N-1
            const isOddRound = round % 2 === 1
            const baseValue = (divisionLevel - 1) * 50 + (round - 1) * numTeams
            const positionValue = isOddRound
                ? teamNumber
                : numTeams + 1 - teamNumber
            const overall = baseValue + positionValue

            draftPicks.push({
                team: teamId,
                user: player.user!.id,
                round,
                overall
            })
        }
    }

    // Insert all draft picks in one batch
    await db.insert(drafts).values(draftPicks)
    console.log(`  ✓ Inserted ${draftPicks.length} draft picks`)
}

async function main() {
    try {
        // Load all users from database
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

        // Check for --file argument or read from stdin
        const args = process.argv.slice(2)
        let input: string

        if (args.includes("--interactive")) {
            console.log(
                "\nPaste your draft data below (press Ctrl+D when done):\n"
            )
            input = ""
            const interactiveRl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            })
            for await (const line of interactiveRl) {
                input += `${line}\n`
            }
            interactiveRl.close()
        } else if (args.includes("--file")) {
            const fileIndex = args.indexOf("--file")
            const filePath = args[fileIndex + 1]
            if (!filePath) {
                throw new Error("--file requires a path argument")
            }
            const fs = await import("node:fs")
            input = fs.readFileSync(filePath, "utf-8")
        } else {
            // Read from stdin (piped input)
            const fs = await import("node:fs")
            input = fs.readFileSync(0, "utf-8")
        }

        // Parse input data
        const data = parseInputData(input)
        console.log(
            `\nParsed: ${data.season} ${data.year} ${data.divisionName}`
        )
        console.log(`Teams: ${data.teams.length}`)

        // Look up season and division IDs
        const { seasonId, divisionId, divisionLevel } =
            await lookupSeasonAndDivision(
                data.season,
                data.year,
                data.divisionName
            )
        console.log(
            `Season ID: ${seasonId}, Division ID: ${divisionId}, Level: ${divisionLevel}`
        )

        // Resolve all users
        await resolveUsers(data, allUsers)

        // Display summary
        displaySummary(data, seasonId, divisionId, divisionLevel)

        // Ask for confirmation (default is yes)
        const confirm = await question(
            "\nDo you want to insert this data into the database? [Y/n]: "
        )

        if (confirm.toLowerCase() === "n" || confirm.toLowerCase() === "no") {
            console.log("\nAborted. No changes were made.")
            closeReadline()
            process.exit(0)
        }

        // Insert data
        await insertData(data, seasonId, divisionId, divisionLevel)

        console.log(
            `\n✓ Successfully imported ${data.season} ${data.year} ${data.divisionName}!`
        )

        closeReadline()
        process.exit(0)
    } catch (error) {
        console.error(
            "\nError:",
            error instanceof Error ? error.message : error
        )
        closeReadline()
        process.exit(1)
    }
}

main()
