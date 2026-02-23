#!/usr/bin/env tsx

import "dotenv/config"
import * as fs from "node:fs"
import * as path from "node:path"
import * as readline from "node:readline"
import { db } from "../src/database/db"
import {
    divisions,
    matchs,
    seasons,
    teams,
    users
} from "../src/database/schema"
import { and, desc, eq, inArray } from "drizzle-orm"

interface ParsedSetScore {
    home: number
    away: number
}

interface ParsedMatch {
    week: number
    date: string
    time: string
    court: number
    homeTeamNum: number
    awayTeamNum: number
    sets: [ParsedSetScore, ParsedSetScore, ParsedSetScore]
}

interface ParsedFile {
    filePath: string
    fileName: string
    seasonName: string
    seasonYear: number
    divisionCode: string
    titleDivisionCode: string | null
    teamNamesByNum: Map<number, string>
    matches: ParsedMatch[]
}

interface TeamRow {
    id: number
    number: number | null
    captainId: string
    captainFirstName: string
    captainLastName: string
}

const DEFAULT_SOURCE_DIR = "/home/kasm-user/src/bsd-site/public"

let rl: readline.Interface | null = null

function getReadline(): readline.Interface {
    if (!rl) {
        let input: NodeJS.ReadableStream = process.stdin
        try {
            input = fs.createReadStream("/dev/tty")
        } catch {
            input = process.stdin
        }

        rl = readline.createInterface({
            input,
            output: process.stdout
        })
    }

    return rl
}

function closeReadline() {
    if (rl) {
        rl.close()
        rl = null
    }
}

function ask(prompt: string): Promise<string> {
    return new Promise((resolve) => {
        getReadline().question(prompt, (answer) => resolve(answer.trim()))
    })
}

async function askYesNo(
    prompt: string,
    defaultValue: "y" | "n" = "n"
): Promise<boolean> {
    const suffix = defaultValue === "y" ? "[Y/n]" : "[y/N]"

    while (true) {
        const answer = (await ask(`${prompt} ${suffix} `)).toLowerCase()

        if (!answer) {
            return defaultValue === "y"
        }

        if (answer === "y" || answer === "yes") {
            return true
        }

        if (answer === "n" || answer === "no") {
            return false
        }

        console.log("Please answer y or n.")
    }
}

async function askChoice<T>(
    prompt: string,
    options: T[],
    label: (option: T, index: number) => string
): Promise<T> {
    if (options.length === 0) {
        throw new Error("askChoice called with no options")
    }

    console.log(`\n${prompt}`)
    for (let i = 0; i < options.length; i++) {
        console.log(`  ${i + 1}. ${label(options[i], i)}`)
    }

    while (true) {
        const answer = await ask("Choose a number: ")
        const idx = Number.parseInt(answer, 10)

        if (!Number.isNaN(idx) && idx >= 1 && idx <= options.length) {
            return options[idx - 1]
        }

        console.log("Invalid selection.")
    }
}

function parseArgs() {
    const args = process.argv.slice(2)
    let sourceDir = DEFAULT_SOURCE_DIR
    let dryRun = false
    let replaceExisting = false
    let fileFilter: string[] = []

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]

        if (arg === "--dry-run") {
            dryRun = true
            continue
        }

        if (arg === "--replace-existing") {
            replaceExisting = true
            continue
        }

        if (arg === "--dir") {
            sourceDir = args[i + 1] || ""
            i++
            continue
        }

        if (arg === "--files") {
            const raw = args[i + 1] || ""
            i++
            fileFilter = raw
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            continue
        }

        if (arg === "--help" || arg === "-h") {
            console.log(`Usage:
  npx tsx scripts/import-old-match-results.ts [options]

Options:
  --dir <path>            Source directory of old HTML files
  --files <a,b,c>         Comma-separated list of specific filenames
  --dry-run               Parse and map, but do not write DB changes
  --replace-existing      Auto-delete existing matches for target weeks before insert
  --help                  Show this help
`)
            process.exit(0)
        }

        console.log(`Unknown arg: ${arg}`)
        process.exit(1)
    }

    return {
        sourceDir,
        dryRun,
        replaceExisting,
        fileFilter
    }
}

function normalizeDivisionName(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
}

function parseTitleSeasonAndDivision(title: string): {
    seasonName: string
    seasonYear: number
    divisionCode: string | null
} | null {
    const match = title.match(
        /\b(Spring|Summer|Fall)\s+(\d{4})\s+([A-Za-z]+)\s+Division\b/i
    )

    if (!match) {
        return null
    }

    return {
        seasonName: match[1].toLowerCase(),
        seasonYear: Number.parseInt(match[2], 10),
        divisionCode: match[3].toLowerCase()
    }
}

function parsePlayDates(scriptText: string): string[] {
    const playDatesMatch = scriptText.match(
        /var\s+playdates\s*=\s*\[([^\]]+)\]/i
    )
    if (!playDatesMatch) {
        throw new Error("Could not parse playdates array")
    }

    const dateMatches = [...playDatesMatch[1].matchAll(/"([^"]+)"/g)]
    return dateMatches.map((m) => m[1])
}

function parseTeamList(scriptText: string): Map<number, string> {
    const teamMap = new Map<number, string>()

    const teamRegex =
        /teamlist\[(\d+)\]\s*=\s*\{[\s\S]*?name:\s*"([^"]+)"[\s\S]*?\};/g

    for (const match of scriptText.matchAll(teamRegex)) {
        const teamNum = Number.parseInt(match[1], 10)
        const teamName = match[2].trim()
        if (!Number.isNaN(teamNum)) {
            teamMap.set(teamNum, teamName)
        }
    }

    if (teamMap.size === 0) {
        throw new Error("No teamlist entries found")
    }

    return teamMap
}

function parseDefaultCourt(scriptText: string): number {
    const courtMatch = scriptText.match(
        /dates\[d\]\.matches\[m\]\.court\s*=\s*(\d+)/
    )
    if (!courtMatch) {
        return 0
    }
    return Number.parseInt(courtMatch[1], 10)
}

function computeSetWins(
    sets: [ParsedSetScore, ParsedSetScore, ParsedSetScore]
): { homeWins: number; awayWins: number } {
    let homeWins = 0
    let awayWins = 0

    for (const set of sets) {
        if (set.home > set.away) {
            homeWins++
        } else if (set.away > set.home) {
            awayWins++
        }
    }

    return { homeWins, awayWins }
}

function parseMatches(scriptText: string): ParsedMatch[] {
    const playDates = parsePlayDates(scriptText)
    const defaultCourt = parseDefaultCourt(scriptText)
    const parsed: ParsedMatch[] = []

    const weekBlockRegex =
        /\/\/\s*Matches\s*-\s*Week\s*(\d+)\s*([\s\S]*?)(?=\/\/\s*Matches\s*-\s*Week\s*\d+|$)/g

    for (const weekBlock of scriptText.matchAll(weekBlockRegex)) {
        const week = Number.parseInt(weekBlock[1], 10)
        const body = weekBlock[2]

        if (Number.isNaN(week) || week > 6) {
            continue
        }

        const dateIndexMatch = body.match(/date\s*=\s*dates\[(\d+)\]/)
        if (!dateIndexMatch) {
            continue
        }

        const dateIndex = Number.parseInt(dateIndexMatch[1], 10)
        const date = playDates[dateIndex]

        if (!date) {
            throw new Error(
                `Week ${week}: missing playdate for index ${dateIndex}`
            )
        }

        const matchRegex =
            /match\s*=\s*date\.matches\[(\d+)\]\s*;([\s\S]*?)setWins\(match\);/g

        for (const matchBlock of body.matchAll(matchRegex)) {
            const matchBody = matchBlock[2]

            const timeMatch = matchBody.match(/match\.time\s*=\s*"([^"]+)"/)
            const teamsMatch = matchBody.match(
                /match\.teams\s*=\s*\[(\d+)\s*,\s*(\d+)\]/
            )

            if (!timeMatch || !teamsMatch) {
                continue
            }

            const parsedSets: ParsedSetScore[] = []
            for (let g = 0; g < 3; g++) {
                const setRegex = new RegExp(
                    `match\\.games\\[${g}\\]\\.scores\\s*=\\s*\\[(\\d+)\\s*,\\s*(\\d+)\\]`
                )
                const setMatch = matchBody.match(setRegex)

                if (!setMatch) {
                    throw new Error(
                        `Week ${week}, ${timeMatch[1]}: missing set ${g + 1} score`
                    )
                }

                parsedSets.push({
                    home: Number.parseInt(setMatch[1], 10),
                    away: Number.parseInt(setMatch[2], 10)
                })
            }

            const courtOverride = matchBody.match(/match\.court\s*=\s*(\d+)/)
            const court = courtOverride
                ? Number.parseInt(courtOverride[1], 10)
                : defaultCourt

            parsed.push({
                week,
                date,
                time: timeMatch[1],
                court,
                homeTeamNum: Number.parseInt(teamsMatch[1], 10),
                awayTeamNum: Number.parseInt(teamsMatch[2], 10),
                sets: [parsedSets[0], parsedSets[1], parsedSets[2]]
            })
        }
    }

    return parsed
}

function parseFile(filePath: string): ParsedFile {
    const html = fs.readFileSync(filePath, "utf-8")
    const fileName = path.basename(filePath)

    const fileDivisionMatch = fileName
        .toLowerCase()
        .match(/^stand([a-z]+)_(?:4|6)t(?:_[a-z0-9]+)?\.html$/)

    if (!fileDivisionMatch) {
        throw new Error(`Filename format not recognized: ${fileName}`)
    }

    const divisionCode = fileDivisionMatch[1]

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
    if (!titleMatch) {
        throw new Error("Missing <title>")
    }

    const parsedTitle = parseTitleSeasonAndDivision(titleMatch[1].trim())
    if (!parsedTitle) {
        throw new Error(
            `Could not parse season/division from title: ${titleMatch[1]}`
        )
    }

    const scriptBlocks = [
        ...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)
    ]
    const dataScript =
        scriptBlocks.find((block) => block[1].includes("var teamlist"))?.[1] ||
        ""

    if (!dataScript) {
        throw new Error("Could not find data <script> block")
    }

    const teamNamesByNum = parseTeamList(dataScript)
    const matches = parseMatches(dataScript)

    return {
        filePath,
        fileName,
        seasonName: parsedTitle.seasonName,
        seasonYear: parsedTitle.seasonYear,
        divisionCode,
        titleDivisionCode: parsedTitle.divisionCode,
        teamNamesByNum,
        matches
    }
}

async function resolveSeasonId(parsed: ParsedFile): Promise<number> {
    const seasonRows = await db
        .select({ id: seasons.id, year: seasons.year, season: seasons.season })
        .from(seasons)
        .orderBy(desc(seasons.id))

    const candidates = seasonRows.filter(
        (s) =>
            s.year === parsed.seasonYear &&
            s.season.toLowerCase() === parsed.seasonName.toLowerCase()
    )

    if (candidates.length === 1) {
        return candidates[0].id
    }

    if (candidates.length > 1) {
        const chosen = await askChoice(
            `Multiple seasons match ${parsed.seasonName} ${parsed.seasonYear} for ${parsed.fileName}:`,
            candidates,
            (s) => `id=${s.id} ${s.season} ${s.year}`
        )
        return chosen.id
    }

    const chosen = await askChoice(
        `No exact season match for ${parsed.fileName} (${parsed.seasonName} ${parsed.seasonYear}). Pick target season:`,
        seasonRows,
        (s) => `id=${s.id} ${s.season} ${s.year}`
    )
    return chosen.id
}

async function resolveDivisionId(parsed: ParsedFile): Promise<number> {
    const divisionRows = await db
        .select({
            id: divisions.id,
            name: divisions.name,
            level: divisions.level
        })
        .from(divisions)
        .orderBy(divisions.level)

    const normalizedFileDivision = normalizeDivisionName(parsed.divisionCode)
    const candidates = divisionRows.filter(
        (d) => normalizeDivisionName(d.name) === normalizedFileDivision
    )

    if (
        parsed.titleDivisionCode &&
        normalizeDivisionName(parsed.titleDivisionCode) !==
            normalizedFileDivision
    ) {
        const proceed = await askYesNo(
            `Division mismatch in ${parsed.fileName}: filename=${parsed.divisionCode}, title=${parsed.titleDivisionCode}. Continue?`,
            "n"
        )
        if (!proceed) {
            throw new Error("User aborted due to division mismatch")
        }
    }

    if (candidates.length === 1) {
        return candidates[0].id
    }

    const chosen = await askChoice(
        `Could not uniquely map division for ${parsed.fileName} (code=${parsed.divisionCode}). Pick target division:`,
        divisionRows,
        (d) => `id=${d.id} ${d.name} (level ${d.level})`
    )

    return chosen.id
}

async function resolveTeamMap(
    parsed: ParsedFile,
    seasonId: number,
    divisionId: number
): Promise<Map<number, number>> {
    const teamRows = await db
        .select({
            id: teams.id,
            number: teams.number,
            captainId: teams.captain,
            captainFirstName: users.first_name,
            captainLastName: users.last_name
        })
        .from(teams)
        .innerJoin(users, eq(teams.captain, users.id))
        .where(and(eq(teams.season, seasonId), eq(teams.division, divisionId)))
        .orderBy(teams.number)

    if (teamRows.length === 0) {
        throw new Error(
            `No teams found in DB for season=${seasonId}, division=${divisionId}`
        )
    }

    const allTeamNums = new Set<number>()
    for (const m of parsed.matches) {
        allTeamNums.add(m.homeTeamNum)
        allTeamNums.add(m.awayTeamNum)
    }
    const sortedTeamNums = [...allTeamNums].sort((a, b) => a - b)

    const result = new Map<number, number>()
    const usedTeamIds = new Set<number>()

    const formatTeamOption = (team: TeamRow) => {
        const numPart = team.number !== null ? `#${team.number}` : "#?"
        return `teamId=${team.id} ${numPart} captain=${team.captainFirstName} ${team.captainLastName}`
    }

    for (const teamNum of sortedTeamNums) {
        const oldCaptainLastRaw = parsed.teamNamesByNum.get(teamNum) || ""
        const oldCaptainLast = oldCaptainLastRaw.toLowerCase()

        const byNumber = teamRows.find((t) => t.number === teamNum) || null
        const byCaptainLast = oldCaptainLast
            ? teamRows.filter(
                  (t) => t.captainLastName.toLowerCase() === oldCaptainLast
              )
            : []
        const byCaptainLastUnique =
            byCaptainLast.length === 1 ? byCaptainLast[0] : null

        let chosenTeam: TeamRow | null = null

        // Strongest case: both number and captain-last-name point to same team.
        if (
            byNumber &&
            byCaptainLastUnique &&
            byNumber.id === byCaptainLastUnique.id &&
            !usedTeamIds.has(byNumber.id)
        ) {
            chosenTeam = byNumber
        } else if (
            byNumber &&
            byCaptainLastUnique &&
            byNumber.id !== byCaptainLastUnique.id
        ) {
            // Signals conflict: ask user which mapping to trust.
            const candidates = [byNumber, byCaptainLastUnique, ...teamRows]
                .filter(
                    (t, i, arr) => arr.findIndex((x) => x.id === t.id) === i
                )
                .filter((t) => !usedTeamIds.has(t.id))

            if (candidates.length === 0) {
                throw new Error(
                    `No available teams left while resolving conflict for old team #${teamNum}`
                )
            }

            chosenTeam = await askChoice(
                `Team mapping conflict for old team #${teamNum} (${oldCaptainLastRaw}) in ${parsed.fileName}. Number maps to [${formatTeamOption(
                    byNumber
                )}], captain-last maps to [${formatTeamOption(byCaptainLastUnique)}]. Choose target team:`,
                candidates,
                (team) => formatTeamOption(team)
            )
        } else if (
            byNumber &&
            !byCaptainLastUnique &&
            byCaptainLast.length <= 1
        ) {
            // Only number mapping is available.
            if (!usedTeamIds.has(byNumber.id)) {
                chosenTeam = byNumber
            }
        } else if (!byNumber && byCaptainLastUnique) {
            // Only captain-last mapping is available.
            if (!usedTeamIds.has(byCaptainLastUnique.id)) {
                chosenTeam = byCaptainLastUnique
            }
        } else if (byCaptainLast.length > 1) {
            // Ambiguous captain-last-name mapping: ask user.
            const candidates = byCaptainLast.filter(
                (t) => !usedTeamIds.has(t.id)
            )
            if (candidates.length > 0) {
                chosenTeam = await askChoice(
                    `Captain last-name "${oldCaptainLastRaw}" matched multiple teams for old team #${teamNum} in ${parsed.fileName}. Choose target team:`,
                    candidates,
                    (team) => formatTeamOption(team)
                )
            }
        }

        if (!chosenTeam) {
            const options = teamRows.filter((t) => !usedTeamIds.has(t.id))
            if (options.length === 0) {
                throw new Error(
                    `No unassigned teams left to map old team #${teamNum} (${oldCaptainLastRaw})`
                )
            }

            chosenTeam = await askChoice(
                `Map old team #${teamNum} (${oldCaptainLastRaw || "unknown"}) in ${parsed.fileName}:`,
                options,
                (team) => formatTeamOption(team)
            )
        }

        result.set(teamNum, chosenTeam.id)
        usedTeamIds.add(chosenTeam.id)
    }

    return result
}

async function maybeReplaceExistingMatches(
    seasonId: number,
    divisionId: number,
    weeks: number[],
    replaceExistingFlag: boolean,
    dryRun: boolean
): Promise<"continue" | "skip"> {
    const uniqueWeeks = [...new Set(weeks)].sort((a, b) => a - b)

    const existing = await db
        .select({ id: matchs.id, week: matchs.week })
        .from(matchs)
        .where(
            and(
                eq(matchs.season, seasonId),
                eq(matchs.division, divisionId),
                inArray(matchs.week, uniqueWeeks)
            )
        )

    if (existing.length === 0) {
        return "continue"
    }

    const shouldReplace = replaceExistingFlag
        ? true
        : await askChoice(
              `Found ${existing.length} existing match row(s) for season=${seasonId}, division=${divisionId}, weeks=${uniqueWeeks.join(", ")}.`,
              ["replace", "skip", "append"],
              (value) =>
                  value === "replace"
                      ? "Replace existing rows for these weeks"
                      : value === "skip"
                        ? "Skip this file"
                        : "Append anyway (may create duplicates)"
          )

    if (shouldReplace === "skip") {
        return "skip"
    }

    if (shouldReplace === "replace") {
        if (dryRun) {
            console.log(
                `DRY RUN: would delete ${existing.length} existing match row(s)`
            )
        } else {
            await db
                .delete(matchs)
                .where(
                    and(
                        eq(matchs.season, seasonId),
                        eq(matchs.division, divisionId),
                        inArray(matchs.week, uniqueWeeks)
                    )
                )
            console.log(`Deleted ${existing.length} existing match row(s)`)
        }
    }

    return "continue"
}

function getSourceFiles(dir: string, fileFilter: string[]): string[] {
    const allowedPattern = /^stand[a-z]+_(?:4|6)t(?:_[a-z0-9]+)?\.html$/i

    if (fileFilter.length > 0) {
        return fileFilter
            .map((file) => path.resolve(dir, file))
            .filter((fullPath) => fs.existsSync(fullPath))
    }

    return fs
        .readdirSync(dir)
        .filter((file) => allowedPattern.test(file))
        .sort()
        .map((file) => path.resolve(dir, file))
}

async function main() {
    const { sourceDir, dryRun, replaceExisting, fileFilter } = parseArgs()

    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is not set")
    }

    if (!fs.existsSync(sourceDir)) {
        throw new Error(`Source directory does not exist: ${sourceDir}`)
    }

    const sourceFiles = getSourceFiles(sourceDir, fileFilter)

    if (sourceFiles.length === 0) {
        throw new Error("No source files found")
    }

    console.log(`Source dir: ${sourceDir}`)
    console.log(`Files found: ${sourceFiles.length}`)
    console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE IMPORT"}`)

    const shouldContinue = await askYesNo("Proceed with parsing/import?", "y")
    if (!shouldContinue) {
        console.log("Aborted.")
        return
    }

    let importedFiles = 0
    let importedRows = 0

    for (const filePath of sourceFiles) {
        const fileName = path.basename(filePath)
        console.log(`\n=== ${fileName} ===`)

        let parsed: ParsedFile
        try {
            parsed = parseFile(filePath)
        } catch (error) {
            console.error(`Parse failed for ${fileName}:`, error)
            const continueNext = await askYesNo(
                "Skip this file and continue?",
                "y"
            )
            if (continueNext) {
                continue
            }
            throw error
        }

        if (parsed.matches.length === 0) {
            console.log(
                "No regular-season matches found (weeks 1-6). Skipping."
            )
            continue
        }

        const seasonId = await resolveSeasonId(parsed)
        const divisionId = await resolveDivisionId(parsed)
        const teamMap = await resolveTeamMap(parsed, seasonId, divisionId)

        const skipOrContinue = await maybeReplaceExistingMatches(
            seasonId,
            divisionId,
            parsed.matches.map((m) => m.week),
            replaceExisting,
            dryRun
        )

        if (skipOrContinue === "skip") {
            console.log("Skipped by user.")
            continue
        }

        const rows = parsed.matches.map((m) => {
            const homeTeamId = teamMap.get(m.homeTeamNum)
            const awayTeamId = teamMap.get(m.awayTeamNum)

            if (!homeTeamId || !awayTeamId) {
                throw new Error(
                    `Missing team mapping in ${fileName} for match week=${m.week} ${m.homeTeamNum} vs ${m.awayTeamNum}`
                )
            }

            const { homeWins, awayWins } = computeSetWins(m.sets)

            let winnerTeamId = homeTeamId
            if (awayWins > homeWins) {
                winnerTeamId = awayTeamId
            } else if (homeWins === awayWins) {
                throw new Error(
                    `Tied set wins in ${fileName}, week=${m.week}, ${m.time}. Manual resolution required.`
                )
            }

            return {
                season: seasonId,
                division: divisionId,
                week: m.week,
                date: m.date,
                time: m.time,
                court: m.court,
                home_team: homeTeamId,
                away_team: awayTeamId,
                home_score: homeWins,
                away_score: awayWins,
                home_set1_score: m.sets[0].home,
                away_set1_score: m.sets[0].away,
                home_set2_score: m.sets[1].home,
                away_set2_score: m.sets[1].away,
                home_set3_score: m.sets[2].home,
                away_set3_score: m.sets[2].away,
                winner: winnerTeamId,
                playoff: false
            }
        })

        console.log(
            `Parsed ${rows.length} match rows for season=${seasonId}, division=${divisionId}`
        )

        if (dryRun) {
            importedFiles++
            importedRows += rows.length
            console.log("DRY RUN: no rows inserted")
            continue
        }

        await db.insert(matchs).values(rows)

        importedFiles++
        importedRows += rows.length
        console.log(`Inserted ${rows.length} rows`)
    }

    console.log("\n=== Import Complete ===")
    console.log(`Files imported: ${importedFiles}`)
    console.log(`Rows imported: ${importedRows}`)
}

main()
    .catch((error) => {
        console.error("Import failed:", error)
        process.exitCode = 1
    })
    .finally(() => {
        closeReadline()
    })
