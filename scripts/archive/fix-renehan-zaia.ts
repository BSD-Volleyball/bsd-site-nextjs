#!/usr/bin/env tsx
// Reunites one player's history across a surname change, and corrects the
// Spring 2011 B champion that the change had obscured.
//
// THE PUZZLE
// The champions table recorded Spring 2011 B as "Team Renehan", but the
// archived bracket for that division fields Slingluff, Lewallen, Zaia and
// Feliksik -- no Renehan -- and ends with Team Zaia beating Team Slingluff 2-0.
// The league confirms the winning captain was Phyllis Zaia.
//
// THE ANSWER
// Phyllis Renehan and Phyllis Zaia are the same person. The archive records her
// as Zaia; the champions import recorded her as Renehan. Their season ranges
// are complementary and adjacent -- Zaia F07..S12, Renehan F12..S14 -- so the
// name changed between Spring and Fall 2012, which is exactly the seam.
//
// The earlier legacy-player linking could not catch this: it matches on
// surname, and a name change shares none. So the backfill created a
// `legacy-roster-phyllis-zaia-*` account holding six seasons that belong on her
// real one.
//
// WHAT THIS DOES
//   1. Moves the legacy account's drafts and captaincies onto the real account,
//      then deletes the legacy account.
//   2. Re-points the Spring 2011 B champions row from the orphaned "Team
//      Renehan" stub to "Team Zaia", the team that actually won, and deletes
//      the stub.
//   3. Gives that team its real captain instead of the ghost.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/fix-renehan-zaia.ts
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/fix-renehan-zaia.ts --apply

import "dotenv/config"
import { Client } from "pg"

const REAL_ACCOUNT = "7UQgZSc6e23d7AQRpRj8ReQ3QcUSegJL" // Phyllis Renehan
const LEGACY_ACCOUNT = "c8d0ac25-1ab4-4fde-a6a8-47ccaa3e6987" // Phyllis Zaia
const STUB_TEAM = 861 // "Team Renehan", Spring 2011 B, no number, no roster
const REAL_TEAM = 1561 // "Team Zaia", Spring 2011 B #3, the bracket winner

const apply = process.argv.includes("--apply")

async function main() {
    const c = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    })
    await c.connect()
    console.log(
        `mode: ${apply ? "APPLY (will write)" : "DRY RUN (read-only)"}\n`
    )

    // Preflight: both accounts and both teams must be as expected, and the
    // bracket must actually show Team Zaia winning.
    const problems: string[] = []
    for (const [label, id, expected] of [
        ["real", REAL_ACCOUNT, "Renehan"],
        ["legacy", LEGACY_ACCOUNT, "Zaia"]
    ] as const) {
        const u = (
            await c.query(
                "select first_name, last_name, email from users where id = $1",
                [id]
            )
        ).rows[0]
        if (!u || u.last_name !== expected) {
            problems.push(`${label} account ${id} is not ${expected}`)
        } else {
            console.log(
                `  ${label.padEnd(7)} ${u.first_name} ${u.last_name} <${u.email}>`
            )
        }
    }

    const winner = (
        await c.query(
            `select w.id, w.name from matches m join teams w on w.id = m.winner
             join seasons s on s.id = m.season join divisions d on d.id = m.division
             where s.code = 'S11' and d.name = 'B' and m.playoff and m.winner is not null
             order by m.week desc, m.id desc limit 1`
        )
    ).rows[0]
    if (!winner || winner.id !== REAL_TEAM) {
        problems.push(
            `Spring 2011 B bracket winner is ${winner?.name ?? "unknown"} (id ${winner?.id}), expected team ${REAL_TEAM}`
        )
    } else {
        console.log(`  bracket winner: ${winner.name} (id ${winner.id})`)
    }

    const clash = (
        await c.query(
            `select count(*)::int n from drafts a join drafts b on b.team = a.team
             where a."user" = $1 and b."user" = $2`,
            [LEGACY_ACCOUNT, REAL_ACCOUNT]
        )
    ).rows[0].n as number
    if (clash > 0) {
        problems.push(`${clash} team(s) would end up with the player twice`)
    }

    if (problems.length > 0) {
        console.error("\nPREFLIGHT FAILED:")
        for (const p of problems) {
            console.error(`  ${p}`)
        }
        process.exit(1)
    }

    const drafts = (
        await c.query('select count(*)::int n from drafts where "user" = $1', [
            LEGACY_ACCOUNT
        ])
    ).rows[0].n
    const captaincies = (
        await c.query("select count(*)::int n from teams where captain = $1", [
            LEGACY_ACCOUNT
        ])
    ).rows[0].n
    console.log(
        `\n  would move ${drafts} draft rows and ${captaincies} captaincies onto the real account`
    )
    console.log(
        `  would re-point the Spring 2011 B champions row to team ${REAL_TEAM}`
    )

    if (!apply) {
        console.log("\nDRY RUN -- nothing written. Re-run with --apply.")
        await c.end()
        return
    }

    await c.query("BEGIN")
    try {
        const d = await c.query(
            'update drafts set "user" = $2 where "user" = $1',
            [LEGACY_ACCOUNT, REAL_ACCOUNT]
        )
        const t = await c.query(
            "update teams set captain = $2 where captain = $1",
            [LEGACY_ACCOUNT, REAL_ACCOUNT]
        )
        const u = await c.query("delete from users where id = $1", [
            LEGACY_ACCOUNT
        ])
        console.log(
            `  moved ${d.rowCount} drafts, ${t.rowCount} captaincies, removed ${u.rowCount} legacy account`
        )

        await c.query("update champions set team = $2 where team = $1", [
            STUB_TEAM,
            REAL_TEAM
        ])
        const s = await c.query("delete from teams where id = $1", [STUB_TEAM])
        console.log(
            `  re-pointed the champions row, removed ${s.rowCount} stub team`
        )

        // The winning team was created from a playoff page, so it still has the
        // ghost captain. It has a real one.
        await c.query(
            "update teams set captain = $2 where id = $1 and captain = 'ghost-captain'",
            [REAL_TEAM, REAL_ACCOUNT]
        )
        console.log("  gave the winning team its real captain")

        await c.query("COMMIT")
        console.log("COMMITTED")
    } catch (error) {
        await c.query("ROLLBACK")
        console.error("\nROLLED BACK:", (error as Error).message)
        process.exit(1)
    }

    const seasons = (
        await c.query(
            `select s.code, d.name div from drafts dr
             join teams t on t.id = dr.team join seasons s on s.id = t.season
             join divisions d on d.id = t.division
             where dr."user" = $1 order by s.id`,
            [REAL_ACCOUNT]
        )
    ).rows
    console.log(
        `\nPhyllis Renehan now has ${seasons.length} seasons: ${seasons.map((r) => `${r.code}/${r.div}`).join(" ")}`
    )

    await c.end()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
