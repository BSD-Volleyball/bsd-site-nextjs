import { expect, test } from "@playwright/test"
import { eq } from "drizzle-orm"
import { db } from "@/database/db"
import {
    divisions,
    individual_divisions,
    matches,
    seasons,
    teams,
    users
} from "@/database/schema"
import { createMatch, createSeason, createTeam } from "@/test/factories"
import { PERSONAS } from "./helpers"

// Score entry smoke test: a regular-season match played today gets its set
// scores and winner entered by an admin through /dashboard/enter-scores.
// All state is seeded directly in the DB on a dedicated season (highest id
// = current season) and removed afterwards so later spec files still see
// the baseline season.

function todayUTC(): string {
    // Matches the page's default-date computation (toISOString → UTC)
    return new Date().toISOString().split("T")[0]
}

let seasonId: number
let divisionName: string
let sharksId: number
let jetsId: number
let matchId: number

test.beforeAll(async () => {
    const [division] = await db.select().from(divisions).limit(1)
    divisionName = division.name
    const [captain] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, PERSONAS.captain.email))

    const season = await createSeason({
        code: "E2ESCORES",
        phase: "regular_season"
    })
    seasonId = season.id

    await db.insert(individual_divisions).values({
        season: seasonId,
        division: division.id,
        gender_split: "5-3",
        teams: 2
    })

    const sharks = await createTeam({
        season: seasonId,
        division: division.id,
        captain: captain.id,
        name: "E2E Sharks",
        number: 1
    })
    sharksId = sharks.id
    const jets = await createTeam({
        season: seasonId,
        division: division.id,
        captain: captain.id,
        name: "E2E Jets",
        number: 2
    })
    jetsId = jets.id

    const match = await createMatch({
        season: seasonId,
        division: division.id,
        week: 1,
        date: todayUTC(),
        time: "19:00",
        court: division.level,
        home_team: sharksId,
        away_team: jetsId
    })
    matchId = match.id
})

test.afterAll(async () => {
    // Restrict FKs force dependency order: matches → teams → division link →
    // season (removing the season makes the baseline season current again).
    await db.delete(matches).where(eq(matches.season, seasonId))
    await db.delete(teams).where(eq(teams.season, seasonId))
    await db
        .delete(individual_divisions)
        .where(eq(individual_divisions.season, seasonId))
    await db.delete(seasons).where(eq(seasons.id, seasonId))
})

test.describe("enter scores", () => {
    test.use({ storageState: PERSONAS.admin.storageState })

    test("admin enters set scores and a winner for today's match", async ({
        page
    }) => {
        await page.goto("/dashboard/enter-scores")
        await expect(
            page.getByRole("heading", { name: "Enter Scores" })
        ).toBeVisible()

        // Today's match is pre-selected (only date in the season)
        await expect(
            page.getByRole("heading", { name: `Division ${divisionName}` })
        ).toBeVisible()
        await expect(
            page.getByRole("button", { name: "E2E Sharks" })
        ).toBeVisible()

        // The score inputs have no accessible labels, so target them by
        // their row label and home/away column position.
        const scoreRow = (label: string) =>
            page.locator("tr").filter({ hasText: label })

        const game1 = scoreRow("Game 1 Score")
        await game1.getByRole("spinbutton").nth(0).fill("25")
        await game1.getByRole("spinbutton").nth(1).fill("20")

        const game2 = scoreRow("Game 2 Score")
        await game2.getByRole("spinbutton").nth(0).fill("25")
        await game2.getByRole("spinbutton").nth(1).fill("18")

        const totals = scoreRow("Total Games Won")
        await totals.getByRole("spinbutton").nth(0).fill("2")
        await totals.getByRole("spinbutton").nth(1).fill("0")

        // Overall winner: home team
        await page.getByRole("button", { name: "E2E Sharks" }).click()

        await page
            .getByRole("button", { name: `Save Division ${divisionName}` })
            .click()
        await expect(
            page.getByText("Saved scores for 1 match(es).")
        ).toBeVisible({ timeout: 20_000 })

        // The matches row got the scores and winner
        const [saved] = await db
            .select()
            .from(matches)
            .where(eq(matches.id, matchId))
        expect(saved.home_set1_score).toBe(25)
        expect(saved.away_set1_score).toBe(20)
        expect(saved.home_set2_score).toBe(25)
        expect(saved.away_set2_score).toBe(18)
        expect(saved.home_set3_score).toBeNull()
        expect(saved.home_score).toBe(2)
        expect(saved.away_score).toBe(0)
        expect(saved.winner).toBe(sharksId)
        expect(saved.winner).not.toBe(jetsId)
    })
})
