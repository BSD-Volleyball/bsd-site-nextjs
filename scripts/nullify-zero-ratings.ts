import "dotenv/config"
import { drizzle } from "drizzle-orm/node-postgres"
import { playerRatings } from "../src/database/schema"
import { eq, or, sql } from "drizzle-orm"

const SKILLS = ["overall", "passing", "setting", "hitting", "serving"] as const

async function main() {
    const db = drizzle(process.env.DATABASE_URL!)

    const rows = await db
        .select({
            id: playerRatings.id,
            overall: playerRatings.overall,
            passing: playerRatings.passing,
            setting: playerRatings.setting,
            hitting: playerRatings.hitting,
            serving: playerRatings.serving
        })
        .from(playerRatings)
        .where(
            or(
                eq(playerRatings.overall, 0),
                eq(playerRatings.passing, 0),
                eq(playerRatings.setting, 0),
                eq(playerRatings.hitting, 0),
                eq(playerRatings.serving, 0)
            )
        )

    console.log(
        `Found ${rows.length} rating row(s) with at least one zero skill.`
    )

    let updatedCount = 0

    for (const row of rows) {
        const update: Partial<typeof playerRatings.$inferInsert> = {}

        for (const skill of SKILLS) {
            if (row[skill] === 0) {
                update[skill] = null
            }
        }

        const zeroFields = Object.keys(update).join(", ")
        console.log(`  Row ${row.id}: nullifying [${zeroFields}]`)

        await db
            .update(playerRatings)
            .set(update)
            .where(sql`${playerRatings.id} = ${row.id}`)

        updatedCount++
    }

    console.log(`Done. Updated ${updatedCount} row(s).`)
    process.exit(0)
}

main().catch((err) => {
    console.error("Error:", err)
    process.exit(1)
})
