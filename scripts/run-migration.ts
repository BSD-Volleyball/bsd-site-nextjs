import "dotenv/config"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Pool } from "pg"

async function runMigration() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL
    })

    const db = drizzle(pool)

    console.log("Running migrations...")
    await migrate(db, { migrationsFolder: "./migrations" })
    console.log("Migrations complete!")

    await pool.end()
}

runMigration().catch(console.error)
