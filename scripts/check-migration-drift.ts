import { readFileSync, readdirSync, existsSync } from "node:fs"
import path from "node:path"

// CI guard: catches migration-metadata drift that `drizzle-kit check` misses
// (it only detects snapshot race collisions). Asserts:
//   1. every migrations/*.sql file has exactly one journal entry and vice versa
//   2. journal idx values are contiguous from 0 and `when` strictly increases
//   3. the latest journal entry has a matching meta/<idx>_snapshot.json
//   4. all journal entries use snapshot version "7"
// No database connection required.

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations")
const META_DIR = path.join(MIGRATIONS_DIR, "meta")

interface JournalEntry {
    idx: number
    version: string
    when: number
    tag: string
}

const errors: string[] = []

const journal = JSON.parse(
    readFileSync(path.join(META_DIR, "_journal.json"), "utf8")
) as { entries: JournalEntry[] }

const sqlFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(/\.sql$/, ""))
    .sort()

const journalTags = journal.entries.map((e) => e.tag).sort()

for (const file of sqlFiles) {
    if (!journalTags.includes(file)) {
        errors.push(`migrations/${file}.sql has no journal entry`)
    }
}
for (const tag of journalTags) {
    if (!sqlFiles.includes(tag)) {
        errors.push(`journal entry "${tag}" has no migrations/${tag}.sql file`)
    }
}
if (new Set(journalTags).size !== journalTags.length) {
    errors.push("journal contains duplicate tags")
}

journal.entries.forEach((entry, i) => {
    if (entry.idx !== i) {
        errors.push(
            `journal idx not contiguous: position ${i} has idx ${entry.idx}`
        )
    }
    if (entry.version !== "7") {
        errors.push(`journal entry "${entry.tag}" has version ${entry.version}`)
    }
    if (i > 0 && entry.when <= journal.entries[i - 1].when) {
        errors.push(
            `journal "when" not strictly increasing at "${entry.tag}" ` +
                `(${entry.when} <= ${journal.entries[i - 1].when})`
        )
    }
})

const last = journal.entries[journal.entries.length - 1]
if (last) {
    const prefix = String(last.idx).padStart(4, "0")
    const snapshot = path.join(META_DIR, `${prefix}_snapshot.json`)
    if (!existsSync(snapshot)) {
        errors.push(
            `latest journal entry "${last.tag}" has no meta/${prefix}_snapshot.json — ` +
                "drizzle-kit generate would diff against a stale base"
        )
    }
}

if (errors.length > 0) {
    console.error("Migration drift detected:")
    for (const e of errors) {
        console.error(`  - ${e}`)
    }
    process.exit(1)
}

console.log(
    `Migration metadata OK: ${sqlFiles.length} migrations, journal and snapshots consistent.`
)
