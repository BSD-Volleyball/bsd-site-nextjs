#!/usr/bin/env tsx
// Ingests John's local cache of old season-results pages into the backfill
// cache, so the import pipeline has a single, stable, reproducible source.
//
// Why this exists: the old bumpsetdrink.com site was overwritten in place each
// season, so identifying which of 69 seasons a page belongs to is normally the
// riskiest step of the whole backfill -- pages were copied forward without
// updating <title>. John's cache sidesteps that entirely: the season is in the
// DIRECTORY NAME ("2013 Spring", "2016 Fall_26t_7w"), which makes it a fact
// from the filesystem rather than an inference from page text.
//
// The source directory is only ever read, never modified.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/backfill/ingest-local.ts
//   ... --source "/path/to/Season Results" --dry-run

import "dotenv/config"
import fs from "node:fs"
import path from "node:path"
import { db } from "../../src/database/db"
import { parseFilename } from "../../src/lib/wayback/identify"
import { seasons } from "../../src/database/schema"

const DEFAULT_SOURCE = "/home/kasm-user/season-results-john/Season Results"
const DEST = path.join(process.cwd(), "scripts", "data", "local")

// seasons.code uses a one-letter season prefix plus a two-digit year: S96,
// F12, U23. "U" for summer is the league's own convention, not a typo.
const SEASON_LETTER: Record<string, string> = {
    spring: "S",
    summer: "U",
    fall: "F",
    winter: "W"
}

interface IngestedFile {
    seasonCode: string
    year: number
    seasonName: string
    divisionCode: string
    kind: string
    sourcePath: string
    destPath: string
}

function parseArgs() {
    const args = process.argv.slice(2)
    let source = DEFAULT_SOURCE
    let dryRun = false
    let checkDb = true

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (arg === "--dry-run") {
            dryRun = true
        } else if (arg === "--no-db") {
            checkDb = false
        } else if (arg === "--source") {
            source = args[++i] ?? source
        } else if (arg === "--help") {
            console.log(
                [
                    "Usage: npx tsx scripts/backfill/ingest-local.ts [options]",
                    "",
                    "  --source <path>  Source directory (default: John's cache)",
                    "  --dry-run        Report what would be copied, copy nothing",
                    "  --no-db          Skip validating season codes against the DB"
                ].join("\n")
            )
            process.exit(0)
        } else {
            console.error(`Unknown argument: ${arg}`)
            process.exit(1)
        }
    }

    return { source, dryRun, checkDb }
}

/** "2016 Fall_26t_7w" -> { code: "F16", year: 2016, seasonName: "fall" } */
export function parseSeasonDirectory(
    name: string
): { code: string; year: number; seasonName: string } | null {
    const match = name.match(/^(\d{4})\s+(spring|summer|fall|winter)/i)
    if (!match) {
        return null
    }

    const year = Number.parseInt(match[1], 10)
    const seasonName = match[2].toLowerCase()
    const letter = SEASON_LETTER[seasonName]
    if (!letter) {
        return null
    }

    return {
        code: `${letter}${String(year).slice(-2)}`,
        year,
        seasonName
    }
}

function collect(source: string) {
    const files: IngestedFile[] = []
    const skippedDirs: string[] = []
    const cancelled: string[] = []

    for (const entry of fs.readdirSync(source).sort()) {
        const dir = path.join(source, entry)
        if (!fs.statSync(dir).isDirectory()) {
            continue
        }

        const season = parseSeasonDirectory(entry)
        if (!season) {
            skippedDirs.push(entry)
            continue
        }

        // The league names cancelled seasons explicitly, e.g.
        // "2020 Spring_Cancelled_26t". There is nothing to import.
        if (/cancel/i.test(entry)) {
            cancelled.push(entry)
            continue
        }

        for (const file of fs.readdirSync(dir).sort()) {
            const parsed = parseFilename(file)
            if (!parsed) {
                continue
            }
            const sourcePath = path.join(dir, file)
            if (!fs.statSync(sourcePath).isFile()) {
                continue
            }

            files.push({
                seasonCode: season.code,
                year: season.year,
                seasonName: season.seasonName,
                divisionCode: parsed.divisionCode,
                kind: parsed.kind,
                sourcePath,
                destPath: path.join(DEST, season.code, file.toLowerCase())
            })
        }
    }

    return { files, skippedDirs, cancelled }
}

async function main() {
    const { source, dryRun, checkDb } = parseArgs()

    if (!fs.existsSync(source)) {
        console.error(`Source directory not found: ${source}`)
        process.exit(1)
    }

    console.log(`Source: ${source}`)
    const { files, skippedDirs, cancelled } = collect(source)

    if (files.length === 0) {
        console.error(
            "No result pages found -- is --source pointing at the right place?"
        )
        process.exit(1)
    }

    const bySeason = new Map<string, IngestedFile[]>()
    for (const file of files) {
        const list = bySeason.get(file.seasonCode) ?? []
        list.push(file)
        bySeason.set(file.seasonCode, list)
    }

    // Cross-check every derived code against the seasons table. A code that
    // does not exist means either a mis-parsed directory name or a season row
    // that was never created -- both need a human, and both are far cheaper to
    // catch here than after importing matches under the wrong season.
    let unknownCodes: string[] = []
    if (checkDb) {
        const rows = await db
            .select({
                code: seasons.code,
                year: seasons.year,
                season: seasons.season
            })
            .from(seasons)
        const known = new Map(rows.map((r) => [r.code, r]))
        unknownCodes = [...bySeason.keys()].filter((c) => !known.has(c)).sort()

        for (const [code, group] of bySeason) {
            const row = known.get(code)
            if (!row) {
                continue
            }
            const first = group[0]
            if (row.year !== first.year || row.season !== first.seasonName) {
                console.warn(
                    `  MISMATCH ${code}: directory says ${first.seasonName} ${first.year}, ` +
                        `DB says ${row.season} ${row.year}`
                )
            }
        }
    }

    console.log(
        `\nFound ${files.length} result pages across ${bySeason.size} seasons ` +
            `(${[...bySeason.keys()].sort().join(", ")})`
    )
    if (cancelled.length > 0) {
        console.log(`Skipped cancelled seasons: ${cancelled.join(", ")}`)
    }
    if (skippedDirs.length > 0) {
        console.log(`Skipped non-season directories: ${skippedDirs.join(", ")}`)
    }
    if (unknownCodes.length > 0) {
        console.log(`\nWARNING: no seasons row for: ${unknownCodes.join(", ")}`)
    }

    const counts = { standings: 0, playoff: 0, roster: 0 } as Record<
        string,
        number
    >
    for (const file of files) {
        counts[file.kind] = (counts[file.kind] ?? 0) + 1
    }
    console.log(
        `By kind: standings=${counts.standings} playoff=${counts.playoff} roster=${counts.roster}`
    )

    if (dryRun) {
        console.log("\nDry run: nothing copied")
        return
    }

    let copied = 0
    for (const file of files) {
        fs.mkdirSync(path.dirname(file.destPath), { recursive: true })
        fs.copyFileSync(file.sourcePath, file.destPath)
        copied++
    }

    const manifestPath = path.join(DEST, "manifest.json")
    fs.writeFileSync(
        manifestPath,
        `${JSON.stringify(
            files.map((f) => ({
                ...f,
                destPath: path.relative(process.cwd(), f.destPath),
                sourcePath: undefined
            })),
            null,
            1
        )}\n`
    )

    console.log(
        `\nCopied ${copied} files -> ${path.relative(process.cwd(), DEST)}`
    )
    console.log(`Manifest: ${path.relative(process.cwd(), manifestPath)}`)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
