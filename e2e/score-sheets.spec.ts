import { readFileSync } from "node:fs"
import { expect, test } from "@playwright/test"
import { eq } from "drizzle-orm"
import { PDFDocument } from "pdf-lib"
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
import {
    createMatch,
    createSeason,
    createSeasonEvent,
    createTeam
} from "@/test/factories"
import { PERSONAS } from "./helpers"

// Printable score sheets: an admin downloads one PDF per night from the
// Coverage page, and the QR code on a sheet deep-links back to score entry
// with that night and court in focus. Seeded on a dedicated season (highest
// id = current) and torn down so later specs see the baseline season again.

function todayUTC(): string {
    return new Date().toISOString().split("T")[0]
}

const NIGHT = todayUTC()

let seasonId: number
let divisionName: string
let courtNumber: number

test.beforeAll(async () => {
    const [division] = await db.select().from(divisions).limit(1)
    divisionName = division.name
    courtNumber = division.level

    const [captain] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, PERSONAS.captain.email))

    const season = await createSeason({
        code: "E2ESHEETS",
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

    const home = await createTeam({
        season: seasonId,
        division: division.id,
        captain: captain.id,
        name: "Sheet Sharks",
        number: 1
    })
    const away = await createTeam({
        season: seasonId,
        division: division.id,
        captain: captain.id,
        name: "Sheet Jets",
        number: 2
    })

    // Two matches on the division's court: one sheet, two match blocks.
    for (const time of ["19:00", "20:10"]) {
        await createMatch({
            season: seasonId,
            division: division.id,
            week: 1,
            date: NIGHT,
            time,
            court: courtNumber,
            home_team: home.id,
            away_team: away.id
        })
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

test.describe("score sheets", () => {
    test.use({ storageState: PERSONAS.admin.storageState })

    test("admin downloads the night's sheets from the Coverage page", async ({
        page
    }) => {
        await page.goto("/dashboard/coverage")
        await expect(
            page.getByRole("heading", { name: "Coverage" })
        ).toBeVisible()

        const downloadPromise = page.waitForEvent("download")
        await page.getByRole("link", { name: "Score sheets" }).first().click()
        const download = await downloadPromise

        expect(download.suggestedFilename()).toBe(`scoresheets-${NIGHT}.pdf`)

        const path = await download.path()
        const bytes = readFileSync(path)
        expect(bytes.subarray(0, 5).toString()).toBe("%PDF-")

        // One page per court, and this night uses exactly one court
        const doc = await PDFDocument.load(bytes)
        expect(doc.getPageCount()).toBe(1)
    })

    test("the sheet's QR link opens score entry focused on that court", async ({
        page
    }) => {
        await page.goto(
            `/dashboard/enter-scores?date=${NIGHT}&court=${courtNumber}&v=1`
        )

        await expect(
            page.getByRole("heading", { name: "Enter Scores" })
        ).toBeVisible()
        await expect(
            page.getByText(`Opened from the Court ${courtNumber} score sheet.`)
        ).toBeVisible()
        await expect(
            page.getByRole("heading", { name: `Division ${divisionName}` })
        ).toBeVisible()
    })
})
