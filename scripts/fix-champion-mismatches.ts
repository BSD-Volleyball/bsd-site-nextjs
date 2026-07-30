#!/usr/bin/env tsx
// Resolves the leftover champion mismatches from the archive backfill.
//
// Three distinct causes, each handled separately:
//
// A. ORPHANED CHAMPION STUBS. Pre-2012 seasons carry a team row per division
//    created years ago by the champions import, with number NULL. The backfill
//    adopts that row when the captain surname matches, otherwise it creates a
//    fresh numbered team -- leaving the stub behind as a duplicate. Adoption
//    failed on spelling: "Team Luchitsky" vs "Team Luchytsky", "Team
//    Villaneuva" vs "Team Villanueva". Where a stub resolves unambiguously to
//    exactly one numbered team, the champions row is re-pointed at the real
//    team and the stub is deleted.
//
// B. FALLBACK TEAM NAMES. A roster page with no "(Capt)" marker yields a team
//    named "Team 5" after its number. The standings page for the same division
//    does name the captain, so the team is renamed -- which then lets its
//    champion stub be adopted by rule A.
//
// C. MISASSIGNED PLAYOFF PAGES. A Wayback playoff page has no season on it, so
//    the inventory borrows one from the nearest sibling snapshot. That is
//    unsound for playoff pages specifically: the site leaves a completed
//    bracket up until the NEXT season's playoffs, so a page captured in
//    September can still show the PREVIOUS season's results while its sibling
//    roster page already shows the new season. Fall 2002 A is the clear case --
//    its playoff page names Gartner, McIntyre, Gillick, Lu, Butler and Bower
//    while its own standings page names Stump, Gartner, Dethlefsen, Chang,
//    Mulford and Butler. Those imports are deleted rather than left wrong.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/fix-champion-mismatches.ts
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/fix-champion-mismatches.ts --apply

import "dotenv/config"
import path from "node:path"
import { Client } from "pg"
import {
    buildSurnameIndex,
    resolveSurname
} from "../src/lib/wayback/html-table"
import { loadInventory, loadSlice } from "./backfill/lib/load-slice"

const apply = process.argv.includes("--apply")
const norm = (s: string) =>
    (s ?? "")
        .toLowerCase()
        .replace(/^team\s+/, "")
        .replace(/[^a-z]/g, "")

// At or below this share of shared participants, a playoff page is not
// describing the same division as the standings page it was filed with. Fall
// 2002 BB sits at exactly half: three of its six playoff participants appear in
// its own standings, and all six appear together in SPRING 2002 BB -- the page
// is the previous season's bracket, still on the site in September.
const OVERLAP_THRESHOLD = 0.5

async function main() {
    const c = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    })
    await c.connect()
    console.log(
        `mode: ${apply ? "APPLY (will write)" : "DRY RUN (read-only)"}\n`
    )

    const inventory = loadInventory(
        path.join(process.cwd(), "scripts", "data", "inventory.json")
    )

    // ---- B. rename fallback "Team <number>" teams -----------------------
    console.log("=== B. teams named after their number ===")
    const fallback = (
        await c.query(`
        select t.id, t.number, t.name, s.code, s.id season_id, d.name div, d.id division_id
        from teams t join seasons s on s.id = t.season join divisions d on d.id = t.division
        where t.name ~ '^Team [0-9]+$'`)
    ).rows as {
        id: number
        number: number
        name: string
        code: string
        season_id: number
        div: string
        division_id: number
    }[]
    const renames: { id: number; from: string; to: string }[] = []

    // Also rename teams whose name is DUPLICATED inside their own division.
    // Spring 2009 A has two "Team Weiss"; the standings page distinguishes them
    // as B.Weiss and D.Weiss. While they share a name nothing can resolve a
    // playoff result to one of them, so the more specific name is adopted.
    const ambiguous = (
        await c.query(`
        select t.id, t.number, t.name, s.code, s.id season_id, d.name div, d.id division_id
        from teams t join seasons s on s.id = t.season join divisions d on d.id = t.division
        where t.number is not null
          and exists (
            select 1 from teams o
            where o.season = t.season and o.division = t.division
              and o.id <> t.id and lower(o.name) = lower(t.name))`)
    ).rows as typeof fallback

    for (const t of [...fallback, ...ambiguous]) {
        const record = inventory.find(
            (r) =>
                r.seasonCode === t.code &&
                r.divisionCode === t.div.toLowerCase() &&
                r.kind === "standings"
        )
        if (!record) {
            continue
        }
        const surname = loadSlice(record).teamCaptains.get(t.number)
        if (!surname || !norm(surname)) {
            continue
        }
        const target = `Team ${surname}`
        if (target === t.name) {
            continue
        }
        renames.push({ id: t.id, from: t.name, to: target })
        console.log(
            `  ${t.code}/${t.div} #${t.number}: "${t.name}" -> "${target}"`
        )
    }

    if (renames.length === 0) {
        console.log("  (none)")
    }
    if (apply) {
        for (const r of renames) {
            await c.query("update teams set name = $2 where id = $1", [
                r.id,
                r.to
            ])
        }
    }

    // ---- A. adopt orphaned champion stubs -------------------------------
    console.log("\n=== A. orphaned champion stubs ===")
    const stubs = (
        await c.query(`
        select t.id, t.name, s.code, s.id season_id, d.name div, d.id division_id
        from teams t
        join seasons s on s.id = t.season
        join divisions d on d.id = t.division
        where t.number is null
          and exists (select 1 from champions ch where ch.team = t.id)
          and not exists (select 1 from drafts x where x.team = t.id)
          and not exists (select 1 from matches m where m.home_team = t.id or m.away_team = t.id)
        order by s.id, d.level`)
    ).rows as {
        id: number
        name: string
        code: string
        season_id: number
        div: string
        division_id: number
    }[]

    const adoptions: { stub: number; real: number; label: string }[] = []
    const unresolved: string[] = []

    for (const stub of stubs) {
        const candidates = (
            await c.query(
                `select t.id, t.name, t.number from teams t
                 where t.season = $1 and t.division = $2 and t.number is not null`,
                [stub.season_id, stub.division_id]
            )
        ).rows as { id: number; name: string; number: number }[]
        if (candidates.length === 0) {
            unresolved.push(
                `${stub.code}/${stub.div}: "${stub.name}" -- no numbered teams`
            )
            continue
        }

        const index = new Map(candidates.map((t) => [norm(t.name), t.id]))
        let hit = resolveSurname(stub.name.replace(/^Team\s+/i, ""), index)

        if (hit === null) {
            // "Theoharis" matches both "D.Theoharis" and "A.Theoharis". The
            // bracket settles it: prefer whichever won the last decided match.
            const contains = candidates.filter((t) =>
                norm(t.name).includes(norm(stub.name))
            )
            if (contains.length > 1) {
                const winner = (
                    await c.query(
                        `select m.winner from matches m
                         where m.season=$1 and m.division=$2 and m.playoff and m.winner is not null
                         order by m.week desc, m.id desc limit 1`,
                        [stub.season_id, stub.division_id]
                    )
                ).rows[0]?.winner as number | undefined
                if (winner && contains.some((t) => t.id === winner)) {
                    hit = winner
                }
            }
        }

        if (hit === null) {
            unresolved.push(
                `${stub.code}/${stub.div}: "${stub.name}" vs ${candidates.map((t) => t.name).join(", ")}`
            )
            continue
        }
        const real = candidates.find((t) => t.id === hit)
        adoptions.push({
            stub: stub.id,
            real: hit,
            label: `${stub.code}/${stub.div}: "${stub.name}" -> "${real?.name}"`
        })
        console.log(
            `  ${stub.code}/${stub.div}: "${stub.name}" -> "${real?.name}"`
        )
    }
    if (adoptions.length === 0) {
        console.log("  (none)")
    }
    console.log(`\n  unresolved stubs (${unresolved.length}) -- left alone:`)
    for (const u of unresolved) {
        console.log(`    ${u}`)
    }

    if (apply) {
        for (const a of adoptions) {
            await c.query("update champions set team = $2 where team = $1", [
                a.stub,
                a.real
            ])
            await c.query("delete from teams where id = $1", [a.stub])
        }
    }

    // ---- C. misassigned playoff pages -----------------------------------
    console.log("\n=== C. playoff pages describing a different division ===")
    const suspect: {
        code: string
        div: string
        seasonId: number
        divisionId: number
    }[] = []
    for (const record of inventory.filter((r) => r.kind === "playoff")) {
        // Only Wayback pages that had to borrow a season are at risk.
        if (!record.seasonSource.startsWith("sibling")) {
            continue
        }
        const standings = inventory.find(
            (r) =>
                r.kind === "standings" &&
                r.seasonCode === record.seasonCode &&
                r.divisionCode === record.divisionCode
        )
        if (!standings) {
            continue
        }

        const playoffNames = new Set(
            loadSlice(record)
                .playoffMatches.flatMap((m) => [
                    m.winnerSurname,
                    m.loserSurname
                ])
                .filter((n): n is string => !!n)
                .map(norm)
        )
        if (playoffNames.size === 0) {
            continue
        }
        // The standings "Captain" column is decorated -- `Aaron "Brockovich"`,
        // `"Menace the" Dennis`, `Chan / Jandrew` -- so comparing raw strings
        // reports a false mismatch. Fall 2000 BB looked like 0/9 overlap that
        // way when in fact every participant is there. Use the same alias index
        // the importer uses.
        const captains = [...loadSlice(standings).teamCaptains.values()].filter(
            Boolean
        )
        if (captains.length === 0) {
            continue
        }
        const index = buildSurnameIndex(
            captains.map((name, i) => ({ name, value: i }))
        )

        const shared = [...playoffNames].filter(
            (n) => resolveSurname(n, index) !== null
        ).length
        const overlap = shared / playoffNames.size
        if (overlap <= OVERLAP_THRESHOLD) {
            const season = (
                await c.query("select id from seasons where code = $1", [
                    record.seasonCode
                ])
            ).rows[0]?.id
            const division = (
                await c.query(
                    "select id from divisions where lower(name) = $1",
                    [record.divisionCode]
                )
            ).rows[0]?.id
            console.log(
                `  ${record.key}: only ${shared}/${playoffNames.size} participants appear in its own standings ` +
                    `(${record.snapshotTs}, ${record.seasonSource})`
            )
            if (season && division) {
                suspect.push({
                    code: record.seasonCode,
                    div: record.divisionCode,
                    seasonId: season,
                    divisionId: division
                })
            }
        }
    }
    if (suspect.length === 0) {
        console.log("  (none)")
    }

    if (apply && suspect.length > 0) {
        for (const s of suspect) {
            await c.query(
                `delete from playoff_matches_meta where match_id in
                   (select id from matches where season=$1 and division=$2 and playoff)`,
                [s.seasonId, s.divisionId]
            )
            const d = await c.query(
                "delete from matches where season=$1 and division=$2 and playoff",
                [s.seasonId, s.divisionId]
            )
            console.log(
                `  removed ${d.rowCount} misassigned playoff matches from ${s.code}/${s.div}`
            )
        }
    }

    console.log("\n=== SUMMARY ===")
    console.log(`  teams renamed        : ${renames.length}`)
    console.log(`  champion stubs merged: ${adoptions.length}`)
    console.log(`  stubs left alone     : ${unresolved.length}`)
    console.log(`  misassigned slices   : ${suspect.length}`)
    if (!apply) {
        console.log("\nDRY RUN -- nothing written. Re-run with --apply.")
    }

    await c.end()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
