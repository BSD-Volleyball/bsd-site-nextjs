import "dotenv/config"
import { Pool } from "pg"
import * as fs from "node:fs"

async function runMigration() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL
    })

    const sql = fs.readFileSync("./migrations/0011_square_sway.sql", "utf-8")

    console.log("Running migration 0011_square_sway.sql...")
    console.log(sql)

    try {
        await pool.query(sql)
        console.log("Migration complete!")
    } catch (error) {
        console.error("Migration failed:", error)
    }

    await pool.end()
}

runMigration().catch(console.error)
