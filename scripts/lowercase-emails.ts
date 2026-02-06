import "dotenv/config"
import { drizzle } from "drizzle-orm/node-postgres"
import { users } from "../src/database/schema"
import { sql } from "drizzle-orm"

async function main() {
    const db = drizzle(process.env.DATABASE_URL!)

    // Find users with uppercase characters in their email
    const rows = await db
        .select({ id: users.id, email: users.email })
        .from(users)

    const toUpdate = rows.filter((r) => r.email !== r.email.toLowerCase())

    console.log(`Found ${toUpdate.length} user(s) with mixed-case emails out of ${rows.length} total.`)

    for (const row of toUpdate) {
        const lower = row.email.toLowerCase()
        console.log(`  ${row.email} -> ${lower}`)
        await db
            .update(users)
            .set({ email: lower })
            .where(sql`${users.id} = ${row.id}`)
    }

    console.log("Done.")
    process.exit(0)
}

main().catch((err) => {
    console.error("Error:", err)
    process.exit(1)
})
