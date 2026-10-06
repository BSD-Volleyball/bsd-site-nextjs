#!/usr/bin/env tsx
// Links pre-2012 roster history to the real member accounts it belongs to.
//
// The archive backfill could only auto-bind a player to an existing account on
// an exact first+last name match, so anyone recorded under a short form -- Bill
// for William, Bob for Robert -- got a fresh `legacy-roster-*` account instead
// and their history never reached their profile.
//
// Three kinds of link, all gated on the surname being unique among real
// accounts so there is never a choice between candidates:
//
//   nickname          Bill/William, Bob/Robert, Mike/Michael
//   prefix            Jon/Jonathan, Rosemar/Rosemary, Dan/Danh
//   duplicate-account two people hold two accounts each; the pre-2012 rows go
//                     to whichever already holds their 2012-2024 history, so
//                     this is settled by evidence rather than by preference
//
// Deliberately NOT linked: 722 legacy accounts whose players have no current
// account at all. Those are people who left the league between 2000 and 2011
// and their records are correct as they stand.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/link-legacy-players.ts
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/link-legacy-players.ts --apply
//
// Read-only unless --apply. Idempotent: once linked the legacy accounts are
// gone, so a second run finds nothing to do.

import "dotenv/config"
import fs from "node:fs"
import path from "node:path"
import { Client } from "pg"
// The nickname table and the name comparison live in src/lib so the admin UI
// at /dashboard/historical-backfill proposes exactly what this script would.
import { norm, reasonFor } from "@/lib/legacy-matching"

// Pins the run to the set that was reviewed and approved. If the data has
// shifted enough to change these totals, stop and re-review rather than
// silently applying a different set of links.
const EXPECTED_ACCOUNTS = 40
const EXPECTED_ROWS = 118

// Two members hold duplicate accounts. The pre-2012 rows go to whichever
// already holds their 2012-2024 history; the other is empty.
const DUPLICATE_TARGET: Record<string, string> = {
    "isabel|llerena": "SWsg24LVnCsNaY7pAMjeya4pHR6Uj8dc",
    "mae ling|chen": "4eVBhrjEC6GQbwPeb3yNRX2rYHCKkDqQ"
}

interface Link {
    tier: string
    legacyId: string
    legacyName: string
    realId: string
    realName: string
    email: string
    rows: number
}

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

    const legacy = (
        await c.query(
            `select u.id, u.first_name, u.last_name,
                    (select count(*)::int from drafts d where d."user" = u.id) rows
             from users u where u.email like 'legacy-roster-%'`
        )
    ).rows as {
        id: string
        first_name: string
        last_name: string
        rows: number
    }[]

    const real = (
        await c.query(
            `select id, first_name, last_name, email from users
             where email not like 'legacy-roster-%' and email not like 'legacy-hoc-%'`
        )
    ).rows as {
        id: string
        first_name: string
        last_name: string
        email: string
    }[]

    const byLast = new Map<string, typeof real>()
    for (const r of real) {
        const k = norm(r.last_name)
        byLast.set(k, [...(byLast.get(k) ?? []), r])
    }

    const links: Link[] = []
    for (const l of legacy) {
        const key = `${norm(l.first_name)}|${norm(l.last_name)}`
        const dup = DUPLICATE_TARGET[key]
        if (dup) {
            const r = real.find((x) => x.id === dup)
            if (r) {
                links.push({
                    tier: "duplicate-account",
                    legacyId: l.id,
                    legacyName: `${l.first_name} ${l.last_name}`,
                    realId: r.id,
                    realName: `${r.first_name} ${r.last_name}`,
                    email: r.email,
                    rows: l.rows
                })
            }
            continue
        }

        const candidates = (byLast.get(norm(l.last_name)) ?? [])
            .map((r) => ({
                r,
                reason: reasonFor(norm(l.first_name), norm(r.first_name))
            }))
            .filter((x) => x.reason !== null)
        // Only ever link when there is exactly one possible person.
        if (candidates.length !== 1) {
            continue
        }

        links.push({
            tier: candidates[0].reason as string,
            legacyId: l.id,
            legacyName: `${l.first_name} ${l.last_name}`,
            realId: candidates[0].r.id,
            realName: `${candidates[0].r.first_name} ${candidates[0].r.last_name}`,
            email: candidates[0].r.email,
            rows: l.rows
        })
    }

    const totalRows = links.reduce((a, l) => a + l.rows, 0)
    console.log(`links: ${links.length} accounts, ${totalRows} draft rows`)
    const byTier = new Map<string, number>()
    for (const l of links) {
        byTier.set(l.tier, (byTier.get(l.tier) ?? 0) + 1)
    }
    console.log(
        `  ${[...byTier.entries()].map(([k, v]) => `${k}=${v}`).join("  ")}`
    )

    if (links.length === 0) {
        console.log("\nNothing to link -- already done.")
        await c.end()
        return
    }

    if (links.length !== EXPECTED_ACCOUNTS || totalRows !== EXPECTED_ROWS) {
        console.error(
            `\nREFUSING: expected ${EXPECTED_ACCOUNTS} accounts / ${EXPECTED_ROWS} rows, ` +
                `computed ${links.length} / ${totalRows}. Re-review before applying.`
        )
        process.exit(1)
    }

    // Nobody appears on the same team twice, so a legacy account sharing a team
    // with its proposed target means they are two different people who happened
    // to play together -- not one person recorded twice.
    //
    // This is not hypothetical: Fall 2009 B "Team Jimenez" lists Jimmy, James
    // AND Jeff Jimenez on one roster. Linking Jimmy to James would have merged
    // two brothers into one player. Any such link is dropped automatically.
    const blocked = new Set<string>()
    for (const l of links) {
        const clash = (
            await c.query(
                `select count(*)::int n from drafts a
                 join drafts b on b.team = a.team and b."user" = $2
                 where a."user" = $1`,
                [l.legacyId, l.realId]
            )
        ).rows[0].n as number
        if (clash > 0) {
            blocked.add(l.legacyId)
            console.log(
                `  BLOCKED ${l.legacyName} -> ${l.realName}: they share ${clash} team(s), ` +
                    "so they are different people"
            )
        }
    }

    const applicable = links.filter((l) => !blocked.has(l.legacyId))
    const applicableRows = applicable.reduce((a, l) => a + l.rows, 0)
    console.log(
        `\nafter conflict checks: ${applicable.length} accounts, ${applicableRows} draft rows`
    )

    if (!apply) {
        console.log("\nDRY RUN -- nothing written. Re-run with --apply.")
        await c.end()
        return
    }

    await c.query("BEGIN")
    try {
        let moved = 0
        let removed = 0
        for (const l of applicable) {
            const r = await c.query(
                `update drafts set "user" = $2 where "user" = $1`,
                [l.legacyId, l.realId]
            )
            moved += r.rowCount ?? 0
            const d = await c.query(
                `delete from users u where u.id = $1
                   and not exists (select 1 from drafts x where x."user" = u.id)
                   and not exists (select 1 from teams t where t.captain = u.id)`,
                [l.legacyId]
            )
            removed += d.rowCount ?? 0
        }
        console.log(`\n  moved ${moved} draft rows`)
        console.log(`  removed ${removed} now-empty legacy accounts`)
        await c.query("COMMIT")
        console.log("COMMITTED")
    } catch (error) {
        await c.query("ROLLBACK")
        console.error("\nROLLED BACK:", (error as Error).message)
        process.exit(1)
    }

    const report = path.join(
        process.cwd(),
        "scripts",
        "data",
        "legacy-links.json"
    )
    fs.writeFileSync(report, `${JSON.stringify(applicable, null, 1)}\n`)
    console.log(
        `\nwrote ${path.relative(process.cwd(), report)} (reversal map)`
    )

    console.log("\nverification:")
    for (const l of applicable.slice(0, 5)) {
        const n = (
            await c.query(
                `select count(*)::int n from drafts d join teams t on t.id = d.team
                 join seasons s on s.id = t.season
                 where d."user" = $1 and s.year < 2012`,
                [l.realId]
            )
        ).rows[0].n
        console.log(`  ${l.realName.padEnd(24)} now has ${n} pre-2012 rows`)
    }
    console.log(
        `  legacy accounts remaining: ${
            (
                await c.query(
                    `select count(*)::int n from users where email like 'legacy-roster-%'`
                )
            ).rows[0].n
        }`
    )

    await c.end()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
