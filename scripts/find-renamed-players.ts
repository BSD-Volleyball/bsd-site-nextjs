#!/usr/bin/env tsx
// Suggests legacy accounts that may be a current member under a former name.
//
// The legacy-player linking matches on SURNAME, so it cannot see a name change
// -- Phyllis Zaia and Phyllis Renehan share nothing but a first name, and six
// seasons of her history sat on a fabricated account until the league pointed
// it out.
//
// The signature of that case, and what this looks for:
//   - same first name, different surname
//   - the two accounts' seasons never overlap
//   - and they are ADJACENT: one ends where the other begins, which is what a
//     name change looks like and a coincidence usually does not
//
// This only proposes. Two different people can share a first name and happen to
// play in different years, so every hit needs a human who knows the league.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/find-renamed-players.ts

import "dotenv/config"
import { db } from "../src/database/db"
import { drafts, seasons, teams, users } from "../src/database/schema"
import { eq } from "drizzle-orm"

const norm = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "")

async function main() {
    const rows = await db
        .select({
            id: users.id,
            first: users.first_name,
            last: users.last_name,
            email: users.email,
            season: seasons.id,
            code: seasons.code,
            year: seasons.year
        })
        .from(drafts)
        .innerJoin(teams, eq(teams.id, drafts.team))
        .innerJoin(seasons, eq(seasons.id, teams.season))
        .innerJoin(users, eq(users.id, drafts.user))

    interface Person {
        id: string
        first: string
        last: string
        email: string
        legacy: boolean
        seasons: Set<number>
        codes: string[]
    }
    const people = new Map<string, Person>()
    for (const r of rows) {
        let p = people.get(r.id)
        if (!p) {
            p = {
                id: r.id,
                first: r.first,
                last: r.last,
                email: r.email,
                legacy: r.email.startsWith("legacy-roster-"),
                seasons: new Set(),
                codes: []
            }
            people.set(r.id, p)
        }
        if (!p.seasons.has(r.season)) {
            p.seasons.add(r.season)
            p.codes.push(r.code)
        }
    }

    const all = [...people.values()]
    const legacy = all.filter((p) => p.legacy)
    const real = all.filter((p) => !p.legacy)

    const suggestions: string[] = []
    for (const l of legacy) {
        for (const r of real) {
            if (
                norm(l.first) !== norm(r.first) ||
                norm(l.last) === norm(r.last)
            ) {
                continue
            }
            // Seasons must not overlap.
            const overlap = [...l.seasons].some((s) => r.seasons.has(s))
            if (overlap) {
                continue
            }
            const lMax = Math.max(...l.seasons)
            const lMin = Math.min(...l.seasons)
            const rMax = Math.max(...r.seasons)
            const rMin = Math.min(...r.seasons)
            // Adjacent: one run ends immediately where the other begins.
            const gap = lMax < rMin ? rMin - lMax : lMin - rMax
            if (gap < 0 || gap > 2) {
                continue
            }
            suggestions.push(
                `  ${`${l.first} ${l.last}`.padEnd(24)} [${l.codes.join(",")}]\n` +
                    `    -> ${`${r.first} ${r.last}`.padEnd(22)} <${r.email}> [${r.codes.join(",")}]  gap=${gap}`
            )
        }
    }

    console.log(
        `legacy accounts: ${legacy.length}, real accounts with history: ${real.length}`
    )
    console.log(
        `\npossible former names (${suggestions.length}) -- each needs confirming:`
    )
    for (const s of suggestions) {
        console.log(s)
    }
    if (suggestions.length === 0) {
        console.log("  (none)")
    }
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
