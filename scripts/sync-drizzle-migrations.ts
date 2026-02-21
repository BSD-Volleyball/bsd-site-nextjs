import "dotenv/config"
import { Client } from "pg"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { resolve } from "node:path"

type JournalEntry = {
    idx: number
    when: number
    tag: string
}

type JournalFile = {
    entries: JournalEntry[]
}

async function syncDrizzleMigrations() {
    const targetTag = process.argv[2] ?? "0014_playoff-bracket-restructure"
    const migrationsDir = resolve(process.cwd(), "migrations")
    const journalPath = resolve(migrationsDir, "meta", "_journal.json")
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as JournalFile

    const targetIndex = journal.entries.findIndex((e) => e.tag === targetTag)
    if (targetIndex < 0) {
        throw new Error(`Target tag not found in journal: ${targetTag}`)
    }

    const entriesToSync = journal.entries.slice(0, targetIndex + 1)
    if (entriesToSync.length === 0) {
        console.log("No journal entries to sync.")
        return
    }

    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is not set")
    }

    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()

    try {
        await client.query('CREATE SCHEMA IF NOT EXISTS "drizzle"')
        await client.query(`
            CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
                id SERIAL PRIMARY KEY,
                hash text NOT NULL,
                created_at bigint
            )
        `)

        const existing = await client.query<{
            created_at: string | null
        }>('SELECT created_at FROM "drizzle"."__drizzle_migrations"')
        const existingCreatedAts = new Set(
            existing.rows
                .map((r) => (r.created_at ? Number(r.created_at) : null))
                .filter((v): v is number => v !== null)
        )

        let inserted = 0
        for (const entry of entriesToSync) {
            if (existingCreatedAts.has(entry.when)) {
                continue
            }

            const migrationSql = readFileSync(
                resolve(migrationsDir, `${entry.tag}.sql`),
                "utf8"
            )
            const hash = createHash("sha256").update(migrationSql).digest("hex")

            await client.query(
                'INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)',
                [hash, entry.when]
            )
            inserted++
        }

        const count = await client.query<{ count: string }>(
            'SELECT count(*)::text as count FROM "drizzle"."__drizzle_migrations"'
        )

        console.log(
            `Synced drizzle migration tracker through ${targetTag}. Inserted ${inserted} rows. Total rows: ${count.rows[0].count}.`
        )
    } finally {
        await client.end()
    }
}

syncDrizzleMigrations().catch((error) => {
    console.error("Failed to sync drizzle migrations:", error)
    process.exit(1)
})
