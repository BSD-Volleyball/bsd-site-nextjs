#!/usr/bin/env tsx
// Repairs the roster (drafts) data destroyed by the 2026-07-30 backfill, using
// the production dump taken on 2026-07-27.
//
// WHAT HAPPENED
// The backfill's roster importer clears a division's drafts before re-inserting
// them. Run with --replace-existing it also ran against 2012+ seasons, which
// already had real rosters, and where the archived roster page failed to parse
// it deleted without re-inserting. Where it did re-insert, it bound players to
// freshly-created legacy accounts instead of their real ones. Net effect across
// 31 seasons: rows missing outright, and rows present but attached to the wrong
// person.
//
// WHY A DUMP INSTEAD OF A PITR
// The damage is confined to historical rosters, which have not changed in
// years, so the 07-27 dump is as good as the live data for those rows. A PITR
// would additionally roll back three days of real activity -- signups,
// payments, evaluations -- for no benefit.
//
// APPROACH
// For each damaged season: delete every draft row, then re-insert the dump's
// rows verbatim. Whole-season replacement rather than a row-level merge,
// because the failure mode was "right count, wrong people" -- reconciling that
// row by row is far more error-prone than restoring the season wholesale.
//
// SEASONS DELIBERATELY NOT TOUCHED
// F24, S25, F25 and S26 are live. The importer never ran against them and their
// drafts are intact. They do differ from the dump by 1-2 rows each, but those
// are real roster changes made in the last three days and must be preserved.
//
// MERGED ACCOUNTS
// Three duplicate accounts were merged after the dump was taken, so the dump
// references user ids that no longer exist. Their rows are remapped to the
// surviving account (see MERGED_USERS) rather than skipped, which would
// silently drop 29 rows of one player's history each.
//
// Prepare the CSV first:
//   sudo -u postgres psql -d bsd_dump_20260727 -Ac \
//     "\copy (select id, team, \"user\", round, overall from drafts order by id) \
//      to stdout with (format csv, header)" > scripts/data/restore/dump-drafts.csv
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/restore-drafts-from-dump.ts
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/restore-drafts-from-dump.ts --apply
//
// Read-only unless --apply. Idempotent: re-running once repaired is a no-op.

import "dotenv/config"
import fs from "node:fs"
import path from "node:path"
import { Client } from "pg"

const CSV = path.join(
    process.cwd(),
    "scripts",
    "data",
    "restore",
    "dump-drafts.csv"
)

// Determined by comparing the (team, user) SET per season, not by counting.
// Several seasons have the right number of rows attached to the wrong people.
const DAMAGED_SEASONS = [
    "S12",
    "U12",
    "F12",
    "S13",
    "U13",
    "F13",
    "S14",
    "U14",
    "F14",
    "S15",
    "U15",
    "F15",
    "S16",
    "U16",
    "F16",
    "S17",
    "U17",
    "F17",
    "S18",
    "U18",
    "F18",
    "S19",
    "U19",
    "F19",
    "F21",
    "S22",
    "F22",
    "S23",
    "U23",
    "F23",
    "S24"
]

// Live seasons. The importer never touched them; their small differences from
// the dump are genuine recent edits.
const NEVER_TOUCH = new Set(["F24", "S25", "F25", "S26"])

// Duplicate accounts merged after the dump: dump id -> surviving prod id.
const MERGED_USERS: Record<string, { to: string; name: string }> = {
    UCu83qU9xqhsyHfCbMuVDjC3aLqM4dV7: {
        to: "TR92TQUVVlCr7PhMMjI5IgeQFuCKYEDb",
        name: "Yezdi Antia"
    },
    f4uUCpgsnW54fpw3GfGrXYFDGLT5nFwG: {
        to: "JVkdnlQFnIiL3c6oZOAowFVaiKxWwqjQ",
        name: "Claire Chen"
    },
    atc3TJb3FU2r9rbTP6rq3FAj47re5Vc7: {
        to: "OmEbNjI7SPb4EVskDRcOnapXZYN9zROC",
        name: "Alex Marks"
    }
}

interface Draft {
    id: number
    team: number
    user: string
    round: number
    overall: number
}

const apply = process.argv.includes("--apply")

function readDump(): Draft[] {
    if (!fs.existsSync(CSV)) {
        console.error(
            `Missing ${CSV} -- see the header of this file for how to export it.`
        )
        process.exit(1)
    }
    return fs
        .readFileSync(CSV, "utf-8")
        .trim()
        .split("\n")
        .slice(1)
        .map((line) => {
            const [id, team, user, round, overall] = line.split(",")
            return {
                id: Number(id),
                team: Number(team),
                user,
                round: Number(round),
                overall: Number(overall)
            }
        })
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

    const dump = readDump()
    console.log(`dump rows: ${dump.length}`)

    const seasonOfTeam = new Map<number, { code: string; seasonId: number }>(
        (
            await c.query(
                `select t.id, s.code, s.id as season_id from teams t join seasons s on s.id = t.season`
            )
        ).rows.map((r) => [r.id, { code: r.code, seasonId: r.season_id }])
    )

    const targets = new Set(DAMAGED_SEASONS)
    for (const code of targets) {
        if (NEVER_TOUCH.has(code)) {
            console.error(
                `REFUSING: ${code} is a live season and must not be restored.`
            )
            process.exit(1)
        }
    }

    // Rows to restore, remapping merged accounts.
    const wanted = dump
        .filter((r) => targets.has(seasonOfTeam.get(r.team)?.code ?? ""))
        .map((r) => ({ ...r, user: MERGED_USERS[r.user]?.to ?? r.user }))
    console.log(
        `rows to restore across ${targets.size} seasons: ${wanted.length}`
    )

    const remapped = dump.filter(
        (r) =>
            targets.has(seasonOfTeam.get(r.team)?.code ?? "") &&
            MERGED_USERS[r.user]
    )
    if (remapped.length > 0) {
        console.log(`  (${remapped.length} rows remapped to merged accounts)`)
    }

    // Referential preflight.
    const teamIds = [...new Set(wanted.map((r) => r.team))]
    const userIds = [...new Set(wanted.map((r) => r.user))]
    const haveTeams = new Set(
        (
            await c.query("select id from teams where id = any($1)", [teamIds])
        ).rows.map((r) => r.id)
    )
    const haveUsers = new Set(
        (
            await c.query("select id from users where id = any($1)", [userIds])
        ).rows.map((r) => r.id)
    )
    const badTeam = wanted.filter((r) => !haveTeams.has(r.team))
    const badUser = wanted.filter((r) => !haveUsers.has(r.user))
    if (badTeam.length > 0 || badUser.length > 0) {
        console.error(
            `\nPREFLIGHT FAILED: ${badTeam.length} rows reference a missing team, ` +
                `${badUser.length} reference a missing user.`
        )
        for (const r of [...badTeam, ...badUser].slice(0, 10)) {
            console.error(`  team=${r.team} user=${r.user}`)
        }
        process.exit(1)
    }
    console.log(
        `preflight ok: ${teamIds.length} teams and ${userIds.length} users all present`
    )

    const seasonIds = [
        ...new Set(
            [...targets]
                .map(
                    (code) =>
                        [...seasonOfTeam.values()].find((v) => v.code === code)
                            ?.seasonId
                )
                .filter((id): id is number => id !== undefined)
        )
    ]

    const currentCount = (
        await c.query(
            `select count(*)::int n from drafts d join teams t on t.id = d.team
             where t.season = any($1)`,
            [seasonIds]
        )
    ).rows[0].n as number
    console.log(
        `\ncurrent rows in those seasons: ${currentCount} -> will become ${wanted.length}`
    )

    if (!apply) {
        console.log("\nDRY RUN -- nothing written. Re-run with --apply.")
        await c.end()
        return
    }

    await c.query("BEGIN")
    try {
        const deleted = await c.query(
            `delete from drafts where team in (select id from teams where season = any($1))`,
            [seasonIds]
        )
        console.log(`  deleted ${deleted.rowCount} rows`)

        // Preserve the original ids so anything referencing a draft still lines
        // up. Nothing in the schema does today, but keeping them makes this
        // restore a faithful one rather than an approximation.
        let inserted = 0
        for (let i = 0; i < wanted.length; i += 500) {
            const batch = wanted.slice(i, i + 500)
            const values: unknown[] = []
            const tuples = batch.map((r, n) => {
                values.push(r.id, r.team, r.user, r.round, r.overall)
                const b = n * 5
                return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`
            })
            const result = await c.query(
                `insert into drafts (id, team, "user", round, overall)
                 values ${tuples.join(", ")}
                 on conflict (id) do nothing`,
                values
            )
            inserted += result.rowCount ?? 0
        }
        console.log(`  inserted ${inserted} rows`)

        // Legacy accounts my import invented for these seasons are now orphaned.
        const orphans = await c.query(
            `delete from users u where u.email like 'legacy-roster-%'
               and not exists (select 1 from drafts d where d."user" = u.id)
               and not exists (select 1 from teams t where t.captain = u.id)`
        )
        console.log(`  removed ${orphans.rowCount} orphaned legacy accounts`)

        // Explicit ids do not advance the sequence.
        await c.query(
            `select setval(pg_get_serial_sequence('drafts','id'), (select max(id) from drafts))`
        )
        console.log("  drafts sequence realigned")

        await c.query("COMMIT")
        console.log("\nCOMMITTED")
    } catch (error) {
        await c.query("ROLLBACK")
        console.error("\nROLLED BACK:", (error as Error).message)
        process.exit(1)
    }

    console.log("\nverification (dump vs prod, per season):")
    let mismatches = 0
    for (const code of [...targets].sort()) {
        const seasonId = [...seasonOfTeam.values()].find(
            (v) => v.code === code
        )?.seasonId
        const n = (
            await c.query(
                `select count(*)::int n from drafts d join teams t on t.id=d.team where t.season=$1`,
                [seasonId]
            )
        ).rows[0].n as number
        const expected = wanted.filter(
            (r) => seasonOfTeam.get(r.team)?.code === code
        ).length
        if (n !== expected) {
            mismatches++
            console.log(`  ${code}: ${n} != expected ${expected}  MISMATCH`)
        }
    }
    console.log(
        mismatches === 0
            ? "  all seasons match the dump"
            : `  ${mismatches} mismatched`
    )

    await c.end()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
