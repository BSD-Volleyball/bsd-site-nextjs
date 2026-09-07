import { expect, test, type Page } from "@playwright/test"
import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import { playerRatings, seasons, signups, users } from "@/database/schema"
import { createSignup } from "@/test/factories"
import { PERSONAS } from "./helpers"

// Rate Player → "Players I've Rated": every (player, season) the captain has
// rated, newest save first, with a Season filter defaulting to All and the
// Rate button only for current-season signups.

test.use({ storageState: PERSONAS.captain.storageState })

const PLAYER_IDS = ["e2e-rated-alpha", "e2e-rated-bravo", "e2e-rated-charlie"]
let captainId: string
let priorSeasonId: number

test.beforeAll(async () => {
    const [captain] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, PERSONAS.captain.email))
    captainId = captain.id
    const [current] = await db
        .select({ id: seasons.id })
        .from(seasons)
        .orderBy(desc(seasons.id))
        .limit(1)
    // "Current season" is max(seasons.id), so a prior season needs an id
    // below every existing one (this is the isolated e2e database).
    const [lowest] = await db
        .select({ id: seasons.id })
        .from(seasons)
        .orderBy(asc(seasons.id))
        .limit(1)
    const [prior] = await db
        .insert(seasons)
        .values({
            id: lowest.id - 1,
            code: "E2E-RATED-PRIOR",
            year: 2025,
            season: "spring",
            phase: "complete",
            max_players: 0
        })
        .returning({ id: seasons.id })
    priorSeasonId = prior.id

    const seed = [
        ["e2e-rated-alpha", "Alpha"],
        ["e2e-rated-bravo", "Bravo"],
        ["e2e-rated-charlie", "Charlie"]
    ] as const
    for (const [id, last] of seed) {
        await db.insert(users).values({
            id,
            first_name: "Rated",
            last_name: last,
            email: `${id}@example.test`,
            male: true,
            onboarding_completed: true
        })
    }
    await createSignup({ season: current.id, player: "e2e-rated-alpha" })
    await createSignup({ season: current.id, player: "e2e-rated-charlie" })

    const rate = (
        player: string,
        season: number,
        overall: number,
        at: string
    ) =>
        db.insert(playerRatings).values({
            evaluator: captainId,
            player,
            season,
            overall,
            updated_at: new Date(at)
        })
    await rate("e2e-rated-alpha", current.id, 7, "2026-09-01T12:00:00Z")
    await rate("e2e-rated-charlie", current.id, 8, "2026-08-20T12:00:00Z")
    await rate("e2e-rated-charlie", priorSeasonId, 6, "2025-03-12T12:00:00Z")
    await rate("e2e-rated-bravo", priorSeasonId, 5, "2025-03-10T12:00:00Z")
})

test.afterAll(async () => {
    await db
        .delete(playerRatings)
        .where(
            and(
                eq(playerRatings.evaluator, captainId),
                inArray(playerRatings.player, PLAYER_IDS)
            )
        )
    await db.delete(signups).where(inArray(signups.player, PLAYER_IDS))
    await db.delete(users).where(inArray(users.id, PLAYER_IDS))
    await db.delete(seasons).where(eq(seasons.id, priorSeasonId))
})

async function seededRows(page: Page) {
    const rows = page.locator("tbody tr").filter({ hasText: "Rated " })
    const out: { name: string; season: string; canRate: boolean }[] = []
    for (const row of await rows.all()) {
        const cells = row.locator("td")
        out.push({
            name: (await cells.nth(3).innerText()).trim(),
            season: (await cells.nth(4).innerText()).trim(),
            canRate:
                (await row.getByRole("button", { name: "Rate" }).count()) > 0
        })
    }
    return out
}

test("lists rated players newest first with a Season filter", async ({
    page
}) => {
    await page.goto("/dashboard/rate-player")
    await page.locator("#lookup_type").click()
    const options = page.getByRole("option")
    await expect(options.last()).toHaveText("Players I've Rated")
    await options.last().click()

    await expect(page.locator("#rated_season")).toHaveText("All")
    await expect
        .poll(() => seededRows(page))
        .toEqual([
            { name: "Rated Alpha", season: "Fall 2026", canRate: true },
            { name: "Rated Charlie", season: "Fall 2026", canRate: true },
            { name: "Rated Charlie", season: "Spring 2025", canRate: true },
            { name: "Rated Bravo", season: "Spring 2025", canRate: false }
        ])

    await page.locator("#rated_season").click()
    await page.getByRole("option", { name: "Spring 2025" }).click()
    await expect
        .poll(() => seededRows(page))
        .toEqual([
            { name: "Rated Charlie", season: "Spring 2025", canRate: true },
            { name: "Rated Bravo", season: "Spring 2025", canRate: false }
        ])

    await page.locator("#player_search").fill("bravo")
    await expect
        .poll(async () => (await seededRows(page)).map((r) => r.name))
        .toEqual(["Rated Bravo"])
})
