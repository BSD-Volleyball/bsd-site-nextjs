/**
 * One-off recovery for the 2026-08-05 availability wipe.
 *
 * A season-config save deleted and reinserted every Fall 2026 season_events
 * row; user_unavailability.event_id cascades, so all player availability for
 * the season went with it. Neon's 6-hour PITR window had closed by the time it
 * surfaced, so the only surviving copy is an admin CSV export taken 2026-08-03
 * ("Unavailable Dates" column).
 *
 * This restores from that CSV, matching players by email and dates by value.
 * Anyone who entered availability AFTER the wipe is left alone — their entry is
 * newer than the snapshot and therefore authoritative.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/restore-f26-availability.ts <csv>
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/restore-f26-availability.ts <csv> --apply
 *
 * Without --apply it only reports what it would do.
 */
import "dotenv/config"
import { readFileSync } from "node:fs"
import { Client } from "pg"

const SEASON_ID = 69
/** Only these types appear on the My Availability form. */
const SELECTABLE_TYPES = ["tryout", "regular_season", "playoff"]
/** "Thursday, September 24, 2026" — the format the CSV column uses. */
const DATE_PATTERN = /[A-Za-z]+day, [A-Z][a-z]+ \d{1,2}, \d{4}/g

/** Minimal RFC4180 reader: quoted fields, escaped quotes, embedded newlines. */
function parseCsv(text: string): Record<string, string>[] {
    const rows: string[][] = []
    let row: string[] = []
    let field = ""
    let quoted = false
    for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"'
                    i++
                } else {
                    quoted = false
                }
            } else {
                field += ch
            }
        } else if (ch === '"') {
            quoted = true
        } else if (ch === ",") {
            row.push(field)
            field = ""
        } else if (ch === "\n") {
            row.push(field)
            rows.push(row)
            row = []
            field = ""
        } else if (ch !== "\r") {
            field += ch
        }
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field)
        rows.push(row)
    }

    const [headers, ...body] = rows
    // Strip the UTF-8 BOM the browser download prepends.
    headers[0] = headers[0].replace(/^﻿/, "")
    return body
        .filter((r) => r.some((v) => v.trim() !== ""))
        .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])))
}

function toIsoDate(formatted: string): string {
    // "Thursday, September 24, 2026" parses unambiguously as local midnight.
    const d = new Date(formatted)
    const month = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${d.getFullYear()}-${month}-${day}`
}

async function main() {
    const csvPath = process.argv[2]
    const apply = process.argv.includes("--apply")
    if (!csvPath) {
        console.error("usage: restore-f26-availability.ts <csv> [--apply]")
        process.exit(1)
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    })
    await client.connect()

    // date -> event id, restricted to the dates a player can actually pick.
    // (2026-08-27 is both Tryout #3 and the AA Draft; only the tryout counts.)
    const events = await client.query(
        `select id, event_date::text as date, event_type
           from season_events
          where season_id = $1 and event_type = any($2)`,
        [SEASON_ID, SELECTABLE_TYPES]
    )
    const eventByDate = new Map<string, number>()
    for (const e of events.rows) {
        if (eventByDate.has(e.date)) {
            throw new Error(
                `Two selectable events share ${e.date}; mapping by date is ambiguous.`
            )
        }
        eventByDate.set(e.date, e.id)
    }

    // Current signups and any availability already recorded for this season.
    const signups = await client.query(
        `select s.id as signup_id, s.player, lower(u.email) as email
           from signups s join users u on u.id = s.player
          where s.season = $1`,
        [SEASON_ID]
    )
    const signupByEmail = new Map(signups.rows.map((r) => [r.email, r]))

    const existing = await client.query(
        `select distinct uu.user_id
           from user_unavailability uu
           join season_events e on e.id = uu.event_id
          where e.season_id = $1`,
        [SEASON_ID]
    )
    const alreadyHasData = new Set(existing.rows.map((r) => r.user_id))

    const rows = parseCsv(readFileSync(csvPath, "utf8"))
    const inserts: { userId: string; signupId: number; eventId: number }[] = []
    const skippedNewer: string[] = []
    const unmatchedEmail: string[] = []
    const unmappedDates = new Map<string, string[]>()

    for (const row of rows) {
        const raw = row["Unavailable Dates"] || ""
        const dates = raw.match(DATE_PATTERN) ?? []
        if (dates.length === 0) continue

        const email = (row.Email || "").trim().toLowerCase()
        const signup = signupByEmail.get(email)
        if (!signup) {
            unmatchedEmail.push(email)
            continue
        }
        if (alreadyHasData.has(signup.player)) {
            skippedNewer.push(email)
            continue
        }

        for (const date of dates) {
            const eventId = eventByDate.get(toIsoDate(date))
            if (!eventId) {
                // Prior-season dates land here: the cross-season carryover bug
                // let them ride along on a Fall signup. They are not restored.
                const list = unmappedDates.get(date) ?? []
                list.push(email)
                unmappedDates.set(date, list)
                continue
            }
            inserts.push({
                userId: signup.player,
                signupId: signup.signup_id,
                eventId
            })
        }
    }

    console.log(`CSV rows:                  ${rows.length}`)
    console.log(`Rows to insert:            ${inserts.length}`)
    console.log(
        `Players restored:          ${new Set(inserts.map((i) => i.userId)).size}`
    )
    console.log(
        `Skipped (newer entry):     ${skippedNewer.length}${skippedNewer.length ? ` — ${skippedNewer.join(", ")}` : ""}`
    )
    console.log(
        `Skipped (no F26 signup):   ${unmatchedEmail.length}${unmatchedEmail.length ? ` — ${unmatchedEmail.join(", ")}` : ""}`
    )
    for (const [date, emails] of unmappedDates) {
        console.log(
            `Not a Fall 2026 date:      ${date} — ${emails.join(", ")}`
        )
    }

    if (!apply) {
        console.log("\nDry run. Re-run with --apply to write.")
        await client.end()
        return
    }

    await client.query("begin")
    try {
        for (const ins of inserts) {
            await client.query(
                `insert into user_unavailability (user_id, signup_id, event_id)
                 values ($1, $2, $3)
                 on conflict (user_id, event_id) do nothing`,
                [ins.userId, ins.signupId, ins.eventId]
            )
        }
        await client.query("commit")
        console.log(`\nInserted. ${inserts.length} rows committed.`)
    } catch (error) {
        await client.query("rollback")
        throw error
    }
    await client.end()
}

main()
