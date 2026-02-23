#!/usr/bin/env tsx

import "dotenv/config"
import * as fs from "node:fs"
import * as path from "node:path"
import * as readline from "node:readline"
import { db } from "../src/database/db"
import {
    divisions,
    matchs,
    playoffMatchesMeta,
    seasons,
    teams,
    users
} from "../src/database/schema"
import { and, desc, eq, inArray } from "drizzle-orm"

interface ParsedSetScore {
    home: number
    away: number
}

interface RawPlayoffMatch {
    week: number
    date: string
    time: string
    court: number
    matchNum: number
    homeRef: string
    awayRef: string
    workRef: string | null
    sets: ParsedSetScore[]
}

interface ResolvedPlayoffMatch {
    week: number
    date: string
    time: string
    court: number
    matchNum: number
    homeRef: string
    awayRef: string
    workRef: string | null
    homeTeamNum: number | null
    awayTeamNum: number | null
    sets: ParsedSetScore[]
    homeWins: number
    awayWins: number
    winnerTeamNum: number | null
    loserTeamNum: number | null
}

interface ParsedFile {
    filePath: string
    fileName: string
    seasonName: string | null
    seasonYear: number | null
    divisionCode: string
    titleDivisionCode: string | null
    teamNamesByNum: Map<number, string>
    seeds: number[]
    matches: RawPlayoffMatch[]
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
    let weekOffset = 6

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

        if (arg === "--week-offset") {
            weekOffset = Number.parseInt(args[i + 1] || "6", 10)
            i++
            continue
        }

        if (arg === "--help" || arg === "-h") {
            console.log(`Usage:
  npx tsx scripts/import-old-playoff-results.ts [options]

Options:
  --dir <path>            Source directory of old HTML files
  --files <a,b,c>         Comma-separated list of specific filenames
  --dry-run               Parse and map, but do not write DB changes
  --replace-existing      Auto-delete existing playoff rows for target weeks before insert
  --week-offset <n>       Add offset to playoff week numbers (default 6 => playoff weeks 1-3 become 7-9)
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
        fileFilter,
        weekOffset
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

function parsePlayoffTitleDivision(title: string): string | null {
    const explicit = title.match(
        /Bump\s+Set\s+Drink\s+([A-Za-z]+)\s+Division\s+Playoff/i
    )
    if (explicit) {
        return explicit[1].toLowerCase()
    }

    const generic = title.match(/\b([A-Za-z]+)\s+Division\s+Playoff/i)
    if (generic) {
        return generic[1].toLowerCase()
    }

    return null
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
        /teamlist\[\d+\]\s*=\s*\{[\s\S]*?num\s*:\s*(\d+)[\s\S]*?name\s*:\s*"([^"]+)"[\s\S]*?\};/g

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

function parseSeeds(scriptText: string): number[] {
    const seedsMatch = scriptText.match(/var\s+seeds\s*=\s*\[([^\]]+)\]/i)
    if (!seedsMatch) {
        throw new Error("Could not parse seeds array")
    }

    const values = seedsMatch[1]
        .split(",")
        .map((v) => Number.parseInt(v.trim(), 10))
        .filter((n) => !Number.isNaN(n))

    if (values.length === 0) {
        throw new Error("Seeds array is empty")
    }

    return values
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

function parseRawMatches(scriptText: string): RawPlayoffMatch[] {
    const playDates = parsePlayDates(scriptText)
    const defaultCourt = parseDefaultCourt(scriptText)
    const parsed: RawPlayoffMatch[] = []

    const weekBlockRegex =
        /\/\/\s*Matches\s*-\s*Playoff\s+Week\s*(\d+)[\s\S]*?\n([\s\S]*?)(?=\/\/\s*Matches\s*-\s*Playoff\s+Week\s*\d+|$)/g

    for (const weekBlock of scriptText.matchAll(weekBlockRegex)) {
        const week = Number.parseInt(weekBlock[1], 10)
        const body = weekBlock[2]

        if (Number.isNaN(week)) {
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

            const matchNumMatch = matchBody.match(/match\.num\s*=\s*(\d+)/)
            const timeMatch = matchBody.match(/match\.time\s*=\s*"([^"]+)"/)
            const teamsMatch = matchBody.match(
                /match\.teams\s*=\s*\[([^\]]+)\]/
            )
            const workMatch = matchBody.match(/match\.work\s*=\s*"([^"]+)"/)

            if (!matchNumMatch || !timeMatch || !teamsMatch) {
                continue
            }

            const teamRefs = teamsMatch[1]
                .split(",")
                .map((t) => t.trim().replace(/^"|"$/g, ""))
                .filter(Boolean)

            if (teamRefs.length < 2) {
                continue
            }

            const setRows = [
                ...matchBody.matchAll(
                    /match\.games\[(\d+)\]\.scores\s*=\s*\[(\d+)\s*,\s*(\d+)\]/g
                )
            ]
                .map((m) => ({
                    idx: Number.parseInt(m[1], 10),
                    home: Number.parseInt(m[2], 10),
                    away: Number.parseInt(m[3], 10)
                }))
                .filter((s) => !Number.isNaN(s.idx))
                .sort((a, b) => a.idx - b.idx)
                .slice(0, 3)

            const sets: ParsedSetScore[] = setRows.map((s) => ({
                home: s.home,
                away: s.away
            }))

            const courtOverride = matchBody.match(/match\.court\s*=\s*(\d+)/)
            const court = courtOverride
                ? Number.parseInt(courtOverride[1], 10)
                : defaultCourt

            parsed.push({
                week,
                date,
                time: timeMatch[1],
                court,
                matchNum: Number.parseInt(matchNumMatch[1], 10),
                homeRef: teamRefs[0],
                awayRef: teamRefs[1],
                workRef: workMatch?.[1] || null,
                sets
            })
        }
    }

    return parsed
}

function tryParseSeasonFromLinkedStandings(
    html: string,
    sourceDir: string
): { seasonName: string; seasonYear: number } | null {
    const links = [...html.matchAll(/href\s*=\s*"([^"]*stand[^"]+\.html)"/gi)]
        .map((m) => m[1])
        .filter(Boolean)

    for (const href of links) {
        const standPath = path.resolve(sourceDir, href)
        if (!fs.existsSync(standPath)) {
            continue
        }

        const standHtml = fs.readFileSync(standPath, "utf-8")
        const titleMatch = standHtml.match(/<title>([^<]+)<\/title>/i)
        if (!titleMatch) {
            continue
        }

        const parsed = parseTitleSeasonAndDivision(titleMatch[1].trim())
        if (parsed) {
            return {
                seasonName: parsed.seasonName,
                seasonYear: parsed.seasonYear
            }
        }
    }

    return null
}

function parseFile(filePath: string, sourceDir: string): ParsedFile {
    const html = fs.readFileSync(filePath, "utf-8")
    const fileName = path.basename(filePath)

    const fileDivisionMatch = fileName
        .toLowerCase()
        .match(/^play([a-z]+)_(?:4|6)t(?:_[a-z0-9]+)?\.html$/)

    if (!fileDivisionMatch) {
        throw new Error(`Filename format not recognized: ${fileName}`)
    }

    const divisionCode = fileDivisionMatch[1]

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
    if (!titleMatch) {
        throw new Error("Missing <title>")
    }

    const title = titleMatch[1].trim()
    const titleDivisionCode = parsePlayoffTitleDivision(title)

    const titleSeason = parseTitleSeasonAndDivision(title)
    const linkedSeason = tryParseSeasonFromLinkedStandings(html, sourceDir)

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
    const seeds = parseSeeds(dataScript)
    const matches = parseRawMatches(dataScript)

    const seasonName =
        titleSeason?.seasonName || linkedSeason?.seasonName || null
    const seasonYear =
        titleSeason?.seasonYear || linkedSeason?.seasonYear || null

    return {
        filePath,
        fileName,
        seasonName,
        seasonYear,
        divisionCode,
        titleDivisionCode,
        teamNamesByNum,
        seeds,
        matches
    }
}

async function resolveSeasonId(parsed: ParsedFile): Promise<{
    seasonId: number
    manuallySelected: boolean
}> {
    const seasonRows = await db
        .select({ id: seasons.id, year: seasons.year, season: seasons.season })
        .from(seasons)
        .orderBy(desc(seasons.id))

    let selectedSeason: { id: number; year: number; season: string } | undefined
    let manuallySelected = false

    if (parsed.seasonName && parsed.seasonYear) {
        const candidates = seasonRows.filter(
            (s) =>
                s.year === parsed.seasonYear &&
                s.season.toLowerCase() === parsed.seasonName?.toLowerCase()
        )

        if (candidates.length === 1) {
            selectedSeason = candidates[0]
        } else if (candidates.length > 1) {
            selectedSeason = await askChoice(
                `Multiple seasons match ${parsed.seasonName} ${parsed.seasonYear} for ${parsed.fileName}:`,
                candidates,
                (s) => `id=${s.id} ${s.season} ${s.year}`
            )
            manuallySelected = true
        }
    }

    if (!selectedSeason) {
        selectedSeason = await askChoice(
            `Could not uniquely resolve season for ${parsed.fileName}. Pick target season:`,
            seasonRows,
            (s) => `id=${s.id} ${s.season} ${s.year}`
        )
        manuallySelected = true
    }

    // Always confirm the selected season before proceeding.
    while (true) {
        const confirmed = await askYesNo(
            `Using season id=${selectedSeason.id} (${selectedSeason.season} ${selectedSeason.year}) for ${parsed.fileName}. Is this correct?`,
            "y"
        )

        if (confirmed) {
            return { seasonId: selectedSeason.id, manuallySelected }
        }

        selectedSeason = await askChoice(
            `Select the correct season for ${parsed.fileName}:`,
            seasonRows,
            (s) => `id=${s.id} ${s.season} ${s.year}`
        )
        manuallySelected = true
    }
}

async function resolveSeasonIdWithDefault(
    parsed: ParsedFile,
    defaultSeasonId?: number
): Promise<{ seasonId: number; manuallySelected: boolean }> {
    const seasonRows = await db
        .select({ id: seasons.id, year: seasons.year, season: seasons.season })
        .from(seasons)
        .orderBy(desc(seasons.id))

    if (defaultSeasonId) {
        const defaultSeason = seasonRows.find((s) => s.id === defaultSeasonId)
        if (defaultSeason) {
            const useDefault = await askYesNo(
                `Default season is id=${defaultSeason.id} (${defaultSeason.season} ${defaultSeason.year}) for ${parsed.fileName}. Use this?`,
                "y"
            )

            if (useDefault) {
                return {
                    seasonId: defaultSeason.id,
                    manuallySelected: false
                }
            }
        }
    }

    const seasonResolution = await resolveSeasonId(parsed)
    return {
        seasonId: seasonResolution.seasonId,
        manuallySelected: seasonResolution.manuallySelected
    }
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
        const refs = [m.homeRef, m.awayRef]
        for (const ref of refs) {
            const directNum = Number.parseInt(ref, 10)
            if (!Number.isNaN(directNum)) {
                allTeamNums.add(directNum)
            }
        }
    }
    for (const seedTeam of parsed.seeds) {
        allTeamNums.add(seedTeam)
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

        // Intentionally map by captain last name only.
        const byCaptainLast = oldCaptainLast
            ? teamRows.filter(
                  (t) => t.captainLastName.toLowerCase() === oldCaptainLast
              )
            : []

        let chosenTeam: TeamRow | null = null

        if (
            byCaptainLast.length === 1 &&
            !usedTeamIds.has(byCaptainLast[0].id)
        ) {
            chosenTeam = byCaptainLast[0]
        } else if (byCaptainLast.length > 1) {
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
                `No unique captain-last-name match for old team #${teamNum} (${oldCaptainLastRaw || "unknown"}) in ${parsed.fileName}. Choose target team manually:`,
                options,
                (team) => formatTeamOption(team)
            )
        }

        result.set(teamNum, chosenTeam.id)
        usedTeamIds.add(chosenTeam.id)
    }

    return result
}

function resolveTeamRef(
    ref: string,
    seeds: number[],
    winnerByMatch: Map<number, number>,
    loserByMatch: Map<number, number>
): number | null {
    const normalized = ref.trim().replace(/^"|"$/g, "")

    if (isByeLikeRef(normalized)) {
        return null
    }

    const directNum = Number.parseInt(normalized, 10)
    if (!Number.isNaN(directNum)) {
        return directNum
    }

    const seedMatch = normalized.match(/^S(?:eed)?(\d+)$/i)
    if (seedMatch) {
        const seedIndex = Number.parseInt(seedMatch[1], 10) - 1
        return seeds[seedIndex] || null
    }

    const winnerMatch = normalized.match(/^W(?:inner)?(\d+)$/i)
    if (winnerMatch) {
        const matchNum = Number.parseInt(winnerMatch[1], 10)
        return winnerByMatch.get(matchNum) || null
    }

    const loserMatch = normalized.match(/^L(?:oser)?(\d+)$/i)
    if (loserMatch) {
        const matchNum = Number.parseInt(loserMatch[1], 10)
        return loserByMatch.get(matchNum) || null
    }

    return null
}

function isByeLikeRef(ref: string): boolean {
    return /^(?:BYE|OPEN|TBD|-|NONE)$/i.test(ref.trim().replace(/^"|"$/g, ""))
}

function computeSetWins(sets: ParsedSetScore[]): {
    homeWins: number
    awayWins: number
} {
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

function inferBracket(homeRef: string, awayRef: string): string | null {
    const refs = [homeRef, awayRef].map((r) => r.trim().toUpperCase())
    const hasL = refs.some((r) => /^L(?:OSER)?\d+$/.test(r))
    const hasS = refs.some((r) => /^S(?:EED)?\d+$/.test(r))

    if (hasS && !hasL) {
        return "winners"
    }

    if (hasL) {
        return "losers"
    }

    return null
}

async function askTeamNumForRef(
    ref: string,
    parsed: ParsedFile
): Promise<number> {
    const options = [...parsed.teamNamesByNum.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([num, name]) => ({ num, name }))

    const chosen = await askChoice(
        `Could not resolve team reference "${ref}" in ${parsed.fileName}. Choose team number:`,
        options,
        (option) => `${option.num} (${option.name})`
    )

    return chosen.num
}

async function askNonTieGameWins(
    match: RawPlayoffMatch,
    homeName: string,
    awayName: string
): Promise<{ homeWins: number; awayWins: number }> {
    while (true) {
        const answer = await ask(
            `Match #${match.matchNum} (${homeName} vs ${awayName}) has tied set wins. Enter final game wins as home-away (e.g., 2-1): `
        )

        const parsed = answer.match(/^(\d+)\s*[-:]\s*(\d+)$/)
        if (!parsed) {
            console.log("Invalid format. Use home-away, e.g., 2-1")
            continue
        }

        const homeWins = Number.parseInt(parsed[1], 10)
        const awayWins = Number.parseInt(parsed[2], 10)

        if (Number.isNaN(homeWins) || Number.isNaN(awayWins)) {
            console.log("Invalid values.")
            continue
        }

        if (homeWins === awayWins) {
            console.log("Winner cannot be tied.")
            continue
        }

        if (homeWins < 0 || awayWins < 0 || homeWins > 3 || awayWins > 3) {
            console.log("Game wins should be between 0 and 3.")
            continue
        }

        return { homeWins, awayWins }
    }
}

async function resolveBracketMatches(
    parsed: ParsedFile
): Promise<ResolvedPlayoffMatch[]> {
    const winnerByMatch = new Map<number, number>()
    const loserByMatch = new Map<number, number>()

    const rawSorted = [...parsed.matches].sort((a, b) => {
        if (a.matchNum !== b.matchNum) {
            return a.matchNum - b.matchNum
        }
        if (a.week !== b.week) {
            return a.week - b.week
        }
        return a.time.localeCompare(b.time)
    })

    const resolved: ResolvedPlayoffMatch[] = []

    for (const match of rawSorted) {
        if (match.sets.length === 0) {
            const shouldSkip = await askYesNo(
                `Match #${match.matchNum} in ${parsed.fileName} has no set scores. Skip this match?`,
                "y"
            )
            if (shouldSkip) {
                continue
            }
        }

        let homeTeamNum = resolveTeamRef(
            match.homeRef,
            parsed.seeds,
            winnerByMatch,
            loserByMatch
        )
        let awayTeamNum = resolveTeamRef(
            match.awayRef,
            parsed.seeds,
            winnerByMatch,
            loserByMatch
        )

        if (homeTeamNum === null && !isByeLikeRef(match.homeRef)) {
            homeTeamNum = await askTeamNumForRef(match.homeRef, parsed)
        }

        if (awayTeamNum === null && !isByeLikeRef(match.awayRef)) {
            awayTeamNum = await askTeamNumForRef(match.awayRef, parsed)
        }

        if (
            homeTeamNum !== null &&
            awayTeamNum !== null &&
            homeTeamNum === awayTeamNum
        ) {
            const shouldProceed = await askYesNo(
                `Match #${match.matchNum} resolved to same team (${homeTeamNum}) on both sides. Continue anyway?`,
                "n"
            )
            if (!shouldProceed) {
                throw new Error(
                    `Aborted due to invalid team resolution for match #${match.matchNum}`
                )
            }
        }

        let { homeWins, awayWins } = computeSetWins(match.sets)

        // Handle BYE/placeholder side.
        if (homeTeamNum !== null && awayTeamNum === null) {
            homeWins = Math.max(homeWins, 1)
            awayWins = 0
        } else if (homeTeamNum === null && awayTeamNum !== null) {
            homeWins = 0
            awayWins = Math.max(awayWins, 1)
        } else if (homeTeamNum === null && awayTeamNum === null) {
            const shouldSkip = await askYesNo(
                `Match #${match.matchNum} in ${parsed.fileName} resolved to no teams (both refs null/bye). Skip this match?`,
                "y"
            )
            if (shouldSkip) {
                continue
            }
        } else if (homeWins === awayWins) {
            const resolvedHomeTeamNum = homeTeamNum as number
            const resolvedAwayTeamNum = awayTeamNum as number
            const homeName =
                parsed.teamNamesByNum.get(resolvedHomeTeamNum) ||
                `#${resolvedHomeTeamNum}`
            const awayName =
                parsed.teamNamesByNum.get(resolvedAwayTeamNum) ||
                `#${resolvedAwayTeamNum}`
            const manual = await askNonTieGameWins(match, homeName, awayName)
            homeWins = manual.homeWins
            awayWins = manual.awayWins
        }

        let winnerTeamNum: number | null = null
        let loserTeamNum: number | null = null
        if (homeTeamNum !== null && awayTeamNum !== null) {
            const homeWinsMatch = homeWins > awayWins
            winnerTeamNum = homeWinsMatch ? homeTeamNum : awayTeamNum
            loserTeamNum = homeWinsMatch ? awayTeamNum : homeTeamNum
        } else if (homeTeamNum !== null && awayTeamNum === null) {
            winnerTeamNum = homeTeamNum
        } else if (homeTeamNum === null && awayTeamNum !== null) {
            winnerTeamNum = awayTeamNum
        }

        if (winnerTeamNum !== null) {
            winnerByMatch.set(match.matchNum, winnerTeamNum)
        }
        if (loserTeamNum !== null) {
            loserByMatch.set(match.matchNum, loserTeamNum)
        }

        resolved.push({
            week: match.week,
            date: match.date,
            time: match.time,
            court: match.court,
            matchNum: match.matchNum,
            homeRef: match.homeRef,
            awayRef: match.awayRef,
            workRef: match.workRef,
            homeTeamNum,
            awayTeamNum,
            sets: match.sets,
            homeWins,
            awayWins,
            winnerTeamNum,
            loserTeamNum
        })
    }

    return resolved
}

function buildWinnerLoserMaps(matches: ResolvedPlayoffMatch[]): {
    winnerByMatch: Map<number, number>
    loserByMatch: Map<number, number>
} {
    const winnerByMatch = new Map<number, number>()
    const loserByMatch = new Map<number, number>()

    for (const match of matches) {
        if (match.winnerTeamNum !== null) {
            winnerByMatch.set(match.matchNum, match.winnerTeamNum)
        }
        if (match.loserTeamNum !== null) {
            loserByMatch.set(match.matchNum, match.loserTeamNum)
        }
    }

    return { winnerByMatch, loserByMatch }
}

async function maybeReplaceExistingMatches(
    seasonId: number,
    divisionId: number,
    weeks: number[],
    replaceExistingFlag: boolean,
    dryRun: boolean
): Promise<"continue" | "skip"> {
    const uniqueWeeks = [...new Set(weeks)].sort((a, b) => a - b)

    const [existingMatches, existingMeta] = await Promise.all([
        db
            .select({ id: matchs.id, week: matchs.week })
            .from(matchs)
            .where(
                and(
                    eq(matchs.season, seasonId),
                    eq(matchs.division, divisionId),
                    eq(matchs.playoff, true),
                    inArray(matchs.week, uniqueWeeks)
                )
            ),
        db
            .select({
                id: playoffMatchesMeta.id,
                week: playoffMatchesMeta.week
            })
            .from(playoffMatchesMeta)
            .where(
                and(
                    eq(playoffMatchesMeta.season, seasonId),
                    eq(playoffMatchesMeta.division, divisionId),
                    inArray(playoffMatchesMeta.week, uniqueWeeks)
                )
            )
    ])

    if (existingMatches.length === 0 && existingMeta.length === 0) {
        return "continue"
    }

    const shouldReplace = replaceExistingFlag
        ? true
        : await askChoice(
              `Found existing playoff data for season=${seasonId}, division=${divisionId}, weeks=${uniqueWeeks.join(", ")}: ${existingMatches.length} match rows, ${existingMeta.length} meta rows.`,
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
                `DRY RUN: would delete ${existingMatches.length} existing playoff match row(s) and ${existingMeta.length} meta row(s)`
            )
        } else {
            // Delete meta first because it may reference matchs rows.
            await db
                .delete(playoffMatchesMeta)
                .where(
                    and(
                        eq(playoffMatchesMeta.season, seasonId),
                        eq(playoffMatchesMeta.division, divisionId),
                        inArray(playoffMatchesMeta.week, uniqueWeeks)
                    )
                )

            await db
                .delete(matchs)
                .where(
                    and(
                        eq(matchs.season, seasonId),
                        eq(matchs.division, divisionId),
                        eq(matchs.playoff, true),
                        inArray(matchs.week, uniqueWeeks)
                    )
                )
            console.log(
                `Deleted ${existingMatches.length} existing playoff match row(s) and ${existingMeta.length} meta row(s)`
            )
        }
    }

    return "continue"
}

function getSourceFiles(dir: string, fileFilter: string[]): string[] {
    const allowedPattern = /^play[a-z]+_(?:4|6)t(?:_[a-z0-9]+)?\.html$/i

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
    const { sourceDir, dryRun, replaceExisting, fileFilter, weekOffset } =
        parseArgs()

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
    console.log(`Playoff week offset: ${weekOffset}`)

    const shouldContinue = await askYesNo("Proceed with parsing/import?", "y")
    if (!shouldContinue) {
        console.log("Aborted.")
        return
    }

    let importedFiles = 0
    let importedRows = 0
    let defaultSeasonId: number | undefined

    for (const filePath of sourceFiles) {
        const fileName = path.basename(filePath)
        console.log(`\n=== ${fileName} ===`)

        let parsed: ParsedFile
        try {
            parsed = parseFile(filePath, sourceDir)
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
            console.log("No playoff matches found. Skipping.")
            continue
        }

        const seasonResolution = await resolveSeasonIdWithDefault(
            parsed,
            defaultSeasonId
        )
        const seasonId = seasonResolution.seasonId

        if (seasonResolution.manuallySelected) {
            defaultSeasonId = seasonId
            const selectedSeason = await db
                .select({
                    id: seasons.id,
                    season: seasons.season,
                    year: seasons.year
                })
                .from(seasons)
                .where(eq(seasons.id, seasonId))
                .limit(1)
            const seasonLabel = selectedSeason[0]
                ? `${selectedSeason[0].season} ${selectedSeason[0].year}`
                : `${seasonId}`
            console.log(
                `Set default season for remaining files to: id=${seasonId} (${seasonLabel})`
            )
        }

        const divisionId = await resolveDivisionId(parsed)
        const teamMap = await resolveTeamMap(parsed, seasonId, divisionId)
        const resolvedMatches = await resolveBracketMatches(parsed)

        if (resolvedMatches.length === 0) {
            console.log("No resolved playoff matches to import. Skipping.")
            continue
        }

        const targetWeeks = resolvedMatches.map((m) => m.week + weekOffset)

        const skipOrContinue = await maybeReplaceExistingMatches(
            seasonId,
            divisionId,
            targetWeeks,
            replaceExisting,
            dryRun
        )

        if (skipOrContinue === "skip") {
            console.log("Skipped by user.")
            continue
        }

        const rows = resolvedMatches.map((m) => {
            const homeTeamId =
                m.homeTeamNum !== null
                    ? (teamMap.get(m.homeTeamNum) ?? null)
                    : null
            const awayTeamId =
                m.awayTeamNum !== null
                    ? (teamMap.get(m.awayTeamNum) ?? null)
                    : null
            const winnerTeamId =
                m.winnerTeamNum !== null
                    ? (teamMap.get(m.winnerTeamNum) ?? null)
                    : null

            if (
                (m.homeTeamNum !== null && homeTeamId === null) ||
                (m.awayTeamNum !== null && awayTeamId === null) ||
                (m.winnerTeamNum !== null && winnerTeamId === null)
            ) {
                throw new Error(
                    `Missing team mapping in ${fileName} for playoff match #${m.matchNum}`
                )
            }

            return {
                season: seasonId,
                division: divisionId,
                week: m.week + weekOffset,
                date: m.date,
                time: m.time,
                court: m.court,
                home_team: homeTeamId,
                away_team: awayTeamId,
                home_score: m.homeWins,
                away_score: m.awayWins,
                home_set1_score: m.sets[0]?.home ?? null,
                away_set1_score: m.sets[0]?.away ?? null,
                home_set2_score: m.sets[1]?.home ?? null,
                away_set2_score: m.sets[1]?.away ?? null,
                home_set3_score: m.sets[2]?.home ?? null,
                away_set3_score: m.sets[2]?.away ?? null,
                winner: winnerTeamId,
                playoff: true
            }
        })

        // Build forward reference maps: for each match, find where
        // its winner and loser advance to.
        const nextMatchNumMap = new Map<number, number>()
        const nextLoserMatchNumMap = new Map<number, number>()
        for (const target of resolvedMatches) {
            const winnerPattern = /^W(?:inner)?(\d+)$/i
            const loserPattern = /^L(?:oser)?(\d+)$/i

            for (const ref of [target.homeRef, target.awayRef]) {
                const wm = ref.match(winnerPattern)
                if (wm) {
                    const sourceMatchNum = Number.parseInt(wm[1], 10)
                    nextMatchNumMap.set(sourceMatchNum, target.matchNum)
                }
                const lm = ref.match(loserPattern)
                if (lm) {
                    const sourceMatchNum = Number.parseInt(lm[1], 10)
                    nextLoserMatchNumMap.set(sourceMatchNum, target.matchNum)
                }
            }
        }

        const { winnerByMatch, loserByMatch } =
            buildWinnerLoserMaps(resolvedMatches)

        const metaRowsWithoutMatchId = resolvedMatches.map((m) => {
            // Resolve work_team: workRef can be a team number or a
            // bracket reference like "W3" / "L2" / "Seed2".
            let workTeamId: number | null = null
            if (m.workRef) {
                const workNum = resolveTeamRef(
                    m.workRef,
                    parsed.seeds,
                    winnerByMatch,
                    loserByMatch
                )
                if (workNum !== null) {
                    workTeamId = teamMap.get(workNum) ?? null
                }
            }

            return {
                season: seasonId,
                division: divisionId,
                week: m.week + weekOffset,
                match_num: m.matchNum,
                bracket: inferBracket(m.homeRef, m.awayRef),
                home_source: m.homeRef,
                away_source: m.awayRef,
                next_match_num: nextMatchNumMap.get(m.matchNum) ?? null,
                next_loser_match_num:
                    nextLoserMatchNumMap.get(m.matchNum) ?? null,
                work_team: workTeamId
            }
        })

        console.log(
            `Parsed ${rows.length} playoff rows for season=${seasonId}, division=${divisionId}`
        )

        if (dryRun) {
            importedFiles++
            importedRows += rows.length
            console.log(
                `DRY RUN: no rows inserted (would insert ${rows.length} matchs row(s) and ${metaRowsWithoutMatchId.length} playoff meta row(s))`
            )
            continue
        }

        const insertedMatches = await db
            .insert(matchs)
            .values(rows)
            .returning({ id: matchs.id })

        if (insertedMatches.length !== rows.length) {
            throw new Error(
                `Inserted ${insertedMatches.length} matchs rows, expected ${rows.length}`
            )
        }

        const metaRows = metaRowsWithoutMatchId.map((metaRow, index) => ({
            ...metaRow,
            match_id: insertedMatches[index]?.id || null
        }))

        await db.insert(playoffMatchesMeta).values(metaRows)

        importedFiles++
        importedRows += rows.length
        console.log(
            `Inserted ${rows.length} playoff match row(s) and ${metaRows.length} playoff meta row(s)`
        )
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
