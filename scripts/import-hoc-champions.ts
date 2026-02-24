#!/usr/bin/env tsx

import "dotenv/config"
import * as fs from "node:fs"
import * as path from "node:path"
import * as readline from "node:readline"
import { randomUUID } from "node:crypto"
import { and, asc, eq } from "drizzle-orm"
import { db } from "../src/database/db"
import {
    champions,
    divisions,
    seasons,
    teams,
    users
} from "../src/database/schema"

const DEFAULT_SOURCE_DIR = "/home/kasm-user/src/bsd-site/public/hoc"
const PIC_BASE_URL = "https://pics.bumpsetdrink.com/hoc/"

interface ParsedCell {
    rawText: string
    href: string | null
}

interface ParsedChampionRow {
    seasonLabel: string
    divisionLabel: string
    captainCellText: string
    href: string
}

interface SeasonRow {
    id: number
    season: string
    year: number
}

interface DivisionRow {
    id: number
    name: string
    level: number
}

interface UserRow {
    id: string
    first_name: string
    last_name: string
    preffered_name: string | null
    email: string
}

interface TeamRow {
    id: number
    season: number
    division: number
    captain: string
    name: string
    number: number | null
}

interface DetailMedia {
    picture: string | null
    picture2: string | null
    caption: string | null
}

interface RunOptions {
    sourceDir: string
    indexFile: string
    dryRun: boolean
}

interface UserMatchContext {
    seasonLabel: string
    divisionLabel: string
    captainCellText: string
}

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

function parseArgs(): RunOptions {
    const args = process.argv.slice(2)
    let sourceDir = DEFAULT_SOURCE_DIR
    let indexFile = "index.html"
    let dryRun = false

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]

        if (arg === "--source-dir") {
            sourceDir = args[i + 1] || ""
            i++
            continue
        }

        if (arg === "--index") {
            indexFile = args[i + 1] || ""
            i++
            continue
        }

        if (arg === "--dry-run") {
            dryRun = true
            continue
        }

        if (arg === "--help" || arg === "-h") {
            console.log(`Usage:
  npx tsx scripts/import-hoc-champions.ts [options]

Options:
  --source-dir <path>     Directory containing HOC html pages
  --index <filename>      HOC index file name inside source dir (default: index.html)
  --dry-run               Parse/map everything, but do not write DB changes
  --help                  Show this help
`)
            process.exit(0)
        }

        throw new Error(`Unknown arg: ${arg}`)
    }

    return {
        sourceDir,
        indexFile,
        dryRun
    }
}

function decodeHtmlEntities(value: string): string {
    return value
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
}

function stripTags(value: string): string {
    return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim()
}

function normalize(value: string): string {
    return value
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
}

function normalizeDivisionName(value: string): string {
    return value
        .toLowerCase()
        .replace(/division/gi, "")
        .replace(/[^a-z0-9]/g, "")
}

function parseSeasonLabel(seasonLabel: string): {
    season: string
    year: number
} | null {
    const match = seasonLabel.match(/^(Spring|Summer|Fall)\s+(\d{4})$/i)
    if (!match) {
        return null
    }

    return {
        season: match[1].toLowerCase(),
        year: Number.parseInt(match[2], 10)
    }
}

function parseCells(rowHtml: string): ParsedCell[] {
    const cells: ParsedCell[] = []
    const tdMatches = rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)

    for (const match of tdMatches) {
        const inner = match[1]
        const link = inner.match(
            /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i
        )

        if (link) {
            cells.push({
                rawText: stripTags(link[2]),
                href: decodeHtmlEntities(link[1].trim())
            })
        } else {
            cells.push({
                rawText: stripTags(inner),
                href: null
            })
        }
    }

    return cells
}

function parseHeaders(tableHtml: string): string[] {
    const firstRow = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)
    if (!firstRow) {
        return []
    }

    const headers: string[] = []
    const thMatches = firstRow[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)
    for (const match of thMatches) {
        headers.push(stripTags(match[1]))
    }

    return headers
}

function parseHocIndex(indexHtml: string): ParsedChampionRow[] {
    const rows: ParsedChampionRow[] = []
    const tableMatches = indexHtml.matchAll(
        /<table[^>]*class=["']hoc["'][^>]*>([\s\S]*?)<\/table>/gi
    )

    for (const tableMatch of tableMatches) {
        const tableHtml = tableMatch[1]
        const headers = parseHeaders(tableHtml)
        if (headers.length < 2) {
            continue
        }

        const divisionHeaders = headers.slice(1)
        const rowMatches = tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)

        let rowIndex = 0
        for (const rowMatch of rowMatches) {
            rowIndex++
            if (rowIndex === 1) {
                continue
            }

            const cells = parseCells(rowMatch[1])
            if (cells.length < 2) {
                continue
            }

            const seasonLabel = cells[0].rawText
            if (!seasonLabel) {
                continue
            }

            for (
                let i = 1;
                i < cells.length && i <= divisionHeaders.length;
                i++
            ) {
                const cell = cells[i]
                if (!cell.href) {
                    continue
                }

                rows.push({
                    seasonLabel,
                    divisionLabel: divisionHeaders[i - 1],
                    captainCellText: cell.rawText,
                    href: cell.href
                })
            }
        }
    }

    return rows
}

function buildPictureUrl(src: string): string {
    const cleaned = src.replace(/^\.?\//, "")
    return `${PIC_BASE_URL}${encodeURI(cleaned)}`
}

function extractCaptionAfterFirstImage(
    html: string,
    firstImgEndIndex: number
): string | null {
    const remaining = html.slice(firstImgEndIndex)

    const nextImgIdx = remaining.search(/<img\b/i)
    const cutoff = nextImgIdx >= 0 ? remaining.slice(0, nextImgIdx) : remaining
    const cleaned = stripTags(cutoff)

    if (!cleaned) {
        return null
    }

    return cleaned
}

function parseDetailMedia(sourceDir: string, href: string): DetailMedia {
    const isImageLink = /\.(jpe?g|png|gif|webp)$/i.test(href)

    if (isImageLink) {
        return {
            picture: buildPictureUrl(href),
            picture2: null,
            caption: null
        }
    }

    const detailPath = path.resolve(sourceDir, href)
    if (!fs.existsSync(detailPath)) {
        console.log(`WARN: missing detail file: ${detailPath}`)
        return {
            picture: null,
            picture2: null,
            caption: null
        }
    }

    const html = fs.readFileSync(detailPath, "utf-8")
    const imageMatches = [
        ...html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi)
    ]
        .map((m) => ({
            src: decodeHtmlEntities(m[1].trim()),
            endIndex: (m.index || 0) + m[0].length
        }))
        .filter((m) => /\.(jpe?g|png|gif|webp)$/i.test(m.src))
        .filter((m) => !/sand2\.gif$/i.test(m.src))

    const picture = imageMatches[0]
        ? buildPictureUrl(imageMatches[0].src)
        : null
    const picture2 = imageMatches[1]
        ? buildPictureUrl(imageMatches[1].src)
        : null
    const caption = imageMatches[0]
        ? extractCaptionAfterFirstImage(html, imageMatches[0].endIndex)
        : null

    return {
        picture,
        picture2,
        caption
    }
}

function splitPotentialCaptainNames(raw: string): string[] {
    const cleaned = decodeHtmlEntities(raw)
        .replace(/\s*\(capt(?:ain)?\)\s*/gi, "")
        .trim()

    if (cleaned.includes("&")) {
        return cleaned
            .split("&")
            .map((s) => s.trim())
            .filter(Boolean)
    }

    return [cleaned]
}

function parseName(fullName: string): { firstName: string; lastName: string } {
    const parts = fullName.trim().split(/\s+/).filter(Boolean)

    if (parts.length === 0) {
        return {
            firstName: "Unknown",
            lastName: "Captain"
        }
    }

    if (parts.length === 1) {
        return {
            firstName: parts[0],
            lastName: "Captain"
        }
    }

    return {
        firstName: parts.slice(0, -1).join(" "),
        lastName: parts[parts.length - 1]
    }
}

function buildLegacyEmail(name: string): string {
    const slug = normalize(name).replace(/\s+/g, ".") || `captain.${Date.now()}`
    return `legacy-hoc-${slug}@bumpsetdrink.com`
}

async function resolveSeasonId(
    seasonLabel: string,
    seasonRows: SeasonRow[]
): Promise<number> {
    const parsed = parseSeasonLabel(seasonLabel)

    if (parsed) {
        const matches = seasonRows.filter(
            (s) =>
                s.year === parsed.year &&
                s.season.toLowerCase() === parsed.season.toLowerCase()
        )

        if (matches.length === 1) {
            return matches[0].id
        }

        if (matches.length > 1) {
            const chosen = await askChoice(
                `Multiple DB seasons match "${seasonLabel}". Choose target season:`,
                matches,
                (s) => `id=${s.id} ${s.season} ${s.year}`
            )
            return chosen.id
        }
    }

    const chosen = await askChoice(
        `Could not match season "${seasonLabel}" automatically. Choose target season:`,
        seasonRows,
        (s) => `id=${s.id} ${s.season} ${s.year}`
    )
    return chosen.id
}

async function resolveDivisionId(
    divisionLabel: string,
    divisionRows: DivisionRow[]
): Promise<number> {
    const normalized = normalizeDivisionName(divisionLabel)
    const matches = divisionRows.filter(
        (d) => normalizeDivisionName(d.name) === normalized
    )

    if (matches.length === 1) {
        return matches[0].id
    }

    if (matches.length > 1) {
        const chosen = await askChoice(
            `Multiple DB divisions match "${divisionLabel}". Choose target division:`,
            matches,
            (d) => `id=${d.id} ${d.name} (level ${d.level})`
        )
        return chosen.id
    }

    const chosen = await askChoice(
        `Could not match division "${divisionLabel}" automatically. Choose target division:`,
        divisionRows,
        (d) => `id=${d.id} ${d.name} (level ${d.level})`
    )
    return chosen.id
}

function findUserCandidatesByName(
    name: string,
    allUsers: UserRow[]
): UserRow[] {
    const normalizedTarget = normalize(name)
    if (!normalizedTarget) {
        return []
    }

    const exactFull = allUsers.filter((u) => {
        const legalFull = normalize(`${u.first_name} ${u.last_name}`)
        const preferredFull = u.preffered_name
            ? normalize(`${u.preffered_name} ${u.last_name}`)
            : ""
        return (
            legalFull === normalizedTarget || preferredFull === normalizedTarget
        )
    })

    if (exactFull.length > 0) {
        return exactFull
    }

    const parsed = parseName(name)
    const byParts = allUsers.filter(
        (u) =>
            (normalize(u.first_name) === normalize(parsed.firstName) ||
                normalize(u.preffered_name || "") ===
                    normalize(parsed.firstName)) &&
            normalize(u.last_name) === normalize(parsed.lastName)
    )

    return byParts
}

async function askForUserId(
    prompt: string,
    allUsers: UserRow[],
    suggestions: UserRow[] = []
): Promise<UserRow> {
    if (suggestions.length > 0) {
        console.log(`\n${prompt}`)
        for (const user of suggestions) {
            console.log(
                `  id=${user.id}  ${user.first_name} ${user.last_name} <${user.email}>`
            )
        }
    } else {
        console.log(`\n${prompt}`)
    }

    while (true) {
        const typedId = await ask("Enter user id: ")
        const found = allUsers.find((u) => u.id === typedId)
        if (found) {
            return found
        }

        console.log(`No user found with id "${typedId}". Try again.`)
    }
}

async function ensureUserForName(
    rawName: string,
    allUsers: UserRow[],
    context: UserMatchContext,
    dryRun: boolean
): Promise<UserRow> {
    const candidates = findUserCandidatesByName(rawName, allUsers)

    if (candidates.length === 1) {
        return candidates[0]
    }

    if (candidates.length > 1) {
        return await askForUserId(
            `Multiple users match "${rawName}". Type the correct user id.`,
            allUsers,
            candidates
        )
    }

    const parsed = parseName(rawName)
    const normalizedFull = normalize(`${parsed.firstName} ${parsed.lastName}`)
    const byLastName = allUsers.filter(
        (u) => normalize(u.last_name) === normalize(parsed.lastName)
    )
    const fuzzyMatches = allUsers.filter((u) => {
        const full = normalize(`${u.first_name} ${u.last_name}`)
        return full.includes(normalizedFull) || normalizedFull.includes(full)
    })
    const suggestionUsers = [...byLastName, ...fuzzyMatches].filter(
        (u, idx, arr) => arr.findIndex((x) => x.id === u.id) === idx
    )

    if (suggestionUsers.length > 0) {
        const mapToExisting = await askYesNo(
            `No exact user match for "${rawName}" in ${context.seasonLabel} (${context.divisionLabel}). Map to an existing user id?`,
            "y"
        )
        if (mapToExisting) {
            return await askForUserId(
                `Possible existing user matches for "${rawName}" (season=${context.seasonLabel}, division=${context.divisionLabel}, source_cell="${context.captainCellText}"):`,
                allUsers,
                suggestionUsers
            )
        }
    }

    console.log(
        `\nNo user match found for "${rawName}"\n  Season: ${context.seasonLabel}\n  Division: ${context.divisionLabel}\n  Source Cell: ${context.captainCellText}`
    )

    const shouldCreate = await askYesNo(
        `Create a new user for "${rawName}" with this context?`,
        "n"
    )

    if (!shouldCreate) {
        return await askForUserId(
            `Type the user id to map "${rawName}" to (season=${context.seasonLabel}, division=${context.divisionLabel}):`,
            allUsers
        )
    }

    const email = buildLegacyEmail(rawName)
    const newUser: UserRow = {
        id: randomUUID(),
        first_name: parsed.firstName,
        last_name: parsed.lastName,
        preffered_name: null,
        email
    }

    console.log(
        `INFO: creating missing user for "${rawName}" as ${newUser.first_name} ${newUser.last_name} (${newUser.email})`
    )

    if (!dryRun) {
        await db.insert(users).values({
            id: newUser.id,
            first_name: newUser.first_name,
            last_name: newUser.last_name,
            email: newUser.email
        })
    }

    allUsers.push(newUser)
    return newUser
}

async function resolveCaptainUser(
    captainCellText: string,
    context: UserMatchContext,
    allUsers: UserRow[],
    dryRun: boolean
): Promise<UserRow> {
    const names = splitPotentialCaptainNames(captainCellText)
    const resolved: UserRow[] = []

    for (const name of names) {
        resolved.push(await ensureUserForName(name, allUsers, context, dryRun))
    }

    const uniqueResolved = resolved.filter(
        (u, idx, arr) => arr.findIndex((x) => x.id === u.id) === idx
    )

    if (uniqueResolved.length === 1) {
        return uniqueResolved[0]
    }

    return await askForUserId(
        `Multiple captain names found in cell "${captainCellText}". Type the captain user id.`,
        allUsers,
        uniqueResolved
    )
}

async function resolveTeamForChampion(
    seasonId: number,
    divisionId: number,
    captainUser: UserRow,
    captainCellText: string,
    teamRows: TeamRow[],
    dryRun: boolean
): Promise<TeamRow> {
    const scopedTeams = teamRows.filter(
        (t) => t.season === seasonId && t.division === divisionId
    )

    const byCaptain = scopedTeams.filter((t) => t.captain === captainUser.id)
    if (byCaptain.length === 1) {
        return byCaptain[0]
    }

    if (byCaptain.length > 1) {
        return await askChoice(
            `Multiple teams for captain ${captainUser.first_name} ${captainUser.last_name} in season=${seasonId}, division=${divisionId}. Choose team:`,
            byCaptain,
            (t) => `teamId=${t.id} name=${t.name} number=${t.number ?? "null"}`
        )
    }

    const normalizedCell = normalize(captainCellText)
    const byName = scopedTeams.filter(
        (t) => normalize(t.name) === normalizedCell
    )

    if (byName.length === 1) {
        return byName[0]
    }

    if (scopedTeams.length > 0) {
        type TeamDecision =
            | { kind: "existing"; team: TeamRow }
            | { kind: "create" }

        const options: TeamDecision[] = [
            ...scopedTeams.map(
                (team) => ({ kind: "existing", team }) as TeamDecision
            ),
            { kind: "create" }
        ]

        const chosen = await askChoice(
            `No direct team match for captain ${captainUser.first_name} ${captainUser.last_name} in season=${seasonId}, division=${divisionId}. Choose existing team or create new:`,
            options,
            (o) =>
                o.kind === "existing"
                    ? `Use existing teamId=${o.team.id} name=${o.team.name} captain=${o.team.captain}`
                    : `Create new team "Team ${captainUser.last_name}"`
        )

        if (chosen.kind === "existing") {
            return chosen.team
        }

        const confirmCreate = await askYesNo(
            `Create a new team "Team ${captainUser.last_name}" for season=${seasonId}, division=${divisionId}?`,
            "n"
        )
        if (!confirmCreate) {
            return await askChoice(
                `Select an existing team mapping for ${captainUser.first_name} ${captainUser.last_name}:`,
                scopedTeams,
                (t) =>
                    `teamId=${t.id} name=${t.name} season=${t.season} division=${t.division}`
            )
        }
    } else {
        const confirmCreate = await askYesNo(
            `No teams found for season=${seasonId}, division=${divisionId}. Create "Team ${captainUser.last_name}"?`,
            "n"
        )

        if (!confirmCreate) {
            const fallbackOptions =
                teamRows.filter(
                    (t) => t.season === seasonId || t.division === divisionId
                ).length > 0
                    ? teamRows.filter(
                          (t) =>
                              t.season === seasonId || t.division === divisionId
                      )
                    : teamRows

            return await askChoice(
                `Select an existing team mapping for ${captainUser.first_name} ${captainUser.last_name}:`,
                fallbackOptions,
                (t) =>
                    `teamId=${t.id} name=${t.name} season=${t.season} division=${t.division}`
            )
        }
    }

    const newTeamName = `Team ${captainUser.last_name}`
    console.log(
        `INFO: creating missing team for season=${seasonId} division=${divisionId}: ${newTeamName}`
    )

    let createdTeamId = -1
    if (!dryRun) {
        const inserted = await db
            .insert(teams)
            .values({
                season: seasonId,
                division: divisionId,
                captain: captainUser.id,
                name: newTeamName
            })
            .returning({ id: teams.id })

        createdTeamId = inserted[0].id
    }

    const newTeam: TeamRow = {
        id: createdTeamId,
        season: seasonId,
        division: divisionId,
        captain: captainUser.id,
        name: newTeamName,
        number: null
    }

    teamRows.push(newTeam)
    return newTeam
}

async function upsertChampion(
    seasonId: number,
    divisionId: number,
    teamId: number,
    media: DetailMedia,
    dryRun: boolean
): Promise<"inserted" | "updated"> {
    const existing = await db
        .select({ id: champions.id })
        .from(champions)
        .where(
            and(
                eq(champions.season, seasonId),
                eq(champions.division, divisionId)
            )
        )

    if (existing.length > 0) {
        if (!dryRun) {
            await db
                .update(champions)
                .set({
                    team: teamId,
                    picture: media.picture,
                    picture2: media.picture2,
                    caption: media.caption
                })
                .where(eq(champions.id, existing[0].id))
        }

        if (existing.length > 1) {
            console.log(
                `WARN: multiple champion rows exist for season=${seasonId}, division=${divisionId}. Updated only id=${existing[0].id}.`
            )
        }

        return "updated"
    }

    if (!dryRun) {
        await db.insert(champions).values({
            season: seasonId,
            division: divisionId,
            team: teamId,
            picture: media.picture,
            picture2: media.picture2,
            caption: media.caption
        })
    }

    return "inserted"
}

function championKey(seasonId: number, divisionId: number): string {
    return `${seasonId}:${divisionId}`
}

async function main() {
    const options = parseArgs()
    const indexPath = path.resolve(options.sourceDir, options.indexFile)

    if (!fs.existsSync(indexPath)) {
        throw new Error(`Index file does not exist: ${indexPath}`)
    }

    const indexHtml = fs.readFileSync(indexPath, "utf-8")
    const parsedRows = parseHocIndex(indexHtml)

    if (parsedRows.length === 0) {
        throw new Error("No champion rows parsed from HOC index")
    }

    console.log(`Parsed ${parsedRows.length} champion cells from ${indexPath}`)

    const seasonRows: SeasonRow[] = await db
        .select({ id: seasons.id, season: seasons.season, year: seasons.year })
        .from(seasons)
        .orderBy(asc(seasons.year), asc(seasons.season))

    const divisionRows: DivisionRow[] = await db
        .select({
            id: divisions.id,
            name: divisions.name,
            level: divisions.level
        })
        .from(divisions)
        .orderBy(asc(divisions.level))

    const allUsers: UserRow[] = await db
        .select({
            id: users.id,
            first_name: users.first_name,
            last_name: users.last_name,
            preffered_name: users.preffered_name,
            email: users.email
        })
        .from(users)

    const teamRows: TeamRow[] = await db
        .select({
            id: teams.id,
            season: teams.season,
            division: teams.division,
            captain: teams.captain,
            name: teams.name,
            number: teams.number
        })
        .from(teams)

    const existingChampionRows = await db
        .select({
            season: champions.season,
            division: champions.division
        })
        .from(champions)

    const existingChampionKeys = new Set(
        existingChampionRows.map((row) => championKey(row.season, row.division))
    )

    const seasonIdCache = new Map<string, number>()
    const divisionIdCache = new Map<string, number>()

    let inserted = 0
    let updated = 0
    let skipped = 0

    for (const row of parsedRows) {
        let seasonId = seasonIdCache.get(row.seasonLabel)
        if (!seasonId) {
            seasonId = await resolveSeasonId(row.seasonLabel, seasonRows)
            seasonIdCache.set(row.seasonLabel, seasonId)
        }

        let divisionId = divisionIdCache.get(row.divisionLabel)
        if (!divisionId) {
            divisionId = await resolveDivisionId(
                row.divisionLabel,
                divisionRows
            )
            divisionIdCache.set(row.divisionLabel, divisionId)
        }

        const key = championKey(seasonId, divisionId)
        if (existingChampionKeys.has(key)) {
            skipped++
            console.log(
                `SKIP: ${row.seasonLabel} | ${row.divisionLabel} already exists in champions`
            )
            continue
        }

        const captainUser = await resolveCaptainUser(
            row.captainCellText,
            {
                seasonLabel: row.seasonLabel,
                divisionLabel: row.divisionLabel,
                captainCellText: row.captainCellText
            },
            allUsers,
            options.dryRun
        )

        const championTeam = await resolveTeamForChampion(
            seasonId,
            divisionId,
            captainUser,
            row.captainCellText,
            teamRows,
            options.dryRun
        )

        const media = parseDetailMedia(options.sourceDir, row.href)
        const result = await upsertChampion(
            seasonId,
            divisionId,
            championTeam.id,
            media,
            options.dryRun
        )

        if (result === "inserted") {
            inserted++
            existingChampionKeys.add(key)
        } else {
            updated++
        }

        console.log(
            `${result.toUpperCase()}: ${row.seasonLabel} | ${row.divisionLabel} | team=${championTeam.id} | captain=${captainUser.first_name} ${captainUser.last_name}`
        )
    }

    console.log("\nImport complete")
    console.log(`  inserted: ${inserted}`)
    console.log(`  updated:  ${updated}`)
    console.log(`  skipped:  ${skipped}`)
    console.log(`  dryRun:   ${options.dryRun ? "yes" : "no"}`)
}

main()
    .catch((error) => {
        console.error("Import failed:", error)
        process.exitCode = 1
    })
    .finally(() => {
        closeReadline()
    })
