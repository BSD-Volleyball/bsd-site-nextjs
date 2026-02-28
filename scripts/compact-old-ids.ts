import "dotenv/config"
import * as readline from "readline"
import { drizzle } from "drizzle-orm/node-postgres"
import { users } from "../src/database/schema"
import { sql, isNotNull, gt } from "drizzle-orm"

async function prompt(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close()
            resolve(answer)
        })
    })
}

async function main() {
    const db = drizzle(process.env.DATABASE_URL!)

    // Step 1: Find the max old_id among users who have a picture (i.e. real users)
    const withPicture = await db
        .select({ old_id: users.old_id })
        .from(users)
        .where(isNotNull(users.picture))
        .orderBy(sql`${users.old_id} DESC NULLS LAST`)
        .limit(1)

    if (withPicture.length === 0 || withPicture[0].old_id === null) {
        console.log("No users with both a picture and an old_id found. Nothing to do.")
        process.exit(0)
    }

    const maxWithPicture = withPicture[0].old_id
    console.log(`Max old_id for users with a picture: ${maxWithPicture}`)

    // Step 2: Find all users with old_id > maxWithPicture, ordered by old_id ascending
    const toCompact = await db
        .select({
            id: users.id,
            name: users.name,
            email: users.email,
            old_id: users.old_id
        })
        .from(users)
        .where(gt(users.old_id, maxWithPicture))
        .orderBy(users.old_id)

    if (toCompact.length === 0) {
        console.log(
            `No users with old_id above ${maxWithPicture}. Nothing to compact.`
        )
        process.exit(0)
    }

    console.log(
        `\nFound ${toCompact.length} user(s) with old_id > ${maxWithPicture} to compact:\n`
    )

    // Step 3: Build compaction mapping — reassign sequentially from maxWithPicture + 1
    const mappings = toCompact.map((user, index) => ({
        ...user,
        new_old_id: maxWithPicture + 1 + index
    }))

    const nextAvailable = maxWithPicture + toCompact.length + 1

    // Print mapping table
    const emailWidth = Math.max(
        5,
        ...mappings.map((m) => (m.email ?? "").length)
    )
    const nameWidth = Math.max(
        4,
        ...mappings.map((m) => (m.name ?? "").length)
    )
    const header = [
        " OLD old_id".padEnd(12),
        " NEW old_id".padEnd(12),
        "Email".padEnd(emailWidth),
        "Name".padEnd(nameWidth)
    ].join("  ")
    const divider = "-".repeat(header.length)

    console.log(header)
    console.log(divider)
    for (const m of mappings) {
        console.log(
            [
                String(m.old_id).padEnd(12),
                String(m.new_old_id).padEnd(12),
                (m.email ?? "").padEnd(emailWidth),
                (m.name ?? "").padEnd(nameWidth)
            ].join("  ")
        )
    }
    console.log(divider)
    console.log(
        `\nAfter compaction, next available old_id will be: ${nextAvailable}`
    )

    // Step 4: Confirm before applying
    const answer = await prompt("\nApply these changes? Type 'yes' to confirm: ")
    if (answer.trim().toLowerCase() !== "yes") {
        console.log("Aborted. No changes made.")
        process.exit(0)
    }

    // Step 5: Apply updates one at a time to avoid unique constraint collisions.
    // Use a large temporary offset first, then set final values, in case any
    // new_old_id values would collide with existing old_ids mid-update.
    const OFFSET = 1_000_000

    console.log("\nApplying temporary offset to avoid collisions...")
    for (const m of mappings) {
        await db
            .update(users)
            .set({ old_id: m.old_id + OFFSET })
            .where(sql`${users.id} = ${m.id}`)
    }

    console.log("Setting final values...")
    for (const m of mappings) {
        await db
            .update(users)
            .set({ old_id: m.new_old_id })
            .where(sql`${users.id} = ${m.id}`)
        console.log(
            `  ${m.email ?? m.id}: old_id ${m.old_id} -> ${m.new_old_id}`
        )
    }

    // Step 6: Reset the sequence so the next INSERT picks up from nextAvailable.
    // setval(seq, value, is_called=true) means nextval() will return value + 1,
    // so passing nextAvailable - 1 makes the next INSERT receive nextAvailable.
    await db.execute(
        sql`SELECT setval('users_old_id_seq', ${nextAvailable - 1}, true)`
    )
    console.log(
        `Sequence users_old_id_seq reset — next INSERT will receive old_id ${nextAvailable}`
    )

    console.log(`\nDone. ${mappings.length} user(s) updated.`)

    process.exit(0)
}

main().catch((err) => {
    console.error("Error:", err)
    process.exit(1)
})
