import { expect, test } from "@playwright/test"
import { eq } from "drizzle-orm"
import { db } from "@/database/db"
import {
    divisions,
    individual_divisions,
    matches,
    scoreSheetReads,
    scoreSheets,
    seasonEvents,
    seasons,
    teams,
    users
} from "@/database/schema"
import {
    createMatch,
    createSeason,
    createSeasonEvent,
    createTeam
} from "@/test/factories"
import { PERSONAS } from "./helpers"

// A read that has already happened is seeded directly, so this exercises the
// product surface — the banner, filling in, and saving — without needing R2,
// a model, or a photograph. The imaging itself is covered far more thoroughly
// by the property tests in src/lib/scoresheets/read.

function todayUTC(): string {
    return new Date().toISOString().split("T")[0]
}

const NIGHT = todayUTC()

let seasonId: number
let divisionName: string
let matchId: number
let sharksId: number

test.beforeAll(async () => {
    const [division] = await db.select().from(divisions).limit(1)
    divisionName = division.name

    const [captain] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, PERSONAS.captain.email))

    const season = await createSeason({
        code: "E2EDRAFT",
        phase: "regular_season"
    })
    seasonId = season.id

    await db.insert(individual_divisions).values({
        season: seasonId,
        division: division.id,
        gender_split: "5-3",
        teams: 2
    })
    await createSeasonEvent(seasonId, {
        event_type: "regular_season",
        event_date: NIGHT,
        sort_order: 0
    })

    const sharks = await createTeam({
        season: seasonId,
        division: division.id,
        captain: captain.id,
        name: "Draft Sharks",
        number: 1
    })
    sharksId = sharks.id
    const jets = await createTeam({
        season: seasonId,
        division: division.id,
        captain: captain.id,
        name: "Draft Jets",
        number: 2
    })

    const match = await createMatch({
        season: seasonId,
        division: division.id,
        week: 1,
        date: NIGHT,
        time: "19:00",
        court: division.level,
        home_team: sharks.id,
        away_team: jets.id
    })
    matchId = match.id

    const [uploader] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, PERSONAS.admin.email))

    const [sheet] = await db
        .insert(scoreSheets)
        .values({
            season_id: seasonId,
            division_id: null,
            court: division.level,
            match_date: NIGHT,
            image_path: `scoresheets/${seasonId}/${NIGHT}/e2e.jpg`,
            uploaded_by: uploader.id
        })
        .returning()

    // One clean game and one the reader was unsure about
    await db.insert(scoreSheetReads).values({
        score_sheet_id: sheet.id,
        status: "needs_review",
        tag: `BSD2:E2:W1:${NIGHT}:${division.level}`,
        template_version: 2,
        problems: ["Game 2 is a guess."],
        transcriber: "stub",
        result: {
            status: "needs_review",
            tag: null,
            identity: null,
            locate: null,
            crops: [],
            problems: [],
            transcriber: "stub",
            matches: [
                {
                    matchId,
                    orderOnCourt: 1,
                    homeGamesWon: 2,
                    awayGamesWon: 0,
                    winner: "home",
                    problems: [],
                    games: [
                        {
                            home: 25,
                            away: 19,
                            winner: "home",
                            confidence: 0.97,
                            level: "high",
                            conflict: null,
                            blank: false
                        },
                        {
                            home: 25,
                            away: 21,
                            winner: "home",
                            confidence: 0.6,
                            level: "low",
                            conflict: null,
                            blank: false
                        },
                        {
                            home: null,
                            away: null,
                            winner: null,
                            confidence: 1,
                            level: "high",
                            conflict: null,
                            blank: true
                        }
                    ]
                }
            ]
        }
    })
})

test.afterAll(async () => {
    await db.delete(matches).where(eq(matches.season, seasonId))
    await db.delete(scoreSheets).where(eq(scoreSheets.season_id, seasonId))
    await db.delete(teams).where(eq(teams.season, seasonId))
    await db
        .delete(individual_divisions)
        .where(eq(individual_divisions.season, seasonId))
    await db.delete(seasonEvents).where(eq(seasonEvents.season_id, seasonId))
    await db.delete(seasons).where(eq(seasons.id, seasonId))
})

test.describe("score sheet drafts", () => {
    test.use({ storageState: PERSONAS.admin.storageState })

    test("a photo's reading fills the form and still needs saving", async ({
        page
    }) => {
        await page.goto("/dashboard/enter-scores")
        await expect(
            page.getByRole("heading", { name: "Enter Scores" })
        ).toBeVisible()

        // The reading is offered, not applied
        await expect(page.getByText("Read from a photo")).toBeVisible()
        await expect(page.getByText("need").first()).toBeVisible()

        const game1 = page.locator("tr").filter({ hasText: "Game 1 Score" })
        await expect(game1.getByRole("spinbutton").nth(0)).toHaveValue("")

        await page.getByRole("button", { name: "Fill in" }).click()

        await expect(game1.getByRole("spinbutton").nth(0)).toHaveValue("25")
        await expect(game1.getByRole("spinbutton").nth(1)).toHaveValue("19")
        const totals = page.locator("tr").filter({ hasText: "Total Games Won" })
        await expect(totals.getByRole("spinbutton").nth(0)).toHaveValue("2")

        // Nothing is written until the admin says so
        const [before] = await db
            .select({ home: matches.home_set1_score })
            .from(matches)
            .where(eq(matches.id, matchId))
        expect(before.home).toBeNull()

        await page
            .getByRole("button", { name: `Save Division ${divisionName}` })
            .click()
        await expect(
            page.getByText("Saved scores for 1 match(es).")
        ).toBeVisible({ timeout: 20_000 })

        const [after] = await db
            .select({
                home1: matches.home_set1_score,
                away1: matches.away_set1_score,
                winner: matches.winner
            })
            .from(matches)
            .where(eq(matches.id, matchId))
        expect(after.home1).toBe(25)
        expect(after.away1).toBe(19)
        expect(after.winner).toBe(sharksId)
    })
})
