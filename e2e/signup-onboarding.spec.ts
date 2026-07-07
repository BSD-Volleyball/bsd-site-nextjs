import { expect, test } from "@playwright/test"

// Fresh signup through the real UI: better-auth email/password with the
// custom first/last name fields, then the onboarding gate must catch the
// new (incomplete) account and route it into onboarding.

test("a new user can sign up and is routed into onboarding", async ({
    page
}) => {
    await page.goto("/auth/sign-up")

    await page.getByLabel("First Name").fill("Fresh")
    await page.getByLabel("Last Name").fill("Newcomer")
    await page.getByLabel("Email").fill("e2e-fresh@example.test")
    await page.getByLabel("Password", { exact: true }).fill("fresh-password-1")
    await page.getByRole("button", { name: /create an account/i }).click()

    await page.waitForURL("**/onboarding/**")
    expect(page.url()).toContain("/onboarding/")
})

test("an onboarded user is not sent back to onboarding", async ({
    browser
}) => {
    const context = await browser.newContext({
        storageState: "e2e/.auth/player.json"
    })
    const page = await context.newPage()

    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/dashboard/)

    await context.close()
})
