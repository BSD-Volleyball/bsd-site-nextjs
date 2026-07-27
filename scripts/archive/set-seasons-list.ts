/**
 * Usage:
 *   echo -e "alice@example.com\nbob@example.com" | npx tsx scripts/set-seasons-list.ts <status>
 *   cat emails.txt | npx tsx scripts/set-seasons-list.ts <status>
 *
 * Sets the seasons_list field to <status> for all users whose email matches
 * one of the addresses read from stdin (one per line, case-insensitive).
 */

import "dotenv/config"
import { drizzle } from "drizzle-orm/node-postgres"
import { users } from "../src/database/schema"
import { inArray, sql } from "drizzle-orm"
import { createInterface } from "node:readline"

async function readStdin(): Promise<string[]> {
    const rl = createInterface({ input: process.stdin, terminal: false })
    const lines: string[] = []
    for await (const line of rl) {
        const trimmed = line.trim()
        if (trimmed) {
            lines.push(trimmed)
        }
    }
    return lines
}

async function main() {
    const [status] = process.argv.slice(2)

    if (!status) {
        console.error(
            "Usage: cat emails.txt | npx tsx scripts/set-seasons-list.ts <status>"
        )
        process.exit(1)
    }

    const rawEmails = await readStdin()

    if (rawEmails.length === 0) {
        console.error("No email addresses provided on stdin.")
        process.exit(1)
    }

    const emails = rawEmails.map((e) => e.toLowerCase())

    const db = drizzle(process.env.DATABASE_URL!)

    const matched = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(sql`LOWER(${users.email})`, emails))

    const matchedEmails = new Set(matched.map((r) => r.email.toLowerCase()))
    const notFound = emails.filter((e) => !matchedEmails.has(e))

    if (notFound.length > 0) {
        console.warn(`No user found for ${notFound.length} email(s):`)
        for (const e of notFound) {
            console.warn(`  ${e}`)
        }
    }

    if (matched.length === 0) {
        console.log("No matching users found. Nothing updated.")
        process.exit(0)
    }

    console.log(
        `Updating seasons_list to "${status}" for ${matched.length} user(s):`
    )
    for (const row of matched) {
        console.log(`  ${row.email}`)
    }

    await db
        .update(users)
        .set({ seasons_list: status, updatedAt: new Date() })
        .where(
            inArray(
                users.id,
                matched.map((r) => r.id)
            )
        )

    console.log("Done.")
    process.exit(0)
}

main().catch((err) => {
    console.error("Error:", err)
    process.exit(1)
})
