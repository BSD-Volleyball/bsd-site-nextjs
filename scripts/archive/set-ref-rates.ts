import "dotenv/config"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { sql } from "drizzle-orm"

async function main() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    const db = drizzle(pool)

    // Check current seasons
    const seasons = await db.execute(
        sql`SELECT id, code, year, season, certified_ref_rate, uncertified_ref_rate FROM seasons ORDER BY id DESC LIMIT 5`
    )
    // biome-ignore lint/suspicious/noExplicitAny: Drizzle raw execute result type varies
    const rows = (seasons as any).rows ?? seasons
    console.log("Current seasons:")
    // biome-ignore lint/suspicious/noExplicitAny: one-off script, rows are untyped
    for (const row of rows as any[]) {
        console.log(
            `  id=${row.id} code="${row.code}" year=${row.year} season=${row.season} certified=${row.certified_ref_rate} uncertified=${row.uncertified_ref_rate}`
        )
    }

    // Update the most recent season
    // biome-ignore lint/suspicious/noExplicitAny: one-off script, rows are untyped
    const latest = (rows as any[])[0]
    if (!latest) {
        console.log("No seasons found!")
        await pool.end()
        return
    }

    await db.execute(sql`
        UPDATE seasons
        SET certified_ref_rate = 26.00, uncertified_ref_rate = 21.00
        WHERE id = ${latest.id}
    `)

    console.log(
        `\nUpdated season ${latest.id} (${latest.year} ${latest.season}): certified=$26, uncertified=$21`
    )
    await pool.end()
}
main().catch(console.error)
