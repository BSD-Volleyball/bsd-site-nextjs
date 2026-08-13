// Audits imported playoff data against the archived source pages.
//
// The old bumpsetdrink playoff pages are JS: each match is a block of
// `match.num = N; match.teams = [...]; match.games[i].scores = [...]`.
// A match that was scheduled-but-never-played (the double-elimination "if
// necessary" bracket reset, and occasionally an unplayed third set) was left in
// the file with every line prefixed `//`. The backfill importer matched those
// lines with a regex that ignored JS comment syntax, so never-played matches
// and never-played sets were imported as real results.
//
// This reports two defect classes:
//   MATCH  - the whole block is commented out, yet a matches row exists
//   SET    - only a games[i].scores line is commented out, yet the DB holds it
//
// Usage: DOTENV_CONFIG_PATH=.env.local npx tsx scripts/audit-commented-playoff-data.ts
import "dotenv/config"
import fs from "node:fs"
import path from "node:path"
import { and, eq } from "drizzle-orm"
import {
    divisions,
    matches,
    playoffMatchesMeta,
    seasons,
    teams
} from "../src/database/schema"
import { db } from "../src/database/db"
import { parseFilename } from "../src/lib/wayback/identify"

const CACHE = path.join(process.cwd(), "scripts", "data", "local")

interface SourceMatch {
    num: number
    commented: boolean
    games: { index: number; scores: [number, number]; commented: boolean }[]
}

/** Walk the JS block line by line, tracking which lines are commented out. */
export function parseSourceMatches(html: string): SourceMatch[] {
    const out: SourceMatch[] = []
    let current: SourceMatch | null = null
    for (const raw of html.split("\n")) {
        const commented = /^\s*\/\//.test(raw)
        const line = raw.replace(/^\s*\/\/\s*/, "").trim()

        const numMatch = line.match(/^match\.num\s*=\s*(\d+)/)
        if (numMatch) {
            current = { num: Number(numMatch[1]), commented, games: [] }
            out.push(current)
            continue
        }
        const gameMatch = line.match(
            /^match\.games\[(\d+)\]\.scores\s*=\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/
        )
        if (gameMatch && current) {
            current.games.push({
                index: Number(gameMatch[1]),
                scores: [Number(gameMatch[2]), Number(gameMatch[3])],
                commented
            })
        }
    }
    return out
}

async function main() {
    const allSeasons = await db.select().from(seasons)
    const seasonByCode = new Map(allSeasons.map((s: any) => [s.code, s]))
    const allDivisions = await db.select().from(divisions)
    const divByName = new Map(
        allDivisions.map((d: any) => [d.name.toLowerCase(), d])
    )
    const allTeams = await db.select().from(teams)
    const teamName = new Map(
        allTeams.map((t: any) => [t.id, `#${t.number} ${t.name ?? ""}`.trim()])
    )

    const badMatches: any[] = []
    const badSets: any[] = []
    const unresolved: string[] = []

    for (const seasonCode of fs.readdirSync(CACHE).sort()) {
        const dir = path.join(CACHE, seasonCode)
        if (!fs.statSync(dir).isDirectory()) continue
        const season = seasonByCode.get(seasonCode)
        if (!season) {
            unresolved.push(`season ${seasonCode} not in DB`)
            continue
        }
        for (const file of fs.readdirSync(dir).sort()) {
            const parsed = parseFilename(file)
            if (!parsed || parsed.kind !== "playoff") continue
            const division = divByName.get(parsed.divisionCode)
            if (!division) {
                unresolved.push(`${seasonCode}/${file}: unknown division`)
                continue
            }
            const html = fs.readFileSync(path.join(dir, file), "utf-8")
            const srcMatches = parseSourceMatches(html)
            if (srcMatches.length === 0) continue

            const meta = await db
                .select()
                .from(playoffMatchesMeta)
                .where(
                    and(
                        eq(playoffMatchesMeta.season, season.id),
                        eq(playoffMatchesMeta.division, division.id)
                    )
                )
            const metaByNum = new Map(meta.map((m: any) => [m.match_num, m]))

            for (const sm of srcMatches) {
                const mt = metaByNum.get(sm.num)
                if (!mt?.match_id) continue
                const row = (
                    await db
                        .select()
                        .from(matches)
                        .where(eq(matches.id, mt.match_id))
                )[0] as any
                if (!row) continue

                const hasResult =
                    row.home_set1_score !== null ||
                    row.away_set1_score !== null ||
                    row.home_score !== null ||
                    row.away_score !== null ||
                    row.winner !== null

                if (sm.commented) {
                    badMatches.push({
                        seasonCode,
                        seasonLabel: `${season.season} ${season.year}`,
                        division: division.name,
                        file,
                        matchNum: sm.num,
                        matchId: row.id,
                        metaId: mt.id,
                        hasResult,
                        detail: `${teamName.get(row.home_team) ?? "?"} ${row.home_score}-${row.away_score} ${teamName.get(row.away_team) ?? "?"} W=${row.winner ? teamName.get(row.winner) : "none"} sets ${row.home_set1_score}-${row.away_set1_score},${row.home_set2_score}-${row.away_set2_score},${row.home_set3_score}-${row.away_set3_score}`
                    })
                    continue
                }

                // Played match: check for commented-out (unplayed) sets that
                // nevertheless landed in the DB.
                for (const g of sm.games) {
                    if (!g.commented) continue
                    const n = g.index + 1
                    const h = row[`home_set${n}_score`]
                    const a = row[`away_set${n}_score`]
                    if (h === null && a === null) continue
                    badSets.push({
                        seasonCode,
                        division: division.name,
                        matchNum: sm.num,
                        matchId: row.id,
                        set: n,
                        db: `${h}-${a}`,
                        source: `${g.scores[0]}-${g.scores[1]}`
                    })
                }
            }
        }
    }

    console.log(
        `\n=== MATCHES IMPORTED FROM COMMENTED-OUT (NEVER PLAYED) BLOCKS: ${badMatches.length} ===\n`
    )
    for (const b of badMatches) {
        console.log(
            `${b.seasonCode} (${b.seasonLabel}) / ${b.division}  ${b.file}  match #${b.matchNum}  matchId=${b.matchId} metaId=${b.metaId} hasResult=${b.hasResult}`
        )
        console.log(`    ${b.detail}`)
    }
    console.log(
        `\n=== SETS IMPORTED FROM COMMENTED-OUT LINES: ${badSets.length} ===\n`
    )
    for (const b of badSets) console.log(JSON.stringify(b))
    if (unresolved.length) {
        console.log(`\n=== UNRESOLVED SOURCES: ${unresolved.length} ===`)
        for (const u of unresolved) console.log(`  ${u}`)
    }
    fs.writeFileSync(
        path.join(
            process.cwd(),
            "scripts",
            "data",
            "commented-playoff-audit.json"
        ),
        JSON.stringify({ badMatches, badSets, unresolved }, null, 2)
    )
    process.exit(0)
}
main()
