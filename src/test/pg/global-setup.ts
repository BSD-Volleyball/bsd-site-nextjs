import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client } from "pg"
import { TEMPLATE_DB, getTestPgBaseUrl, testDbUrl } from "./config"

// The template database is built once from the repo's real migrations and
// then cloned per worker (CREATE DATABASE ... TEMPLATE ...), so every test
// run also validates that the migration chain applies cleanly end to end.
// A hash of migrations/** stored as the database comment makes rebuilds
// happen only when a migration actually changes.

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations")

// Tripwire: the schema currently produces this many public tables. If a
// migration adds/drops tables this needs updating — that is the point; a
// surprising count means the journal and SQL files have drifted.
const MIN_EXPECTED_TABLES = 50

function migrationsHash(): string {
    const hash = createHash("sha256")
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true }).sort(
            (a, b) => a.name.localeCompare(b.name)
        )) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                walk(full)
            } else {
                hash.update(entry.name)
                hash.update(readFileSync(full))
            }
        }
    }
    walk(MIGRATIONS_DIR)
    return hash.digest("hex")
}

export default async function globalSetup(): Promise<void> {
    const base = getTestPgBaseUrl()
    const admin = new Client({ connectionString: `${base}/postgres` })
    try {
        await admin.connect()
    } catch (error) {
        throw new Error(
            `Cannot reach the local test Postgres at ${base}. ` +
                "Integration tests need a running local instance with the bsd_test role. " +
                "See the Testing section in README.md (typically: `sudo pg_ctlcluster 17 main start`). " +
                `Original error: ${error instanceof Error ? error.message : error}`
        )
    }

    try {
        const expectedComment = `migrations:${migrationsHash()}`
        const existing = await admin.query(
            "SELECT shobj_description(oid, 'pg_database') AS comment FROM pg_database WHERE datname = $1",
            [TEMPLATE_DB]
        )
        if (existing.rows[0]?.comment === expectedComment) {
            return
        }

        await admin.query(`DROP DATABASE IF EXISTS ${TEMPLATE_DB} WITH (FORCE)`)
        await admin.query(`CREATE DATABASE ${TEMPLATE_DB}`)

        const template = new Client({
            connectionString: testDbUrl(TEMPLATE_DB)
        })
        await template.connect()
        try {
            await migrate(drizzle(template), {
                migrationsFolder: MIGRATIONS_DIR
            })
            const { rows } = await template.query(
                "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'"
            )
            if (rows[0].n < MIN_EXPECTED_TABLES) {
                throw new Error(
                    `Template database has only ${rows[0].n} public tables after ` +
                        `migrating (expected at least ${MIN_EXPECTED_TABLES}) — ` +
                        "the migration journal may have drifted."
                )
            }
        } finally {
            // The template must have zero connections or clones will fail
            await template.end()
        }

        await admin.query(
            `COMMENT ON DATABASE ${TEMPLATE_DB} IS '${expectedComment}'`
        )
    } finally {
        await admin.end()
    }
}
