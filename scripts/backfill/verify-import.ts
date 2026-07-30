#!/usr/bin/env tsx
// Checks imported history against independent sources of truth.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/backfill/verify-import.ts
//   ... --seasons F16
//
// Three checks, each using something the importer did not itself produce:
//
//   1. Standings   -- recompute from the imported matches and diff against the
//                     W/L table published on the archived page. Only the
//                     pre-2013 pages publish one; the JS-era pages compute
//                     theirs in the browser, so those seasons rely on check 2.
//   2. Champions   -- the winner of the last playoff match must be the team
//                     recorded in the champions table, which was imported years
//                     ago from a different source entirely. This is what
//                     catches a season being filed under the wrong year.
//   3. Integrity   -- set scores must agree with the games-won columns, and
//                     playoff weeks must not collide with regular-season weeks.

import "dotenv/config"
import fs from "node:fs"
import path from "node:path"
import { and, eq } from "drizzle-orm"
import { db } from "../../src/database/db"
import {
    champions,
    divisions,
    matches,
    seasons,
    teams
} from "../../src/database/schema"
import {
    type InventoryRecord,
    loadInventory,
    loadSlice
} from "./lib/load-slice"

const INVENTORY = path.join(process.cwd(), "scripts", "data", "inventory.json")

interface Row {
    seasonCode: string
    divisionCode: string
    regular: number
    playoff: number
    weeks: string
    standings: string
    champion: string
    integrity: string
}

function tally(
    rows: {
        home: number | null
        away: number | null
        homeGames: number
        awayGames: number
    }[]
) {
    const map = new Map<number, { wins: number; losses: number }>()
    const add = (team: number, wins: number, losses: number) => {
        const current = map.get(team) ?? { wins: 0, losses: 0 }
        map.set(team, {
            wins: current.wins + wins,
            losses: current.losses + losses
        })
    }
    for (const row of rows) {
        if (row.home === null || row.away === null) {
            continue
        }
        add(row.home, row.homeGames, row.awayGames)
        add(row.away, row.awayGames, row.homeGames)
    }
    return map
}

async function main() {
    const argv = process.argv.slice(2)
    let only: Set<string> | null = null
    const at = argv.indexOf("--seasons")
    if (at !== -1) {
        only = new Set((argv[at + 1] ?? "").split(",").filter(Boolean))
    }

    const inventory = loadInventory(INVENTORY)
    const seasonRows = await db
        .select({ id: seasons.id, code: seasons.code })
        .from(seasons)
    const divisionRows = await db
        .select({ id: divisions.id, name: divisions.name })
        .from(divisions)
    const seasonIdByCode = new Map(seasonRows.map((r) => [r.code, r.id]))
    const divisionIdByCode = new Map(
        divisionRows.map((r) => [r.name.toLowerCase(), r.id])
    )

    // One entry per (season, division) that has any imported page.
    const slices = new Map<string, InventoryRecord[]>()
    for (const record of inventory) {
        if (only && !only.has(record.seasonCode)) {
            continue
        }
        const key = `${record.seasonCode}|${record.divisionCode}`
        slices.set(key, [...(slices.get(key) ?? []), record])
    }

    const report: Row[] = []
    const totals = {
        standingsChecked: 0,
        standingsExact: 0,
        championChecked: 0,
        championOk: 0,
        integrityFailures: 0
    }

    for (const [key, records] of [...slices.entries()].sort()) {
        const [seasonCode, divisionCode] = key.split("|")
        const seasonId = seasonIdByCode.get(seasonCode)
        const divisionId = divisionIdByCode.get(divisionCode)
        if (seasonId === undefined || divisionId === undefined) {
            continue
        }

        const teamRows = await db
            .select({ id: teams.id, number: teams.number, name: teams.name })
            .from(teams)
            .where(
                and(eq(teams.season, seasonId), eq(teams.division, divisionId))
            )
        const teamIdByNumber = new Map(
            teamRows
                .filter((t) => t.number !== null)
                .map((t) => [t.number as number, t.id])
        )

        const matchRows = await db
            .select({
                home: matches.home_team,
                away: matches.away_team,
                homeGames: matches.home_score,
                awayGames: matches.away_score,
                week: matches.week,
                playoff: matches.playoff,
                winner: matches.winner,
                h1: matches.home_set1_score,
                a1: matches.away_set1_score,
                h2: matches.home_set2_score,
                a2: matches.away_set2_score,
                h3: matches.home_set3_score,
                a3: matches.away_set3_score
            })
            .from(matches)
            .where(
                and(
                    eq(matches.season, seasonId),
                    eq(matches.division, divisionId)
                )
            )

        const regular = matchRows.filter((m) => !m.playoff)
        const playoff = matchRows.filter((m) => m.playoff)
        if (matchRows.length === 0) {
            continue
        }

        // --- 1. standings ---------------------------------------------------
        let standings = "n/a"
        const standingsRecord = records.find((r) => r.kind === "standings")
        if (standingsRecord) {
            const slice = loadSlice(standingsRecord)
            if (slice.standings.length > 0) {
                totals.standingsChecked++
                const derived = tally(
                    regular.map((m) => ({
                        home: m.home,
                        away: m.away,
                        homeGames: m.homeGames ?? 0,
                        awayGames: m.awayGames ?? 0
                    }))
                )
                let bad = 0
                for (const row of slice.standings) {
                    const teamId = teamIdByNumber.get(row.teamNumber)
                    const got = teamId ? derived.get(teamId) : undefined
                    if (
                        !got ||
                        got.wins !== row.wins ||
                        got.losses !== row.losses
                    ) {
                        bad++
                    }
                }
                standings =
                    bad === 0 ? "exact" : `${bad}/${slice.standings.length} off`
                if (bad === 0) {
                    totals.standingsExact++
                }
            }
        }

        // --- 2. champion ----------------------------------------------------
        let champion = "n/a"
        if (playoff.length > 0) {
            const championRow = await db
                .select({ team: champions.team })
                .from(champions)
                .where(
                    and(
                        eq(champions.season, seasonId),
                        eq(champions.division, divisionId)
                    )
                )
            if (championRow.length > 0) {
                totals.championChecked++
                const lastWeek = Math.max(...playoff.map((m) => m.week))
                const finals = playoff.filter((m) => m.week === lastWeek)
                const winners = new Set(
                    finals
                        .map((m) => m.winner)
                        .filter((w): w is number => w !== null)
                )
                if (winners.size === 0) {
                    champion = "no winner"
                } else if (winners.has(championRow[0].team)) {
                    champion = "ok"
                    totals.championOk++
                } else {
                    const expected = teamRows.find(
                        (t) => t.id === championRow[0].team
                    )
                    champion = `MISMATCH (expected ${expected?.name ?? championRow[0].team})`
                }
            }
        }

        // --- 3. integrity ---------------------------------------------------
        const integrityProblems: string[] = []
        for (const m of matchRows) {
            const sets = [
                [m.h1, m.a1],
                [m.h2, m.a2],
                [m.h3, m.a3]
            ].filter(([h, a]) => h !== null && a !== null) as [number, number][]
            if (sets.length === 0) {
                continue
            }
            const homeWon = sets.filter(([h, a]) => h > a).length
            const awayWon = sets.filter(([h, a]) => a > h).length
            if (
                homeWon !== (m.homeGames ?? 0) ||
                awayWon !== (m.awayGames ?? 0)
            ) {
                integrityProblems.push("sets/games disagree")
                break
            }
        }
        const regularWeeks = new Set(regular.map((m) => m.week))
        const playoffWeeks = new Set(playoff.map((m) => m.week))
        for (const week of playoffWeeks) {
            if (regularWeeks.has(week)) {
                integrityProblems.push(`week ${week} used by both`)
                break
            }
        }
        if (integrityProblems.length > 0) {
            totals.integrityFailures++
        }

        report.push({
            seasonCode,
            divisionCode,
            regular: regular.length,
            playoff: playoff.length,
            weeks: `${Math.min(...regularWeeks, Number.POSITIVE_INFINITY)}-${Math.max(
                ...regularWeeks,
                0
            )}`,
            standings,
            champion,
            integrity: integrityProblems.join("; ") || "ok"
        })
    }

    console.log(
        `${"season".padEnd(7)}${"div".padEnd(5)}${"reg".padStart(4)}${"po".padStart(4)}  ` +
            `${"weeks".padEnd(7)}${"standings".padEnd(14)}${"champion".padEnd(28)}integrity`
    )
    console.log("-".repeat(100))
    for (const row of report) {
        console.log(
            `${row.seasonCode.padEnd(7)}${row.divisionCode.padEnd(5)}` +
                `${String(row.regular).padStart(4)}${String(row.playoff).padStart(4)}  ` +
                `${row.weeks.padEnd(7)}${row.standings.padEnd(14)}` +
                `${row.champion.padEnd(28)}${row.integrity}`
        )
    }

    console.log("\n=== TOTALS ===")
    console.log(`  slices with matches   : ${report.length}`)
    console.log(
        `  standings reconciled  : ${totals.standingsExact}/${totals.standingsChecked}`
    )
    console.log(
        `  champion confirmed    : ${totals.championOk}/${totals.championChecked}`
    )
    console.log(`  integrity failures    : ${totals.integrityFailures}`)

    fs.writeFileSync(
        path.join(process.cwd(), "scripts", "data", "verification.json"),
        `${JSON.stringify(report, null, 1)}\n`
    )
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
