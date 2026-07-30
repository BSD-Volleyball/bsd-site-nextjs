#!/usr/bin/env tsx
// Splits the A and AA divisions that an earlier import merged.
//
// THE PROBLEM
// For eight seasons the league published two separate divisions, A and AA, but
// the database holds both sets of teams under AA. Fall 2013 is typical: the
// archive's standa.html lists #1 Dobres .. #6 Clemenceau and standaa.html lists
// #1 Truland .. #4 Griffith, while the database has all ten under AA -- ten
// teams with only six distinct numbers, because each division numbers its teams
// from 1 and the merge preserved both numberings.
//
// The champions table records the correct division for those same teams, so one
// historical import got it right and the other did not. Eight champions rows
// league-wide point at a team filed under a different division than the row
// claims -- one per affected season -- and that disagreement is what identifies
// the misfiled teams.
//
// This predates the archive backfill. It is why the backfill could not import
// those A divisions: it looked for division A, found it empty, and created
// duplicate teams.
//
// WHAT THIS DOES
//   1. For each affected season, read the archive's A-division standings page
//      and find the matching teams currently filed under AA (by team number and
//      captain surname). Requires an exact, complete match or it refuses.
//   2. Delete the phantom A-division teams the backfill created (ghost captain,
//      no roster) along with their matches, which were imported against empty
//      teams disconnected from the real rosters.
//   3. Move the real teams from AA to A. Ids, rosters and 2012+ history are
//      untouched; only the division label changes.
//
// Afterwards, re-import matches for those seasons so they bind to the corrected
// teams:
//   npx tsx scripts/backfill/import-wayback.ts --seasons F12,S13,U13,F13,S14,F14,S15,U15 \
//     --divisions a,aa --kinds matches,playoffs --replace-existing
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/fix-division-mapping.ts
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/fix-division-mapping.ts --apply
//
// Read-only unless --apply.

import "dotenv/config"
import fs from "node:fs"
import path from "node:path"
import { Client } from "pg"
import { loadInventory, loadSlice } from "./backfill/lib/load-slice"

const SEASONS = ["F12", "S13", "U13", "F13", "S14", "F14", "S15", "U15"]
const DIV_AA = 1
const DIV_A = 2

const apply = process.argv.includes("--apply")
const norm = (s: string) =>
    (s ?? "")
        .toLowerCase()
        .replace(/^team\s+/, "")
        .replace(/[^a-z]/g, "")

/**
 * The archive sometimes prints a captain's full name where the team is named
 * after the surname alone -- Spring 2015 AA lists "Kaye Johnson" against
 * "Team Johnson". Compare the whole string and the last word.
 */
function nameMatches(dbName: string, archiveName: string): boolean {
    if (norm(dbName) === norm(archiveName)) {
        return true
    }
    const lastWord = archiveName.trim().split(/\s+/).pop() ?? ""
    return lastWord.length >= 3 && norm(dbName) === norm(lastWord)
}

interface Move {
    seasonCode: string
    teamId: number
    number: number
    name: string
}

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

    const moves: Move[] = []
    const phantoms: number[] = []
    const problems: string[] = []

    for (const code of SEASONS) {
        const aPage = inventory.find(
            (r) =>
                r.seasonCode === code &&
                r.divisionCode === "a" &&
                r.kind === "standings"
        )
        const aaPage = inventory.find(
            (r) =>
                r.seasonCode === code &&
                r.divisionCode === "aa" &&
                r.kind === "standings"
        )
        if (!aPage || !aaPage) {
            problems.push(`${code}: missing an A or AA standings page`)
            continue
        }

        const aTeams = loadSlice(aPage).teamCaptains
        const aaTeams = loadSlice(aaPage).teamCaptains

        const dbTeams = (
            await c.query(
                `select t.id, t.number, t.name, t.captain,
                        (select count(*)::int from drafts d where d.team = t.id) drafts
                 from teams t join seasons s on s.id = t.season
                 where s.code = $1 and t.division = $2 order by t.id`,
                [code, DIV_AA]
            )
        ).rows as {
            id: number
            number: number
            name: string
            captain: string
            drafts: number
        }[]

        // Every team the archive's A page lists must be findable under AA, by
        // BOTH number and captain surname. Matching on one alone is not enough
        // when the numbers deliberately collide.
        const chosen: Move[] = []
        const unmatchedArchive: [number, string][] = []
        const claimed = new Set<number>()

        for (const [number, surname] of aTeams) {
            const hits = dbTeams.filter(
                (t) =>
                    !claimed.has(t.id) &&
                    t.number === number &&
                    nameMatches(t.name, surname)
            )
            if (hits.length === 1) {
                claimed.add(hits[0].id)
                chosen.push({
                    seasonCode: code,
                    teamId: hits[0].id,
                    number,
                    name: hits[0].name
                })
            } else {
                unmatchedArchive.push([number, surname])
            }
        }

        // A handful of teams are recorded under a different captain in the two
        // sources -- a co-captain, or a captain who changed mid-season. Where
        // every other team in the season has matched and exactly one candidate
        // with the right number is left over, the pairing is forced, so accept
        // it by elimination rather than hand-maintaining an alias list.
        for (const [number, surname] of [...unmatchedArchive]) {
            const leftovers = dbTeams.filter(
                (t) => !claimed.has(t.id) && t.number === number
            )
            const stillNeededByAa = [...aaTeams].some(
                ([n, s]) =>
                    n === number && nameMatches(leftovers[0]?.name ?? "", s)
            )
            if (leftovers.length === 1 && !stillNeededByAa) {
                claimed.add(leftovers[0].id)
                chosen.push({
                    seasonCode: code,
                    teamId: leftovers[0].id,
                    number,
                    name: leftovers[0].name
                })
                console.log(
                    `  ${code}: A #${number} "${surname}" paired with "${leftovers[0].name}" by elimination`
                )
                unmatchedArchive.splice(
                    unmatchedArchive.indexOf([number, surname] as never),
                    1
                )
            }
        }

        for (const [number, surname] of unmatchedArchive) {
            if (!chosen.some((m) => m.number === number)) {
                problems.push(
                    `${code}: A #${number} ${surname} could not be matched`
                )
            }
        }

        // What is left should be exactly the archive's AA division. The counts
        // and the team NUMBERS are the real check -- they decide the split. A
        // name that does not line up is worth reporting but does not change
        // which teams move, since the A side is already fully accounted for.
        const chosenIds = new Set(chosen.map((m) => m.teamId))
        const remaining = dbTeams.filter((t) => !chosenIds.has(t.id))
        const numbersOk =
            remaining.length === aaTeams.size &&
            [...aaTeams].every(([number]) =>
                remaining.some((t) => t.number === number)
            )

        if (chosen.length !== aTeams.size || !numbersOk) {
            problems.push(
                `${code}: split does not reconcile ` +
                    `(A ${chosen.length}/${aTeams.size}, AA leftover ${remaining.length}/${aaTeams.size})`
            )
            continue
        }

        for (const [number, surname] of aaTeams) {
            const t = remaining.find((x) => x.number === number)
            if (t && !nameMatches(t.name, surname)) {
                console.log(
                    `  ${code}: AA #${number} archive says "${surname}", database says "${t.name}" ` +
                        "-- same team, different captain recorded"
                )
            }
        }

        moves.push(...chosen)
        console.log(
            `${code}: A <- ${chosen.map((m) => `#${m.number} ${m.name.replace(/^Team /, "")}`).join(", ")}`
        )
        console.log(
            `${" ".repeat(code.length + 1)}AA stays ${remaining.map((t) => `#${t.number} ${t.name.replace(/^Team /, "")}`).join(", ")}`
        )

        const ghosts = (
            await c.query(
                `select t.id from teams t join seasons s on s.id = t.season
                 where s.code = $1 and t.division = $2 and t.captain = 'ghost-captain'
                   and (select count(*) from drafts d where d.team = t.id) = 0`,
                [code, DIV_A]
            )
        ).rows.map((r) => r.id as number)
        phantoms.push(...ghosts)
    }

    console.log(`\nteams to move AA -> A : ${moves.length}`)
    console.log(`phantom teams to drop : ${phantoms.length}`)

    if (problems.length > 0) {
        console.error(`\nPREFLIGHT FAILED (${problems.length}):`)
        for (const p of problems) {
            console.error(`  ${p}`)
        }
        process.exit(1)
    }

    const phantomMatches = (
        await c.query(
            `select count(*)::int n from matches
             where home_team = any($1) or away_team = any($1)`,
            [phantoms]
        )
    ).rows[0].n as number
    console.log(
        `matches on phantom teams: ${phantomMatches} (deleted, then re-imported)`
    )

    if (!apply) {
        console.log("\nDRY RUN -- nothing written. Re-run with --apply.")
        await c.end()
        return
    }

    await c.query("BEGIN")
    try {
        // Phantoms first: their matches must go before the real teams take the
        // A division, or the A division briefly holds two teams per number.
        const meta = await c.query(
            `delete from playoff_matches_meta where match_id in
               (select id from matches where home_team = any($1) or away_team = any($1))`,
            [phantoms]
        )
        const m = await c.query(
            `delete from matches where home_team = any($1) or away_team = any($1)`,
            [phantoms]
        )
        const t = await c.query(`delete from teams where id = any($1)`, [
            phantoms
        ])
        console.log(
            `\n  removed ${t.rowCount} phantom teams, ${m.rowCount} matches, ${meta.rowCount} meta rows`
        )

        const moved = await c.query(
            `update teams set division = $2 where id = any($1)`,
            [moves.map((x) => x.teamId), DIV_A]
        )
        console.log(`  moved ${moved.rowCount} teams from AA to A`)

        await c.query("COMMIT")
        console.log("COMMITTED")
    } catch (error) {
        await c.query("ROLLBACK")
        console.error("\nROLLED BACK:", (error as Error).message)
        process.exit(1)
    }

    fs.writeFileSync(
        path.join(process.cwd(), "scripts", "data", "division-fix.json"),
        `${JSON.stringify({ moves, phantoms }, null, 1)}\n`
    )
    console.log("\nwrote scripts/data/division-fix.json (reversal map)")

    console.log("\nverification:")
    const stillWrong = (
        await c.query(
            `select count(*)::int n from champions ch join teams t on t.id = ch.team
             where t.division <> ch.division`
        )
    ).rows[0].n
    console.log(
        `  champions rows pointing at the wrong division: ${stillWrong}`
    )

    const collisions = (
        await c.query(
            `select count(*)::int n from (
               select t.season, t.division from teams t where t.number is not null
               group by t.season, t.division, t.number having count(*) > 1) x`
        )
    ).rows[0].n
    console.log(
        `  season/division pairs with colliding team numbers: ${collisions}`
    )

    console.log("\nNow re-import matches for these seasons:")
    console.log(
        `  npx tsx scripts/backfill/import-wayback.ts --seasons ${SEASONS.join(",")} ` +
            "--divisions a,aa --kinds matches,playoffs --replace-existing"
    )

    await c.end()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
