#!/usr/bin/env tsx
// Repairs the synthetic `drafts.overall` on backfilled historical rosters.
//
// THE BUG
// `drafts.overall` is not a pick number within a division. It is a league-wide
// placement score BANDED BY DIVISION LEVEL, 50 wide per level -- AA owns 1-50,
// A owns 51-100, BBB owns 201-250, BB owns 251-300. The live draft
// (submitDraft, src/app/dashboard/draft-division/actions.ts) encodes the
// division into the number:
//
//     overall = (divisionLevel - 1) * 50 + (round - 1) * numTeams + position
//
// The historical import computed only the second term, so every backfilled
// player landed in the AA band -- BB players carrying overall = 25. It survived
// review because the missing offset is zero for AA, so the formula was correct
// for exactly the division most likely to be spot-checked.
//
// This matters beyond display: fetchPlayerScores (src/lib/player-score.ts)
// reads a player's most recent `overall` as their placement score, lower
// meaning higher division, with no division context attached. Every affected
// player reads to the placement engine as AA-calibre.
//
// FINDING THE AFFECTED ROWS
// Backfilled slices have a signature no real draft can produce: within one
// (season, division), EVERY row shares round = 4 and a single `overall`. A
// snake draft varies `position` by team and runs rounds 1..N. The script
// refuses to run if that stops being true.
//
// Team count comes from teams WITH DRAFTS, not all teams in the division --
// they differ only for S00/BB (9 teams, 8 with rosters), and 8 is right because
// it reproduces what the archived roster page listed; the 9th is a champion
// stub with no players.
//
// PASS 2, for slices the signature cannot see
// fill-missing-teams.ts backfilled 7 of S23/AB's 8 teams into a division that
// ALREADY held a real draft, so that slice is mixed: 48 real rows plus 16
// synthetic ones, and it is not uniform. Those rows are caught by direction
// instead. The omitted term is always positive, so this bug can only ever place
// a row BELOW its division's band; a real pick is inside its band, or above it
// when a long draft overflows the 50-wide band (F12/BBB runs 7 teams x 8 rounds
// = 56 picks, and F12/BB 9 rounds -- both pre-existing and left alone). So
// "round 4 and below band" is exactly this bug and nothing else, and the repair
// is to add back the missing (level - 1) * 50.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/fix-draft-overall.ts
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/fix-draft-overall.ts --apply

import "dotenv/config"
import { Client } from "pg"
import {
    HISTORICAL_ROUND,
    divisionBand,
    historicalOverall
} from "../src/lib/wayback/historical-pick"

const apply = process.argv.includes("--apply")

interface Slice {
    season: number
    division: number
    code: string
    div: string
    level: number
    teams: number
    rows: number
    current: number
}

async function main() {
    const c = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    })
    await c.connect()
    console.log(`mode: ${apply ? "APPLY (will write)" : "DRY RUN (read-only)"}`)

    // Guard: the signature must still discriminate. If any slice has a single
    // `overall` across MORE than one round, uniform-overall no longer implies
    // "synthetic" and this script must not guess.
    const ambiguous = (
        await c.query(
            `with slice as (
               select t.season, t.division,
                      count(distinct dr.round) rounds,
                      count(distinct dr.overall) overalls
               from drafts dr join teams t on t.id = dr.team
               group by 1, 2)
             select count(*)::int n from slice where overalls = 1 and rounds > 1`
        )
    ).rows[0].n as number
    if (ambiguous > 0) {
        console.error(
            `\nABORT: ${ambiguous} slice(s) have one overall across several rounds.` +
                "\nThe uniform-overall signature no longer identifies backfilled rows."
        )
        process.exit(1)
    }

    const slices = (
        await c.query(
            `select t.season, t.division, se.code, d.name div, d.level,
                    count(distinct t.id)::int teams,
                    count(*)::int rows,
                    min(dr.overall)::int current
             from drafts dr
             join teams t on t.id = dr.team
             join divisions d on d.id = t.division
             join seasons se on se.id = t.season
             group by 1, 2, 3, 4, 5
             having count(distinct dr.round) = 1
                and count(distinct dr.overall) = 1
                and min(dr.round) = $1
             order by d.level, t.season`,
            [HISTORICAL_ROUND]
        )
    ).rows as Slice[]

    const changes = slices
        .map((s) => ({ ...s, want: historicalOverall(s.level, s.teams) }))
        .filter((s) => s.want !== s.current)
    const unchanged = slices.length - changes.length

    // Pass 2: synthetic rows sitting in a slice that also holds a real draft,
    // so the uniform signature above cannot see them. Below-band is the tell.
    const strays = (
        await c.query(
            `select se.code, d.name div, d.level, count(*)::int rows,
                    min(dr.overall)::int current
             from drafts dr
             join teams t on t.id = dr.team
             join divisions d on d.id = t.division
             join seasons se on se.id = t.season
             where dr.round = $1 and dr.overall <= (d.level - 1) * 50
             group by 1, 2, 3
             order by 3`,
            [HISTORICAL_ROUND]
        )
    ).rows as {
        code: string
        div: string
        level: number
        rows: number
        current: number
    }[]

    console.log(
        `\nbackfilled slices: ${slices.length}` +
            `  |  already correct: ${unchanged}` +
            `  |  to fix: ${changes.length}` +
            ` (${changes.reduce((a, s) => a + s.rows, 0)} rows)\n`
    )

    let lastDiv = ""
    for (const s of changes) {
        const label = `${s.div}(L${s.level})`
        if (label !== lastDiv) {
            const b = divisionBand(s.level)
            console.log(`  ${label} -- band ${b.min}..${b.max}`)
            lastDiv = label
        }
        console.log(
            `     ${s.code.padEnd(4)} ${String(s.teams).padStart(2)} teams  ` +
                `${String(s.rows).padStart(3)} rows   ${String(s.current).padStart(3)} -> ${s.want}`
        )
    }

    if (strays.length > 0) {
        console.log(
            "\n  below-band rows in mixed slices (real draft + backfill):"
        )
        for (const s of strays) {
            console.log(
                `     ${s.code.padEnd(4)} ${s.div}(L${s.level})  ` +
                    `${String(s.rows).padStart(3)} rows   ${s.current} -> ${s.current + (s.level - 1) * 50}`
            )
        }
    }

    if (changes.length === 0 && strays.length === 0) {
        console.log("  (nothing to do)")
        await c.end()
        return
    }

    if (!apply) {
        console.log("\nDRY RUN -- nothing written. Re-run with --apply.")
        await c.end()
        return
    }

    const before = (await c.query("select count(*)::int n from drafts")).rows[0]
        .n as number

    await c.query("BEGIN")
    try {
        let updated = 0
        for (const s of changes) {
            updated += (
                await c.query(
                    `update drafts set overall = $1
                     where round = $2 and team in (
                       select id from teams where season = $3 and division = $4)`,
                    [s.want, HISTORICAL_ROUND, s.season, s.division]
                )
            ).rowCount as number
        }
        console.log(`\n  pass 1: updated ${updated} drafts rows`)

        // Pass 2 re-reads current state, so any row pass 1 already lifted into
        // its band is no longer below it and cannot be shifted twice.
        const lifted = (
            await c.query(
                `update drafts set overall = overall + (d.level - 1) * 50
                 from teams t, divisions d
                 where drafts.team = t.id and d.id = t.division
                   and drafts.round = $1
                   and drafts.overall <= (d.level - 1) * 50`,
                [HISTORICAL_ROUND]
            )
        ).rowCount as number
        console.log(`  pass 2: updated ${lifted} drafts rows`)

        await c.query("COMMIT")
        console.log("COMMITTED")
    } catch (error) {
        await c.query("ROLLBACK")
        console.error("\nROLLED BACK:", (error as Error).message)
        process.exit(1)
    }

    // Post-conditions: no rows gained or lost, and every synthetic row now sits
    // inside its own division's band.
    const after = (await c.query("select count(*)::int n from drafts")).rows[0]
        .n as number
    console.log(
        `\nverification:\n  drafts rows ${before} -> ${after}` +
            (before === after ? " (unchanged)" : "  *** CHANGED ***")
    )

    // No drafts row of any kind may sit BELOW its division's band -- that is
    // this bug's unique signature. Rows ABOVE a band are a different,
    // pre-existing thing (a long real draft overflowing 50) and are reported
    // rather than touched.
    const below = (
        await c.query(
            `select se.code, d.name div, d.level, count(*)::int n, min(dr.overall)::int ov
             from drafts dr
             join teams t on t.id = dr.team
             join divisions d on d.id = t.division
             join seasons se on se.id = t.season
             where dr.overall <= (d.level - 1) * 50
             group by 1, 2, 3`
        )
    ).rows
    console.log(
        below.length === 0
            ? "  no drafts row sits below its division's band"
            : `  *** ${below.length} slice(s) still below their band ***`
    )
    for (const r of below) {
        console.log(
            `     ${r.code}/${r.div} (L${r.level}) ${r.n} rows at ${r.ov}`
        )
    }

    const above = (
        await c.query(
            `select se.code, d.name div, d.level, count(*)::int n, max(dr.round)::int rnd
             from drafts dr
             join teams t on t.id = dr.team
             join divisions d on d.id = t.division
             join seasons se on se.id = t.season
             where dr.overall > d.level * 50
             group by 1, 2, 3`
        )
    ).rows
    if (above.length > 0) {
        console.log(
            `\n  FYI -- ${above.length} pre-existing slice(s) sit ABOVE their band.` +
                "\n  Not this bug and not touched: a draft of more than 50 picks" +
                "\n  overflows the 50-wide band, and U12/AA is numbered as A."
        )
        for (const r of above) {
            console.log(
                `     ${r.code}/${r.div} (L${r.level}) ${r.n} rows, through round ${r.rnd}`
            )
        }
    }

    await c.end()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
