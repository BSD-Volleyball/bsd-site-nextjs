#!/usr/bin/env tsx
// Restores the real draft order for Spring 2023's AB division.
//
// WHAT WAS WRONG
// The 2026-07-27 production dump -- the live legacy app's own record -- holds
// only 6 of AB's 8 teams, numbered as a SIX-team snake running 101..148 with no
// gaps. That numbering is provably 6 wide: team 6 takes 106 in round 1 and 107
// in round 2, leaving no room for teams 7 and 8 to have ever picked. The
// archived roster page (scripts/data/local/S23/rosterab.html) lists all eight
// teams, so the division really fielded 8 and the legacy app simply never
// captured two of them.
//
// fill-missing-teams.ts later added teams 7 and 8 from that archive page. The
// archive lists players alphabetically and records no order, so all 16 rows got
// the synthetic placeholder position -- round 4, overall 125, identical for
// every player (see src/lib/wayback/historical-pick.ts).
//
// THE NEW SOURCE
// A copy of the actual draft board, one column per team and one ROW PER ROUND.
// Its row order is not assumed: rounds 1-8 of the CSV reproduce the dump's
// rounds 1-8 for all 48 rows of teams 1-6 exactly, which is what licenses using
// it to assign rounds to teams 7 and 8.
//
// WHAT THIS CHANGES
// Every one of the 64 rows is renumbered as a proper 8-team snake. Rounds are
// unchanged for teams 1-6 (the CSV agrees with the dump); only `overall`
// shifts, because a 6-wide sequence cannot accommodate 8 teams. Teams 7 and 8
// get both a real round and a real overall for the first time.
//
//     overall = (level - 1) * 50 + (round - 1) * teams + position
//     position = teamNumber           in odd  rounds
//              = teams + 1 - teamNo   in even rounds  (the snake turn)
//
// Mirrors submitDraft in src/app/dashboard/draft-division/actions.ts.
//
// EXPECTED BAND OVERFLOW
// 8 teams x 8 rounds = 64 picks, but each division's band in the `overall`
// number line is only 50 wide, so rounds 7-8 land at 149..164 and spill past
// AB's 101-150 into the next band. That is the same overflow a long draft
// already produces elsewhere (F12/BBB runs 7 x 8) and is preferred over
// compressing picks, which would break the shared formula above.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/fix-s23-ab-draft-order.ts
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/fix-s23-ab-draft-order.ts --apply
//
// Read-only unless --apply. Idempotent: re-running once repaired is a no-op.

import "dotenv/config"
import { Client } from "pg"

const SEASON_CODE = "S23"
const DIVISION_NAME = "AB"
const BAND = 50

/** Captains, in team-number order, as a cross-check against `teams.captain`. */
const CAPTAINS = [
    "Kawamura",
    "Rothman",
    "Seber",
    "Harris",
    "Yao",
    "Gomez",
    "Zakalik",
    "Pessagno"
]

/** The draft board: ROUNDS[round - 1][teamNumber - 1]. */
const ROUNDS = [
    [
        "Michael Smith",
        "Daniel Rodrigues",
        "Kenny Muller",
        "Isabel Osorio",
        "JJ Jimenez",
        "Mark Beker",
        "Dominic Escobar",
        "Gustavo Rojas-Matute"
    ],
    [
        "Ken Yuen",
        "Lester Simeon",
        "Erich Seber",
        "Erick Summers",
        "Andrew Dehennis",
        "John Gomez",
        "Ketan Patil",
        "Frank Willard"
    ],
    [
        "Dao Smith",
        "Jeja Simeon",
        "Hannah Hafey",
        "John Eric Umali",
        "Eryn Lee",
        "William Chen",
        "Erika Frua",
        "Stephanie Finkenstaedt"
    ],
    [
        "Dale Kawamura",
        "Ruxandra Pana",
        "Jay Mazjanis",
        "Jim Harris",
        "Jeff Jimenez",
        "Shoshana Scott",
        "Michael Coakley",
        "Pamela Bowes"
    ],
    [
        "Shira Rosenthal",
        "Phil Michel",
        "Zoya Shoukat",
        "Jeffy John",
        "Sammy Wong",
        "Margarita Gomez",
        "Randy Zakalik",
        "Timothy Sievers"
    ],
    [
        "Joel Davie",
        "Beatrice Collazo",
        "Fred Robinson",
        "Becky Dutko",
        "Mariah Lukens",
        "Shiva Kubendrachari",
        "Kimia Hajikarimloo",
        "Sandeep Godavarthi"
    ],
    [
        "Greg Ford",
        "Vinoth Jagannathan",
        "Sudhir Nair",
        "Kevin Oneal",
        "Anderson Yao",
        "Giovanni Escobar",
        "Keith Chapman",
        "JoAnn Pessagno"
    ],
    [
        "Javee Medina",
        "Mark Rothman",
        "Karen Mader",
        "Dana Monsees",
        "Renita Carter",
        "Nessa Rillorta",
        "Karin Tucker",
        "Steve Zerphy"
    ]
]

/**
 * Board name -> the account's name in the database, for the players whose two
 * spellings share no matchable token. Everything else resolves on the account's
 * legal name, its preferred name, or a last name that is unique within the
 * team, so only genuine identity changes belong here.
 */
const ALIASES: Record<string, string> = {
    // Married name; same account, zshoukat91@gmail.com.
    "Zoya Shoukat": "Zoya Belkat"
}

const apply = process.argv.includes("--apply")
const norm = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "")
const lastOf = (s: string) => norm(s.trim().split(/\s+/).slice(-1)[0])

interface Row {
    id: number
    user: string
    teamNumber: number
    round: number
    overall: number
    first: string
    last: string
    preferred: string | null
}

/** Snake position: forward on odd rounds, reversed on even ones. */
function pickPosition(teamNumber: number, round: number, teams: number) {
    return round % 2 === 1 ? teamNumber : teams + 1 - teamNumber
}

/**
 * Match one team's eight board names to its eight database rows. Every pass is
 * required to be unambiguous, and a name that survives all of them is a hard
 * error -- guessing here would silently attribute a pick to the wrong player.
 */
function resolveTeam(teamNumber: number, names: string[], rows: Row[]) {
    const pool = [...rows]
    const out = new Map<string, Row>()

    const take = (name: string, predicate: (r: Row) => boolean) => {
        const hits = pool.filter(predicate)
        if (hits.length !== 1) return false
        out.set(name, hits[0])
        pool.splice(pool.indexOf(hits[0]), 1)
        return true
    }

    for (const pass of [
        // Legal name as printed on the board.
        (name: string) => (r: Row) =>
            norm(`${r.first} ${r.last}`) === norm(name),
        // The board often used the nickname the player goes by.
        (name: string) => (r: Row) =>
            !!r.preferred && norm(`${r.preferred} ${r.last}`) === norm(name),
        // Explicit identity changes.
        (name: string) => (r: Row) =>
            !!ALIASES[name] &&
            norm(`${r.first} ${r.last}`) === norm(ALIASES[name]),
        // Surname alone, but only where it is unique among who is left.
        (name: string) => (r: Row) => lastOf(name) === norm(r.last)
    ]) {
        for (const name of names) {
            if (out.has(name)) continue
            take(name, pass(name))
        }
    }

    const unresolved = names.filter((n) => !out.has(n))
    if (unresolved.length > 0) {
        throw new Error(
            `team ${teamNumber}: could not match ${unresolved.join(", ")} ` +
                `(left over in db: ${pool.map((r) => `${r.first} ${r.last}`).join(", ")})`
        )
    }
    return out
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

    const { rows: slice } = await c.query(
        `select s.id season, d.id division, d.level
         from seasons s cross join divisions d
         where s.code = $1 and d.name = $2`,
        [SEASON_CODE, DIVISION_NAME]
    )
    if (slice.length !== 1)
        throw new Error(`${SEASON_CODE}/${DIVISION_NAME} not found`)
    const { season, division, level } = slice[0]

    const { rows: teamRows } = await c.query(
        `select t.id, t.number, u.last_name captain_last
         from teams t left join users u on u.id = t.captain
         where t.season = $1 and t.division = $2 order by t.number`,
        [season, division]
    )
    const teamCount = teamRows.length

    // Guards. The board describes one specific division; if the shape it
    // assumes no longer holds, the pick numbers it implies are meaningless.
    if (teamCount !== ROUNDS[0].length)
        throw new Error(
            `board has ${ROUNDS[0].length} teams, db has ${teamCount}`
        )
    teamRows.forEach((t, i) => {
        if (t.number !== i + 1)
            throw new Error(`team numbers are not 1..${teamCount}`)
        if (norm(t.captain_last) !== norm(CAPTAINS[i]))
            throw new Error(
                `team ${t.number} captain is ${t.captain_last}, board says ${CAPTAINS[i]}`
            )
    })

    const { rows: draftRows } = await c.query(
        `select dr.id, dr."user", t.number "teamNumber", dr.round, dr.overall,
                u.first_name first, u.last_name last, u.preferred_name preferred
         from drafts dr
         join teams t on t.id = dr.team
         join users u on u.id = dr."user"
         where t.season = $1 and t.division = $2`,
        [season, division]
    )
    if (draftRows.length !== teamCount * ROUNDS.length)
        throw new Error(
            `expected ${teamCount * ROUNDS.length} draft rows, found ${draftRows.length}`
        )

    const byTeam = new Map<number, Row[]>()
    for (const r of draftRows as Row[]) {
        if (!byTeam.has(r.teamNumber)) byTeam.set(r.teamNumber, [])
        byTeam.get(r.teamNumber)?.push(r)
    }

    // Resolve first, write second: a name that cannot be matched must abort the
    // whole run, not leave the division half-renumbered.
    const updates: {
        row: Row
        round: number
        overall: number
        name: string
    }[] = []

    for (let t = 1; t <= teamCount; t++) {
        const names = ROUNDS.map((r) => r[t - 1])
        const rows = byTeam.get(t) ?? []
        if (rows.length !== ROUNDS.length)
            throw new Error(
                `team ${t} has ${rows.length} rows, expected ${ROUNDS.length}`
            )

        const matched = resolveTeam(t, names, rows)
        names.forEach((name, idx) => {
            const round = idx + 1
            const row = matched.get(name) as Row
            updates.push({
                row,
                round,
                overall:
                    (level - 1) * BAND +
                    (round - 1) * teamCount +
                    pickPosition(t, round, teamCount),
                name
            })
        })
    }

    // Every row accounted for exactly once, and no pick number used twice.
    const touched = new Set(updates.map((u) => u.row.id))
    if (touched.size !== draftRows.length)
        throw new Error(
            `resolved ${touched.size} distinct rows of ${draftRows.length}`
        )
    const picks = new Set(updates.map((u) => u.overall))
    if (picks.size !== updates.length)
        throw new Error("duplicate overall values computed")

    const changed = updates.filter(
        (u) => u.row.round !== u.round || u.row.overall !== u.overall
    )
    console.log(
        `${SEASON_CODE}/${DIVISION_NAME}: ${teamCount} teams, ${ROUNDS.length} rounds, ` +
            `${draftRows.length} rows; ${changed.length} need changes\n`
    )
    for (const u of changed) {
        const roundNote =
            u.row.round === u.round
                ? `r${u.round}`
                : `r${u.row.round}->r${u.round}`
        console.log(
            `  T${u.row.teamNumber} ${roundNote}  ` +
                `o${u.row.overall}->o${u.overall}  ${u.name}`
        )
    }

    if (!apply) {
        console.log("\nDry run. Re-run with --apply to write.")
        await c.end()
        return
    }

    await c.query("begin")
    try {
        for (const u of changed) {
            await c.query(
                `update drafts set round = $1, overall = $2 where id = $3`,
                [u.round, u.overall, u.row.id]
            )
        }
        await c.query("commit")
        console.log(`\nApplied ${changed.length} updates.`)
    } catch (e) {
        await c.query("rollback")
        throw e
    }

    await c.end()
}

main().catch((e) => {
    console.error(e.message ?? e)
    process.exit(1)
})
