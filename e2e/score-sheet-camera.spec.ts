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
import {
    createMatch,
    createSeason,
    createSeasonEvent,
    createTeam
} from "@/test/factories"
import { PERSONAS } from "./helpers"

// The camera button is the phone path: an admin walks the courts at the end
// of the night photographing each sheet. It cannot be exercised headlessly,
// so this asserts the wiring a phone depends on — that the control exists and
// that its input asks the browser for the rear camera, one photo at a time.

function todayUTC(): string {
    return new Date().toISOString().split("T")[0]
}

const NIGHT = todayUTC()
let seasonId: number

test.beforeAll(async () => {
    const [division] = await db.select().from(divisions).limit(1)
    const [captain] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, PERSONAS.captain.email))

    const season = await createSeason({
        code: "E2ECAM",
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
    const team = await createTeam({
        season: seasonId,
        division: division.id,
        captain: captain.id,
        name: "Camera Test"
    })
    await createMatch({
        season: seasonId,
        division: division.id,
        week: 1,
        date: NIGHT,
        time: "19:00",
        court: division.level,
        home_team: team.id
    })
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

test.describe("score sheet photo capture", () => {
    test.use({ storageState: PERSONAS.admin.storageState })

    test("offers a camera button alongside the desktop drop zone", async ({
        page
    }) => {
        await page.goto("/dashboard/score-sheet-inbox")
        await expect(
            page.getByRole("heading", { name: "Score Sheet Photos" })
        ).toBeVisible()

        await expect(
            page.getByRole("button", { name: "Take a photo" })
        ).toBeVisible()
        await expect(
            page.getByText("Or drop tonight's photos here")
        ).toBeVisible()

        // The camera input must ask for the rear camera and take one photo:
        // `capture` is what opens the camera rather than a file browser, and
        // it does not combine with multiple selection.
        const camera = page.locator('input[capture="environment"]')
        await expect(camera).toHaveCount(1)
        await expect(camera).toHaveAttribute("accept", "image/*")
        expect(await camera.getAttribute("multiple")).toBeNull()

        // The desktop picker stays multi-select and has no capture attribute
        const picker = page.locator('input[type="file"]:not([capture])')
        await expect(picker).toHaveCount(1)
        expect(await picker.getAttribute("multiple")).not.toBeNull()
    })

    test("works at phone width", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto("/dashboard/score-sheet-inbox")

        const button = page.getByRole("button", { name: "Take a photo" })
        await expect(button).toBeVisible()

        // Comfortably tappable and not pushed off-screen
        const box = await button.boundingBox()
        expect(box).not.toBeNull()
        if (!box) return
        expect(box.height).toBeGreaterThanOrEqual(36)
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(390)
    })
})
