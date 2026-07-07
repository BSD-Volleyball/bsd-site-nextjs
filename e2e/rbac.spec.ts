import { expect, test } from "@playwright/test"
import { PERSONAS } from "./helpers"

test.describe("plain players", () => {
    test.use({ storageState: PERSONAS.player.storageState })

    test("are redirected away from admin pages", async ({ page }) => {
        await page.goto("/dashboard/manage-roles")
        // requireAdminOrRedirect sends non-admins back to the dashboard
        await page.waitForURL((url) => !url.pathname.includes("manage-roles"))
        await expect(page).toHaveURL(/\/dashboard$/)
    })
})

test.describe("admins", () => {
    test.use({ storageState: PERSONAS.admin.storageState })

    test("can open the manage-roles page", async ({ page }) => {
        await page.goto("/dashboard/manage-roles")
        await expect(page).toHaveURL(/manage-roles/)
        await expect(page.getByText("Manage Roles").first()).toBeVisible()
    })

    test("can open the season-config page", async ({ page }) => {
        await page.goto("/dashboard/season-config")
        await expect(page).toHaveURL(/season-config/)
    })
})
