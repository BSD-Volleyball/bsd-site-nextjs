import "dotenv/config"
import { drizzle } from "drizzle-orm/node-postgres"
import { users } from "../src/database/schema"
import { sql, isNotNull } from "drizzle-orm"

async function main() {
    const db = drizzle(process.env.DATABASE_URL!)

    const rows = await db
        .select({
            id: users.id,
            first_name: users.first_name,
            preffered_name: users.preffered_name
        })
        .from(users)
        .where(isNotNull(users.preffered_name))

    const toUpdate = rows.filter(
        (r) =>
            r.preffered_name &&
            r.preffered_name.trim().toLowerCase() ===
                r.first_name.trim().toLowerCase()
    )

    console.log(
        `Found ${toUpdate.length} user(s) whose preferred name matches their first name (out of ${rows.length} with a preferred name set).`
    )

    for (const row of toUpdate) {
        console.log(
            `  Clearing "${row.preffered_name}" for user ${row.id} (first name: "${row.first_name}")`
        )
        await db
            .update(users)
            .set({ preffered_name: null })
            .where(sql`${users.id} = ${row.id}`)
    }

    console.log("Done.")
    process.exit(0)
}

main().catch((err) => {
    console.error("Error:", err)
    process.exit(1)
})
