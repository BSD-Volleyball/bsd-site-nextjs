import { expect, test } from "@playwright/test"
import { PERSONAS } from "./helpers"

test("a logged-out visitor sees the marketing homepage", async ({ page }) => {
    await page.goto("/")
    await expect(page).not.toHaveURL(/\/dashboard/)
    await expect(
        page.getByRole("heading", { level: 1, name: /bump set drink/i })
    ).toBeVisible()
})

test.describe("as a signed-in player", () => {
    test.use({ storageState: PERSONAS.player.storageState })

    test("the homepage redirects to the dashboard", async ({ page }) => {
        await page.goto("/")
        await expect(page).toHaveURL(/\/dashboard/)
    })

    test("?stay=1 keeps the marketing homepage visible", async ({ page }) => {
        await page.goto("/?stay=1")
        await expect(page).not.toHaveURL(/\/dashboard/)
        await expect(
            page.getByRole("heading", { level: 1, name: /bump set drink/i })
        ).toBeVisible()
    })
})
