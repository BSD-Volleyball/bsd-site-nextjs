import "dotenv/config"
import pg from "pg"

// Backfills champions.picture from teams.picture_url for champion rows whose
// team photo was uploaded after the season advanced to "complete" (the point
// at which advanceSeasonPhase snapshots the URL). Idempotent: only touches
// rows where champions.picture IS NULL.

const base = (process.env.PLAYER_PIC_URL || "").replace(/\/+$/, "")
if (!base) {
    throw new Error("PLAYER_PIC_URL is not set")
}

const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
})
await client.connect()

const result = await client.query(
    `update champions ch
        set picture = $1 || '/' || t.picture_url
       from teams t
      where t.id = ch.team
        and ch.picture is null
        and t.picture_url is not null
      returning ch.id, ch.team, ch.picture`,
    [base]
)

console.log(`Updated ${result.rowCount} champion row(s):`)
console.table(result.rows)

await client.end()
