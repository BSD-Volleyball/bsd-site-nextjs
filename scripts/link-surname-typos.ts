#!/usr/bin/env tsx
// Links legacy accounts to real members where the surname differs only by a
// typo.
//
// The legacy-player linking keys on surname and then compares first names, so a
// misspelled surname is invisible to it however obvious the match looks. These
// five were confirmed by the league.
//
// A broader sweep -- exact first name, surname within edit distance 2 -- finds
// 35 candidates, but it is NOT safe to apply wholesale: it also proposes "Jeff
// Synder -> Jeff Singer" (Synder is a typo of Snyder, not Singer), "Kevin Eng
// -> Kevin Zheng" and "Kevin Egan -> Kevin Zhan", which are different people.
// Hence an explicit list rather than a rule.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/link-surname-typos.ts
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/link-surname-typos.ts --apply

import "dotenv/config"
import { Client } from "pg"

const PAIRS = [
    { first: "Manan", legacy: "Thakker", real: "Thakkar" },
    { first: "Matt", legacy: "Dunlop", real: "Dunlap" },
    { first: "Raphael", legacy: "Barbou", real: "Barbau" },
    { first: "Danielle", legacy: "Thierrien", real: "Therrien" },
    { first: "Madelyn", legacy: "Beilinski", real: "Bielinski" }
]

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

    const moves: {
        legacyId: string
        realId: string
        label: string
        rows: number
    }[] = []
    const problems: string[] = []

    for (const pair of PAIRS) {
        const legacy = (
            await c.query(
                `select id, email, (select count(*)::int from drafts d where d."user" = users.id) rows
                 from users
                 where lower(first_name) = lower($1) and lower(last_name) = lower($2)
                   and email like 'legacy-roster-%'`,
                [pair.first, pair.legacy]
            )
        ).rows
        const real = (
            await c.query(
                `select id, email from users
                 where lower(first_name) = lower($1) and lower(last_name) = lower($2)
                   and email not like 'legacy-roster-%'`,
                [pair.first, pair.real]
            )
        ).rows

        if (legacy.length !== 1 || real.length !== 1) {
            problems.push(
                `${pair.first} ${pair.legacy} -> ${pair.real}: found ${legacy.length} legacy, ${real.length} real`
            )
            continue
        }

        // Same guard that stopped Jimmy Jimenez being merged into his brother:
        // nobody appears on one roster twice, so sharing a team proves they are
        // two people.
        const clash = (
            await c.query(
                `select count(*)::int n from drafts a join drafts b on b.team = a.team
                 where a."user" = $1 and b."user" = $2`,
                [legacy[0].id, real[0].id]
            )
        ).rows[0].n as number
        if (clash > 0) {
            problems.push(
                `${pair.first} ${pair.legacy} -> ${pair.real}: share ${clash} team(s), so they are different people`
            )
            continue
        }

        moves.push({
            legacyId: legacy[0].id,
            realId: real[0].id,
            label: `${pair.first} ${pair.legacy} -> ${pair.first} ${pair.real} <${real[0].email}>`,
            rows: legacy[0].rows
        })
        console.log(
            `  ${`${pair.first} ${pair.legacy}`.padEnd(24)} -> ${`${pair.first} ${pair.real}`.padEnd(22)} <${real[0].email}>  ${legacy[0].rows} season(s)`
        )
    }

    if (problems.length > 0) {
        console.log(`\nskipped (${problems.length}):`)
        for (const p of problems) {
            console.log(`  ${p}`)
        }
    }

    console.log(
        `\n${moves.length} accounts, ${moves.reduce((a, m) => a + m.rows, 0)} draft rows`
    )

    if (!apply) {
        console.log("\nDRY RUN -- nothing written. Re-run with --apply.")
        await c.end()
        return
    }

    await c.query("BEGIN")
    try {
        let drafts = 0
        let captaincies = 0
        let removed = 0
        for (const m of moves) {
            drafts += (
                await c.query(
                    'update drafts set "user" = $2 where "user" = $1',
                    [m.legacyId, m.realId]
                )
            ).rowCount as number
            captaincies += (
                await c.query(
                    "update teams set captain = $2 where captain = $1",
                    [m.legacyId, m.realId]
                )
            ).rowCount as number
            removed += (
                await c.query("delete from users where id = $1", [m.legacyId])
            ).rowCount as number
        }
        console.log(
            `\n  moved ${drafts} drafts and ${captaincies} captaincies, removed ${removed} legacy accounts`
        )
        await c.query("COMMIT")
        console.log("COMMITTED")
    } catch (error) {
        await c.query("ROLLBACK")
        console.error("\nROLLED BACK:", (error as Error).message)
        process.exit(1)
    }

    console.log("\nverification:")
    for (const pair of PAIRS) {
        const r = (
            await c.query(
                `select u.first_name, u.last_name,
                        (select count(*)::int from drafts d where d."user" = u.id) rows
                 from users u
                 where lower(u.first_name) = lower($1) and lower(u.last_name) = lower($2)`,
                [pair.first, pair.real]
            )
        ).rows[0]
        console.log(`  ${r.first_name} ${r.last_name}: ${r.rows} seasons`)
    }

    await c.end()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
