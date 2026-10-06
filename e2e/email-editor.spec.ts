import { expect, test } from "@playwright/test"
import { PERSONAS } from "./helpers"

// The Lexical editor behind Send Email and Edit Emails had no browser
// coverage; this drives typing, a list, and a template variable through to
// the server-rendered preview, so a Lexical upgrade that breaks editing or
// node serialization fails here rather than in front of an admin.
test.use({ storageState: PERSONAS.admin.storageState })

test("composes a message with a list and a variable and previews it", async ({
    page
}) => {
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))

    await page.goto("/dashboard/send-email")

    await page.locator("#send-to-select").click()
    await page.getByRole("option", { name: /Just Me/ }).click()
    await page.locator("#email-subject").fill("Editor check")

    const editor = page.locator('[contenteditable="true"]').first()
    await editor.click()
    await page.keyboard.type("Hello team, welcome to ")
    await page
        .getByLabel("Insert variable")
        .selectOption({ value: "season_name" })
    await editor.click()
    await page.keyboard.press("End")
    await page.keyboard.type("!")
    await page.keyboard.press("Enter")
    await page.getByLabel("Bullet List").click()
    await page.keyboard.type("Bring water")

    await expect(editor.locator("li")).toHaveText("Bring water")

    await page.getByRole("button", { name: "Preview" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toContainText("Hello team, welcome to")
    await expect(dialog.locator("li")).toHaveText("Bring water")
    // The variable resolved to the season's name rather than "[season_name]".
    await expect(dialog).not.toContainText("[season_name]")

    expect(errors).toEqual([])
})
