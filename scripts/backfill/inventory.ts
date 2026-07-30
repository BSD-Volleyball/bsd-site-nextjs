#!/usr/bin/env tsx
// Builds the definitive inventory of recoverable season data across BOTH
// sources, and prints the coverage grid that tells us what is actually there
// before any parser work is committed to.
//
//   local   -- John's cache (2004-2024). Season comes from the directory name,
//              so it is a fact, not an inference. Always preferred.
//   wayback -- archived snapshots (2000-2024). Only source for 2000-2003. Each
//              snapshot of a URL is a different season, and the season has to
//              be recovered from the page itself.
//
// No database access, so this runs without DATABASE_URL.
//
//   npx tsx scripts/backfill/inventory.ts
//   npx tsx scripts/backfill/inventory.ts --json

import fs from "node:fs"
import path from "node:path"
import {
    detectEra,
    identifyPage,
    parseFilename
} from "../../src/lib/wayback/identify"
import type { PageEra, PageKind } from "../../src/lib/wayback/types"

const LOCAL_DIR = path.join(process.cwd(), "scripts", "data", "local")
const WAYBACK_DIR = path.join(
    process.cwd(),
    "scripts",
    "data",
    "wayback",
    "raw"
)
const OUT = path.join(process.cwd(), "scripts", "data", "inventory.json")

const SEASON_LETTER: Record<string, string> = {
    spring: "S",
    summer: "U",
    fall: "F",
    winter: "W"
}

// How far a playoff snapshot may reach for a sibling page to borrow a season
// from. Seasons run ~4 months, so anything past ~150 days is a different one.
const SIBLING_WINDOW_DAYS = 150

interface Candidate {
    source: "local" | "wayback"
    seasonCode: string
    divisionCode: string
    kind: PageKind
    era: PageEra
    filePath: string
    snapshotTs: string | null
    // How many score pairs the page contains. A playoff page captured before
    // the games were played has none, and must never beat a played-out one.
    scoreCount: number
    seasonSource: string
    titleConflict: boolean
}

function seasonCodeOf(seasonName: string, year: number): string {
    return `${SEASON_LETTER[seasonName] ?? "?"}${String(year).slice(-2)}`
}

function scoreCount(html: string): number {
    return (html.match(/\b\d{1,2}\s*-\s*\d{1,2}\b/g) ?? []).length
}

function tsToDays(ts: string): number {
    const year = Number.parseInt(ts.slice(0, 4), 10)
    const month = Number.parseInt(ts.slice(4, 6), 10)
    const day = Number.parseInt(ts.slice(6, 8), 10)
    return Date.UTC(year, month - 1, day) / 86_400_000
}

function readLocal(): Candidate[] {
    if (!fs.existsSync(LOCAL_DIR)) {
        return []
    }

    const candidates: Candidate[] = []
    for (const seasonCode of fs.readdirSync(LOCAL_DIR).sort()) {
        const dir = path.join(LOCAL_DIR, seasonCode)
        if (!fs.statSync(dir).isDirectory()) {
            continue
        }
        for (const file of fs.readdirSync(dir).sort()) {
            const parsed = parseFilename(file)
            if (!parsed) {
                continue
            }
            const filePath = path.join(dir, file)
            const html = fs.readFileSync(filePath, "utf-8")
            candidates.push({
                source: "local",
                seasonCode,
                divisionCode: parsed.divisionCode,
                kind: parsed.kind,
                era: detectEra(html),
                filePath,
                snapshotTs: null,
                scoreCount: scoreCount(html),
                seasonSource: "directory",
                titleConflict: false
            })
        }
    }
    return candidates
}

function readWayback(): { candidates: Candidate[]; unresolved: number } {
    if (!fs.existsSync(WAYBACK_DIR)) {
        return { candidates: [], unresolved: 0 }
    }

    interface Pending {
        ts: string
        file: string
        filePath: string
        kind: PageKind
        divisionCode: string
        html: string
        seasonCode: string | null
        seasonSource: string
        titleConflict: boolean
    }

    const pending: Pending[] = []

    for (const ts of fs.readdirSync(WAYBACK_DIR).sort()) {
        const dir = path.join(WAYBACK_DIR, ts)
        if (!fs.statSync(dir).isDirectory()) {
            continue
        }
        for (const file of fs.readdirSync(dir)) {
            const parsed = parseFilename(file)
            if (!parsed) {
                continue
            }
            const filePath = path.join(dir, file)
            const html = fs.readFileSync(filePath, "utf-8")
            const identity = identifyPage(html, file)

            pending.push({
                ts,
                file,
                filePath,
                kind: parsed.kind,
                divisionCode: parsed.divisionCode,
                html,
                seasonCode: identity
                    ? seasonCodeOf(identity.seasonName, identity.seasonYear)
                    : null,
                seasonSource: identity?.source ?? "unresolved",
                titleConflict: identity?.titleConflict ?? false
            })
        }
    }

    // Playoff pages are usually headed just "A Division Playoff Bracket" with
    // no season at all. Borrow the season from the nearest-in-time snapshot
    // that did identify itself -- the site published all divisions together,
    // so a standings or roster capture from the same weeks is the same season.
    const anchors = pending.filter((p) => p.seasonCode !== null)
    for (const page of pending) {
        if (page.seasonCode !== null) {
            continue
        }
        let best: Pending | null = null
        let bestDistance = Number.POSITIVE_INFINITY
        for (const anchor of anchors) {
            const distance = Math.abs(tsToDays(anchor.ts) - tsToDays(page.ts))
            if (distance < bestDistance) {
                bestDistance = distance
                best = anchor
            }
        }
        if (best && bestDistance <= SIBLING_WINDOW_DAYS) {
            page.seasonCode = best.seasonCode
            page.seasonSource = `sibling(${best.file}@${best.ts},${Math.round(bestDistance)}d)`
        }
    }

    const candidates: Candidate[] = []
    let unresolved = 0
    for (const page of pending) {
        if (!page.seasonCode) {
            unresolved++
            continue
        }
        candidates.push({
            source: "wayback",
            seasonCode: page.seasonCode,
            divisionCode: page.divisionCode,
            kind: page.kind,
            era: detectEra(page.html),
            filePath: page.filePath,
            snapshotTs: page.ts,
            scoreCount: scoreCount(page.html),
            seasonSource: page.seasonSource,
            titleConflict: page.titleConflict
        })
    }

    return { candidates, unresolved }
}

/**
 * Pick one page per (season, division, kind).
 *
 * Local always wins -- its season is known rather than inferred. Between
 * Wayback snapshots, prefer the one with the most scores: the site was updated
 * weekly, so a capture taken mid-season (or before the playoffs ran) is a
 * strictly worse copy of the same page.
 */
function choose(candidates: Candidate[]) {
    const best = new Map<string, Candidate>()
    for (const candidate of candidates) {
        const key = `${candidate.seasonCode}|${candidate.divisionCode}|${candidate.kind}`
        const current = best.get(key)
        if (!current) {
            best.set(key, candidate)
            continue
        }
        if (current.source !== candidate.source) {
            if (candidate.source === "local") {
                best.set(key, candidate)
            }
            continue
        }
        if (candidate.scoreCount > current.scoreCount) {
            best.set(key, candidate)
        } else if (
            candidate.scoreCount === current.scoreCount &&
            (candidate.snapshotTs ?? "") > (current.snapshotTs ?? "")
        ) {
            best.set(key, candidate)
        }
    }
    return best
}

function seasonSortKey(code: string): number {
    const year = Number.parseInt(code.slice(1), 10)
    const century = year > 90 ? 1900 : 2000
    const order: Record<string, number> = { S: 1, U: 2, F: 3, W: 4 }
    return (century + year) * 10 + (order[code[0]] ?? 9)
}

function main() {
    const jsonOnly = process.argv.includes("--json")

    const local = readLocal()
    const { candidates: wayback, unresolved } = readWayback()
    const all = [...local, ...wayback]
    const chosen = choose(all)

    if (!jsonOnly) {
        console.log("=".repeat(78))
        console.log("SOURCES")
        console.log("=".repeat(78))
        console.log(`  local   : ${local.length} pages`)
        console.log(
            `  wayback : ${wayback.length} pages (${unresolved} could not be assigned a season)`
        )
        console.log(
            `  chosen  : ${chosen.size} distinct (season, division, kind) slices`
        )

        const bySource = { local: 0, wayback: 0 }
        for (const candidate of chosen.values()) {
            bySource[candidate.source]++
        }
        console.log(
            `            ${bySource.local} from local, ${bySource.wayback} from wayback`
        )

        const eras = new Map<string, number>()
        for (const candidate of chosen.values()) {
            const key = `${candidate.era}/${candidate.kind}`
            eras.set(key, (eras.get(key) ?? 0) + 1)
        }
        console.log(
            `\n${"=".repeat(78)}\nERA x KIND (chosen slices)\n${"=".repeat(78)}`
        )
        for (const key of [...eras.keys()].sort()) {
            console.log(`  ${key.padEnd(24)} ${eras.get(key)}`)
        }

        const seasons = [
            ...new Set([...chosen.values()].map((c) => c.seasonCode))
        ].sort((a, b) => seasonSortKey(a) - seasonSortKey(b))
        console.log(
            `\n${"=".repeat(78)}\nCOVERAGE (${seasons.length} seasons)\n${"=".repeat(78)}`
        )
        console.log(
            "season  src      standings              playoff                roster"
        )
        console.log("-".repeat(78))
        for (const season of seasons) {
            const rows = [...chosen.values()].filter(
                (c) => c.seasonCode === season
            )
            const of = (kind: PageKind) =>
                rows
                    .filter((r) => r.kind === kind)
                    .map((r) => r.divisionCode)
                    .sort()
                    .join(",") || "-"
            const sources = new Set(rows.map((r) => r.source))
            const src = sources.has("local")
                ? sources.has("wayback")
                    ? "both"
                    : "local"
                : "wayback"
            console.log(
                `${season.padEnd(8)}${src.padEnd(9)}${of("standings").padEnd(23)}` +
                    `${of("playoff").padEnd(23)}${of("roster")}`
            )
        }

        const conflicts = [...chosen.values()].filter((c) => c.titleConflict)
        const siblings = [...chosen.values()].filter((c) =>
            c.seasonSource.startsWith("sibling")
        )
        console.log(`\n${"=".repeat(78)}\nRISK FLAGS\n${"=".repeat(78)}`)
        console.log(
            `  stale <title> detected (heading used instead) : ${conflicts.length}`
        )
        console.log(
            `  season borrowed from a sibling snapshot       : ${siblings.length}`
        )
        console.log(
            `  wayback pages with no season at all           : ${unresolved}`
        )
    }

    const output = [...chosen.entries()]
        .map(([key, candidate]) => ({
            key,
            ...candidate,
            filePath: path.relative(process.cwd(), candidate.filePath)
        }))
        .sort(
            (a, b) =>
                seasonSortKey(a.seasonCode) - seasonSortKey(b.seasonCode) ||
                a.divisionCode.localeCompare(b.divisionCode) ||
                a.kind.localeCompare(b.kind)
        )

    fs.writeFileSync(OUT, `${JSON.stringify(output, null, 1)}\n`)
    if (!jsonOnly) {
        console.log(`\nwrote ${path.relative(process.cwd(), OUT)}`)
    }
}

main()
