import { expect, test } from "@playwright/test"
import { eq } from "drizzle-orm"
import { db } from "@/database/db"
import {
    divisions,
    individual_divisions,
    matches,
    seasonEvents,
    seasons,
    teams,
    users
} from "@/database/schema"
import { createSeason, createSeasonEvent, createTeam } from "@/test/factories"
import { PERSONAS } from "./helpers"

// Admin smoke test for regular-season schedule generation: one 4-team
// division with six regular-season dates must produce 2 matches/week x 6
// weeks = 12 matches. Seeded on a dedicated season (highest id = current)
// and fully removed afterwards.

const REGULAR_DATES = [
    "2026-09-12",
    "2026-09-19",
    "2026-09-26",
    "2026-10-03",
    "2026-10-10",
    "2026-10-17"
]
const EXPECTED_MATCHES = 12 // 4-team division: 2 matches/week x 6 weeks

let seasonId: number
let divisionLevel: number
const teamIds: number[] = []

test.beforeAll(async () => {
    const [division] = await db.select().from(divisions).limit(1)
    divisionLevel = division.level
    const [captain] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, PERSONAS.captain.email))

    const season = await createSeason({ code: "E2ESCHED", phase: "draft" })
    seasonId = season.id

    await db.insert(individual_divisions).values({
        season: seasonId,
        division: division.id,
        gender_split: "5-3",
        teams: 4
    })

    for (const [i, date] of REGULAR_DATES.entries()) {
        await createSeasonEvent(seasonId, {
            event_type: "regular_season",
            event_date: date,
            sort_order: i
        })
    }

    for (let n = 1; n <= 4; n++) {
        const team = await createTeam({
            season: seasonId,
            division: division.id,
            captain: captain.id,
            name: `E2E Squad ${n}`,
            number: n
        })
        teamIds.push(team.id)
    }
})

test.afterAll(async () => {
    await db.delete(matches).where(eq(matches.season, seasonId))
    await db.delete(teams).where(eq(teams.season, seasonId))
    await db
        .delete(individual_divisions)
        .where(eq(individual_divisions.season, seasonId))
    await db.delete(seasonEvents).where(eq(seasonEvents.season_id, seasonId))
    await db.delete(seasons).where(eq(seasons.id, seasonId))
})

test.describe("regular season schedule generation", () => {
    test.use({ storageState: PERSONAS.admin.storageState })

    test("admin generates the round-robin schedule from the preview page", async ({
        page
    }) => {
        await page.goto("/dashboard/create-schedule")
        await expect(
            page.getByRole("heading", { name: "Create Schedule" })
        ).toBeVisible()

        // Preview reflects the seeded 4-team division and its teams
        await expect(
            page.getByText(`(4 teams, Court ${divisionLevel})`).first()
        ).toBeVisible()
        await expect(page.getByText("1. E2E Squad 1").first()).toBeVisible()

        const writeButton = page.getByRole("button", {
            name: "Write Regular Season Schedule to Database"
        })
        await expect(writeButton).toBeEnabled()
        await writeButton.click()

        await expect(
            page.getByText(
                `Successfully created ${EXPECTED_MATCHES} regular season matches across 1 divisions!`
            )
        ).toBeVisible({ timeout: 20_000 })

        // 2 matches/week x 6 weeks, all non-playoff, on the seeded dates,
        // between the seeded teams
        const rows = await db
            .select()
            .from(matches)
            .where(eq(matches.season, seasonId))
        expect(rows.length).toBe(EXPECTED_MATCHES)

        const matchesPerWeek = new Map<number, number>()
        for (const row of rows) {
            expect(row.playoff).toBe(false)
            expect(row.date).toBe(REGULAR_DATES[row.week - 1])
            expect(teamIds).toContain(row.home_team)
            expect(teamIds).toContain(row.away_team)
            matchesPerWeek.set(
                row.week,
                (matchesPerWeek.get(row.week) ?? 0) + 1
            )
        }
        expect([...matchesPerWeek.keys()].sort((a, b) => a - b)).toEqual([
            1, 2, 3, 4, 5, 6
        ])
        for (const count of matchesPerWeek.values()) {
            expect(count).toBe(2)
        }
    })
})
