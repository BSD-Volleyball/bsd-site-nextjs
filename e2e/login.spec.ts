import { expect, test } from "@playwright/test"
import { PERSONAS } from "./helpers"

test("a player can log in with email and password", async ({ page }) => {
    await page.goto("/auth/sign-in")

    await page.getByLabel("Email").fill(PERSONAS.player.email)
    await page
        .getByLabel("Password", { exact: true })
        .fill(PERSONAS.player.password)
    await page.getByRole("button", { name: /^(login|sign in)$/i }).click()

    // Auth redirect completes, then the dashboard must accept the session
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"))
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/dashboard/)
})

test("a wrong password is rejected", async ({ page }) => {
    await page.goto("/auth/sign-in")

    await page.getByLabel("Email").fill(PERSONAS.player.email)
    await page.getByLabel("Password", { exact: true }).fill("wrong-password")
    await page.getByRole("button", { name: /^(login|sign in)$/i }).click()

    // Stays on the sign-in page; no session is created
    await expect(page).toHaveURL(/\/auth\/sign-in/)
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/auth\/sign-in/)
})
