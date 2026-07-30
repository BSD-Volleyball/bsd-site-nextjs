#!/usr/bin/env tsx
// Replays one season signup that a point-in-time restore will roll back.
//
// Context: the historical-results backfill on 2026-07-30 destroyed roster data
// and has to be undone with a PITR to 2026-07-30 16:04:00 UTC. One paid signup
// landed after that point -- Jasmine McNair, F26, $90.00 -- and the restore
// will erase it. Her Square payment already went through, so the money is
// collected; only the database rows disappear. This script puts them back
// exactly as they were, so she is not charged again and does not have to
// re-enter anything.
//
// Three tables are involved. Restoring only `signups` would leave her
// unavailability selections missing and the payment absent from the audit
// trail:
//   signups              1 row  (the signup itself, id 466)
//   user_unavailability  3 rows (dates she marked unavailable, FK -> signups)
//   audit_log            1 row  (the "Paid season signup" entry)
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/restore-jasmine-signup.ts
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/restore-jasmine-signup.ts --apply
//
// Runs read-only unless --apply is passed. Safe to run twice: it checks for an
// existing signup first and does nothing if one is already there.

import "dotenv/config"
import { Client } from "pg"

// Captured from production at 2026-07-30 16:45 UTC, before the restore.
// Timestamps are the literal stored values (the columns are `timestamp without
// time zone`, so they are written back as text and cast in SQL -- letting a
// driver parse them risks a timezone shift).
const SIGNUP = {
    id: 466,
    season: 69, // F26
    player: "CWhFtewNmNgtYRSRF7JRmfMPbuPwPqey", // Jasmine McNair
    age: "20+",
    captain: "only_if_needed",
    pair: true,
    pair_pick: "sgAnVTB45dVBkdzwf2w4VmuWbfZcVEv6",
    pair_reason: "Sibling- Also Persha Gregg ",
    order_id: "z7j5Q6WRuH773M78nHd7C5TxuVbZY",
    amount_paid: "90.00",
    created_at: "2026-07-30 16:12:53.228"
}

const UNAVAILABILITY = [
    { id: 528, event_id: 89, at: "2026-07-30 16:12:53.218" },
    { id: 529, event_id: 88, at: "2026-07-30 16:12:53.218" },
    { id: 530, event_id: 94, at: "2026-07-30 16:12:53.218" }
]

const AUDIT = {
    user: SIGNUP.player,
    action: "create",
    entity_type: "signups",
    entity_id: null as string | null,
    summary: "Paid season signup ($90.00) for fall 2026",
    created_at: "2026-07-30 16:12:53.244"
}

const apply = process.argv.includes("--apply")

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
})

function log(message: string) {
    console.log(message)
}

async function preflight(): Promise<string[]> {
    const problems: string[] = []

    const user = await client.query(
        "select first_name, last_name, email from users where id = $1",
        [SIGNUP.player]
    )
    if (user.rowCount === 0) {
        problems.push(`player ${SIGNUP.player} does not exist`)
    } else {
        const u = user.rows[0]
        log(`  player      ${u.first_name} ${u.last_name} <${u.email}>`)
    }

    const season = await client.query(
        "select code, year, season from seasons where id = $1",
        [SIGNUP.season]
    )
    if (season.rowCount === 0) {
        problems.push(`season ${SIGNUP.season} does not exist`)
    } else {
        log(
            `  season      ${season.rows[0].code} (${season.rows[0].season} ${season.rows[0].year})`
        )
    }

    // pair_pick is a FK; if that account is missing the insert would fail.
    const pairPick = await client.query(
        "select first_name, last_name from users where id = $1",
        [SIGNUP.pair_pick]
    )
    if (pairPick.rowCount === 0) {
        problems.push(`pair_pick user ${SIGNUP.pair_pick} does not exist`)
    } else {
        log(
            `  pair pick   ${pairPick.rows[0].first_name} ${pairPick.rows[0].last_name}`
        )
    }

    const events = await client.query(
        "select id from season_events where id = any($1)",
        [UNAVAILABILITY.map((u) => u.event_id)]
    )
    const foundEvents = new Set(events.rows.map((r) => r.id))
    const missingEvents = UNAVAILABILITY.filter(
        (u) => !foundEvents.has(u.event_id)
    )
    if (missingEvents.length > 0) {
        problems.push(
            `season_events missing: ${missingEvents.map((u) => u.event_id).join(", ")}`
        )
    } else {
        log(
            `  events      ${UNAVAILABILITY.map((u) => u.event_id).join(", ")} all present`
        )
    }

    return problems
}

async function main() {
    await client.connect()

    log(`mode: ${apply ? "APPLY (will write)" : "DRY RUN (read-only)"}\n`)
    log("preflight:")
    const problems = await preflight()

    if (problems.length > 0) {
        log("\nPREFLIGHT FAILED -- refusing to run:")
        for (const p of problems) {
            log(`  - ${p}`)
        }
        process.exit(1)
    }

    // Idempotency: the unique index is on (season, player), so an existing
    // signup means this has already been replayed (or she signed up again).
    const existing = await client.query(
        "select id, order_id, created_at::text from signups where season = $1 and player = $2",
        [SIGNUP.season, SIGNUP.player]
    )
    if (existing.rowCount && existing.rowCount > 0) {
        const row = existing.rows[0]
        log(
            `\nAlready present: signups id=${row.id} order=${row.order_id} created=${row.created_at}`
        )
        log("Nothing to do.")
        await client.end()
        return
    }

    // Preserve the original id when it is still free, so any external reference
    // to signup 466 stays valid. If something else has taken it since the
    // restore, fall back to the sequence.
    const taken = await client.query("select 1 from signups where id = $1", [
        SIGNUP.id
    ])
    const keepId = taken.rowCount === 0
    log(
        `\nsignups id: ${keepId ? `reusing original ${SIGNUP.id}` : `${SIGNUP.id} is taken -- will allocate a new one`}`
    )

    if (!apply) {
        log("\nWould insert:")
        log(
            `  signups              1 row  ($${SIGNUP.amount_paid}, order ${SIGNUP.order_id})`
        )
        log(
            `  user_unavailability  ${UNAVAILABILITY.length} rows (events ${UNAVAILABILITY.map((u) => u.event_id).join(", ")})`
        )
        log("  audit_log            1 row")
        log("\nRe-run with --apply to write.")
        await client.end()
        return
    }

    await client.query("BEGIN")
    try {
        const inserted = await client.query(
            `insert into signups
               (${keepId ? "id, " : ""}season, player, age, captain, pair, pair_pick,
                pair_reason, order_id, amount_paid, created_at)
             values (${keepId ? "$11, " : ""}$1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamp)
             returning id`,
            [
                SIGNUP.season,
                SIGNUP.player,
                SIGNUP.age,
                SIGNUP.captain,
                SIGNUP.pair,
                SIGNUP.pair_pick,
                SIGNUP.pair_reason,
                SIGNUP.order_id,
                SIGNUP.amount_paid,
                SIGNUP.created_at,
                ...(keepId ? [SIGNUP.id] : [])
            ]
        )
        const signupId = inserted.rows[0].id as number
        log(`  signups              inserted id=${signupId}`)

        let unavailabilityInserted = 0
        for (const row of UNAVAILABILITY) {
            // The unique index is (user_id, event_id); skip anything already there.
            const result = await client.query(
                `insert into user_unavailability (user_id, signup_id, event_id, created_at, updated_at)
                 values ($1, $2, $3, $4::timestamp, $4::timestamp)
                 on conflict (user_id, event_id) do nothing`,
                [SIGNUP.player, signupId, row.event_id, row.at]
            )
            unavailabilityInserted += result.rowCount ?? 0
        }
        log(
            `  user_unavailability  inserted ${unavailabilityInserted} of ${UNAVAILABILITY.length}`
        )

        await client.query(
            `insert into audit_log ("user", action, entity_type, entity_id, summary, created_at)
             values ($1, $2, $3, $4, $5, $6::timestamp)`,
            [
                AUDIT.user,
                AUDIT.action,
                AUDIT.entity_type,
                AUDIT.entity_id,
                AUDIT.summary,
                AUDIT.created_at
            ]
        )
        log("  audit_log            inserted 1 row")

        // An explicit id does not advance the sequence, so the next real signup
        // would collide. Realign it with the table.
        await client.query(
            `select setval(pg_get_serial_sequence('signups','id'),
                           (select max(id) from signups))`
        )
        await client.query(
            `select setval(pg_get_serial_sequence('user_unavailability','id'),
                           (select max(id) from user_unavailability))`
        )
        await client.query(
            `select setval(pg_get_serial_sequence('audit_log','id'),
                           (select max(id) from audit_log))`
        )
        log("  sequences            realigned")

        await client.query("COMMIT")
        log("\nCOMMITTED")
    } catch (error) {
        await client.query("ROLLBACK")
        console.error("\nROLLED BACK:", (error as Error).message)
        process.exit(1)
    }

    const check = await client.query(
        `select s.id, s.order_id, s.amount_paid, s.created_at::text,
                (select count(*) from user_unavailability u where u.signup_id = s.id) as unavailability
         from signups s where s.season = $1 and s.player = $2`,
        [SIGNUP.season, SIGNUP.player]
    )
    log("\nverification:")
    log(`  ${JSON.stringify(check.rows[0])}`)

    await client.end()
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
