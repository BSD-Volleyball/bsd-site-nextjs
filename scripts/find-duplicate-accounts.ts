#!/usr/bin/env tsx
// Lists members holding more than one account, with enough activity on each to
// judge which should survive a merge.
//
// This is a pre-existing data issue, not something the archive backfill caused
// -- but it blocks the backfill's player linking, which will only attach
// history when exactly one candidate account exists. Bernard Groeneveld has two
// accounts, so his Spring 2012 season sits on a fabricated legacy account
// instead of on him.
//
// Read-only. It proposes nothing: two accounts sharing a name can be two
// people, so two disproofs are included.
//
//   - Same team: nobody appears on one roster twice, so a shared team is proof
//     of two different people.
//   - Same season: a player is on one team per season, so two accounts with
//     rosters in the same season are two people even though no team is shared.
//     This is the weaker signal and it is the one that matters -- it is what
//     separates the two Christina Nguyens, who played S18/BB on Team Quintana
//     and Team Seyed-Ali respectively and would otherwise have read as a clean
//     merge.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/find-duplicate-accounts.ts

import "dotenv/config"
import { Client } from "pg"

interface Account {
    id: string
    email: string
    created: string
    drafts: number
    seasons: string[]
    signups: number
    captaincies: number
    roles: number
    lastYear: number | null
}

async function main() {
    const c = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    })
    await c.connect()

    const groups = (
        await c.query(
            `select lower(first_name) f, lower(last_name) l, count(*)::int n
             from users
             where email not like 'legacy-roster-%' and email not like 'legacy-hoc-%'
             group by 1, 2 having count(*) > 1
             order by 2, 1`
        )
    ).rows as { f: string; l: string; n: number }[]

    console.log(`members holding more than one account: ${groups.length}\n`)

    for (const g of groups) {
        const rows = (
            await c.query(
                `select id, first_name, last_name, email, created_at::text created
                 from users
                 where lower(first_name) = $1 and lower(last_name) = $2
                   and email not like 'legacy-roster-%' and email not like 'legacy-hoc-%'
                 order by created_at`,
                [g.f, g.l]
            )
        ).rows

        const accounts: Account[] = []
        for (const r of rows) {
            const seasons = (
                await c.query(
                    `select s.code, s.year from drafts d
                     join teams t on t.id = d.team join seasons s on s.id = t.season
                     where d."user" = $1 order by s.id`,
                    [r.id]
                )
            ).rows as { code: string; year: number }[]
            accounts.push({
                id: r.id,
                email: r.email,
                created: r.created,
                drafts: seasons.length,
                seasons: seasons.map((s) => s.code),
                lastYear:
                    seasons.length > 0
                        ? Math.max(...seasons.map((s) => s.year))
                        : null,
                signups: (
                    await c.query(
                        "select count(*)::int n from signups where player = $1",
                        [r.id]
                    )
                ).rows[0].n,
                captaincies: (
                    await c.query(
                        "select count(*)::int n from teams where captain = $1",
                        [r.id]
                    )
                ).rows[0].n,
                roles: (
                    await c.query(
                        "select count(*)::int n from user_roles where user_id = $1",
                        [r.id]
                    )
                ).rows[0].n
            })
        }

        // Two accounts on the same roster -- or merely in the same season --
        // means two people, not one.
        let clash = 0
        const sharedSeasons: string[] = []
        for (let i = 0; i < accounts.length; i++) {
            for (let j = i + 1; j < accounts.length; j++) {
                clash += (
                    await c.query(
                        `select count(*)::int n from drafts a join drafts b on b.team = a.team
                         where a."user" = $1 and b."user" = $2`,
                        [accounts[i].id, accounts[j].id]
                    )
                ).rows[0].n as number
                sharedSeasons.push(
                    ...accounts[i].seasons.filter((s) =>
                        accounts[j].seasons.includes(s)
                    )
                )
            }
        }

        const name = `${rows[0].first_name} ${rows[0].last_name}`
        const verdict =
            clash > 0
                ? "DIFFERENT PEOPLE -- share a roster"
                : sharedSeasons.length > 0
                  ? `DIFFERENT PEOPLE -- both played ${[...new Set(sharedSeasons)].join(",")}`
                  : accounts.filter(
                          (a) => a.drafts + a.signups + a.captaincies > 0
                      ).length <= 1
                    ? "safe: only one account has any activity"
                    : "both accounts have activity -- needs a decision"

        console.log(`${name}  [${verdict}]`)
        for (const a of accounts) {
            const placeholder = /@yy\.com$/.test(a.email)
                ? "  (placeholder address)"
                : ""
            console.log(
                `   ${a.email.padEnd(34)} created ${a.created.slice(0, 10)}  ` +
                    `seasons=${String(a.drafts).padStart(2)}  signups=${a.signups}  captain=${a.captaincies}  roles=${a.roles}${placeholder}`
            )
            if (a.seasons.length > 0) {
                console.log(
                    `      ${a.seasons.slice(0, 14).join(",")}${a.seasons.length > 14 ? ",…" : ""}`
                )
            }
        }
        console.log()
    }

    await c.end()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
