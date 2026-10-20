import { expect, test } from "@playwright/test"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/database/db"
import { seasons, users, waitlist } from "@/database/schema"
import { addToWaitlist } from "@/test/factories"
import { PERSONAS } from "./helpers"

// Once registration closes the sidebar link and dashboard CTAs disappear,
// but /dashboard/pay-season is still reachable by URL. The page must say
// registration is closed instead of showing a wizard (card form included)
// whose payment the server would refuse — except for a player an admin
// approved off the waitlist, who is exactly who the page is for then.

let playerId: string
let seasonId: number
let originalPhase: typeof seasons.$inferSelect.phase

test.beforeAll(async () => {
    const [player] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, PERSONAS.player.email))
    playerId = player.id

    const [season] = await db
        .select({ id: seasons.id, phase: seasons.phase })
        .from(seasons)
        .orderBy(desc(seasons.id))
        .limit(1)
    seasonId = season.id
    originalPhase = season.phase

    await db
        .update(seasons)
        .set({ phase: "playoffs" })
        .where(eq(seasons.id, seasonId))
})

test.afterAll(async () => {
    // Later spec files expect the baseline registration_open season and a
    // player persona with no waitlist row.
    await db
        .delete(waitlist)
        .where(and(eq(waitlist.season, seasonId), eq(waitlist.user, playerId)))
    await db
        .update(seasons)
        .set({ phase: originalPhase })
        .where(eq(seasons.id, seasonId))
})

test.describe("season sign-up page after registration closes", () => {
    test.use({ storageState: PERSONAS.player.storageState })
    test.describe.configure({ mode: "serial" })

    test("shows a closed notice and no wizard", async ({ page }) => {
        await page.goto("/dashboard/pay-season")
        await expect(
            page.getByRole("heading", { name: /registration .* is closed/i })
        ).toBeVisible()
        await expect(
            page.getByRole("link", { name: "Go to Dashboard" })
        ).toBeVisible()
        await expect(
            page.getByRole("button", { name: "Next", exact: true })
        ).toHaveCount(0)
    })

    test("still shows the wizard to an approved waitlister", async ({
        page
    }) => {
        await addToWaitlist({
            season: seasonId,
            user: playerId,
            approved: true
        })
        await page.goto("/dashboard/pay-season")
        await expect(
            page.getByRole("button", { name: "Next", exact: true })
        ).toBeVisible()
        await expect(
            page.getByRole("heading", { name: /is closed/i })
        ).toHaveCount(0)
    })
})
