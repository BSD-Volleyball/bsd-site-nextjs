#!/usr/bin/env tsx
// Season-by-season inventory of what historical data the database actually
// holds: champions, regular-season matches, playoff matches, rosters, and --
// separately -- whether those rosters came from a REAL draft or were
// synthesised by the archive backfill.
//
// Real vs synthetic matters because they are not interchangeable. A synthetic
// roster records WHO was on a team; it carries no pick order, because the
// archived pages never had one. Every player in the division shares round 4 and
// one `overall`, which is a shape a snake draft cannot produce (a real draft
// varies position by team and runs rounds 1..N). That is the discriminator used
// here -- see src/lib/wayback/historical-pick.ts.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/backfill/report-coverage.ts
//   ... --csv         machine-readable
//   ... --gaps        only seasons missing something

import "dotenv/config"
import { Client } from "pg"
import { HISTORICAL_ROUND } from "../../src/lib/wayback/historical-pick"

const csv = process.argv.includes("--csv")
const gapsOnly = process.argv.includes("--gaps")

interface Row {
    id: number
    code: string
    year: number
    season: string
    phase: string
    champions: number
    divisions: number
    teams: number
    regular: number
    playoff: number
    rosterDivs: number
    realDivs: number
    synthDivs: number
    players: number
}

async function main() {
    const c = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    })
    await c.connect()

    const rows = (
        await c.query(
            `with roster_slice as (
               select t.season, t.division,
                      count(*)::int players,
                      -- Synthetic: one round (4) and one overall across the
                      -- whole division. A real draft cannot look like this.
                      (count(distinct dr.round) = 1
                       and count(distinct dr.overall) = 1
                       and min(dr.round) = $1) as synthetic
               from drafts dr
               join teams t on t.id = dr.team
               group by 1, 2)
             select s.id, s.code, s.year, s.season, s.phase,
               (select count(*)::int from champions ch where ch.season = s.id) champions,
               (select count(distinct ch.division)::int from champions ch where ch.season = s.id) divisions,
               (select count(*)::int from teams t where t.season = s.id) teams,
               (select count(*)::int from matches m where m.season = s.id and not m.playoff) regular,
               (select count(*)::int from matches m where m.season = s.id and m.playoff) playoff,
               (select count(*)::int from roster_slice r where r.season = s.id) "rosterDivs",
               (select count(*)::int from roster_slice r where r.season = s.id and not r.synthetic) "realDivs",
               (select count(*)::int from roster_slice r where r.season = s.id and r.synthetic) "synthDivs",
               (select coalesce(sum(r.players), 0)::int from roster_slice r where r.season = s.id) players
             from seasons s
             order by s.id`,
            [HISTORICAL_ROUND]
        )
    ).rows as Row[]

    if (csv) {
        console.log(
            "code,year,season,phase,champions,champDivisions,teams,regularMatches,playoffMatches,rosterDivisions,realDraftDivisions,syntheticDivisions,players"
        )
        for (const r of rows) {
            console.log(
                [
                    r.code,
                    r.year,
                    r.season,
                    r.phase,
                    r.champions,
                    r.divisions,
                    r.teams,
                    r.regular,
                    r.playoff,
                    r.rosterDivs,
                    r.realDivs,
                    r.synthDivs,
                    r.players
                ].join(",")
            )
        }
        await c.end()
        return
    }

    const mark = (n: number) => (n > 0 ? String(n) : "-")
    const shown = gapsOnly
        ? rows.filter(
              (r) =>
                  r.champions === 0 ||
                  r.regular === 0 ||
                  r.playoff === 0 ||
                  r.rosterDivs === 0
          )
        : rows

    console.log(
        "\n code   year  champs  teams  regular  playoff  rosters(div)  players   draft"
    )
    console.log(
        " ----   ----  ------  -----  -------  -------  ------------  -------   -----"
    )
    for (const r of shown) {
        const draft =
            r.rosterDivs === 0
                ? "-"
                : r.realDivs > 0 && r.synthDivs > 0
                  ? `${r.realDivs} real +${r.synthDivs} synth`
                  : r.realDivs > 0
                    ? "real"
                    : "synthetic"
        console.log(
            ` ${r.code.padEnd(5)} ${String(r.year).padStart(5)}  ${mark(r.champions).padStart(6)}  ` +
                `${mark(r.teams).padStart(5)}  ${mark(r.regular).padStart(7)}  ${mark(r.playoff).padStart(7)}  ` +
                `${mark(r.rosterDivs).padStart(12)}  ${mark(r.players).padStart(7)}   ${draft}`
        )
    }

    // Totals and the headline gaps.
    const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0)
    const count = (f: (r: Row) => boolean) => rows.filter(f).length
    console.log(`\n${rows.length} seasons in the database`)
    console.log(
        `  champions      ${count((r) => r.champions > 0)} seasons, ${sum((r) => r.champions)} rows`
    )
    console.log(
        `  regular match  ${count((r) => r.regular > 0)} seasons, ${sum((r) => r.regular)} matches`
    )
    console.log(
        `  playoff match  ${count((r) => r.playoff > 0)} seasons, ${sum((r) => r.playoff)} matches`
    )
    console.log(
        `  rosters        ${count((r) => r.rosterDivs > 0)} seasons, ${sum((r) => r.players)} roster spots`
    )
    console.log(
        `    real draft   ${count((r) => r.realDivs > 0)} seasons (${sum((r) => r.realDivs)} divisions)`
    )
    console.log(
        `    synthetic    ${count((r) => r.synthDivs > 0)} seasons (${sum((r) => r.synthDivs)} divisions)`
    )

    const noneAtAll = rows.filter(
        (r) => r.regular === 0 && r.playoff === 0 && r.rosterDivs === 0
    )
    if (noneAtAll.length > 0) {
        console.log(
            `\n  no matches AND no rosters (${noneAtAll.length}): ${noneAtAll.map((r) => r.code).join(" ")}`
        )
    }

    await c.end()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
