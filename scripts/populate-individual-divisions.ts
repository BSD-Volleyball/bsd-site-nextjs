import "dotenv/config"
import { drizzle } from "drizzle-orm/node-postgres"
import {
    teams,
    drafts,
    users,
    individual_divisions
} from "../src/database/schema"
import { eq, sql, and, countDistinct } from "drizzle-orm"

async function main() {
    const db = drizzle(process.env.DATABASE_URL!)

    // Get distinct (season, division) pairs from teams with team counts
    const pairings = await db
        .select({
            season: teams.season,
            division: teams.division,
            teamCount: countDistinct(teams.id)
        })
        .from(teams)
        .groupBy(teams.season, teams.division)

    console.log(
        `Found ${pairings.length} season/division pairing(s) in teams table.`
    )

    for (const pairing of pairings) {
        // Get all teams for this season/division
        const teamRows = await db
            .select({ id: teams.id })
            .from(teams)
            .where(
                and(
                    eq(teams.season, pairing.season),
                    eq(teams.division, pairing.division)
                )
            )

        const teamIds = teamRows.map((t) => t.id)

        // Get users on these teams via drafts, with their gender info
        const draftedUsers = await db
            .select({
                team: drafts.team,
                male: users.male
            })
            .from(drafts)
            .innerJoin(users, eq(drafts.user, users.id))
            .where(sql`${drafts.team} IN ${teamIds}`)

        // Count males and non-males per team
        const teamGenderCounts = new Map<
            number,
            { males: number; nonMales: number }
        >()
        for (const row of draftedUsers) {
            if (!teamGenderCounts.has(row.team)) {
                teamGenderCounts.set(row.team, { males: 0, nonMales: 0 })
            }
            const counts = teamGenderCounts.get(row.team)!
            if (row.male) {
                counts.males++
            } else {
                counts.nonMales++
            }
        }

        // Determine gender split by looking at the most common pattern across teams
        let fiveThreeCount = 0
        let sixTwoCount = 0
        for (const [, counts] of teamGenderCounts) {
            // "5-3" = 5 males, 3 non-males; "6-2" = 6 males, 2 non-males
            if (counts.nonMales >= 3) {
                fiveThreeCount++
            } else {
                sixTwoCount++
            }
        }

        const genderSplit = fiveThreeCount >= sixTwoCount ? "5-3" : "6-2"

        console.log(
            `  Season ${pairing.season}, Division ${pairing.division}: ${pairing.teamCount} teams, gender_split="${genderSplit}" (5-3: ${fiveThreeCount} teams, 6-2: ${sixTwoCount} teams)`
        )

        await db.insert(individual_divisions).values({
            season: pairing.season,
            division: pairing.division,
            coaches: false,
            gender_split: genderSplit,
            teams: pairing.teamCount
        })
    }

    console.log(
        `\nInserted ${pairings.length} row(s) into individual_divisions.`
    )
    process.exit(0)
}

main().catch((err) => {
    console.error("Error:", err)
    process.exit(1)
})
