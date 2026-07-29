import { expect, test } from "@playwright/test"
import { desc, eq } from "drizzle-orm"
import { db } from "@/database/db"
import {
    discounts,
    seasons,
    signups,
    userUnavailability,
    users,
    waiverAcceptances,
    waivers
} from "@/database/schema"
import { createDiscount } from "@/test/factories"
import { PERSONAS } from "./helpers"

// Season registration via the 100%-discount path: the pay-season wizard
// skips Square entirely and calls submitFreeSignup, which must write the
// signup + waiver acceptance in one transaction and consume the discount.
// Uses the baseline season (registration_open) and waiver seeded by setup.

let playerId: string
let discountId: number
let seasonId: number

test.beforeAll(async () => {
    const [player] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, PERSONAS.player.email))
    playerId = player.id

    const [season] = await db
        .select({ id: seasons.id })
        .from(seasons)
        .orderBy(desc(seasons.id))
        .limit(1)
    seasonId = season.id

    // 100% season discount (factory defaults) for the player persona
    const discount = await createDiscount({ user: playerId })
    discountId = discount.id
})

test.afterAll(async () => {
    // Leave the shared personas/season exactly as later spec files expect
    // them: no signup, no waiver acceptance, no leftover discount.
    await db
        .delete(userUnavailability)
        .where(eq(userUnavailability.user_id, playerId))
    await db.delete(signups).where(eq(signups.player, playerId))
    await db
        .delete(waiverAcceptances)
        .where(eq(waiverAcceptances.user_id, playerId))
    await db.delete(discounts).where(eq(discounts.id, discountId))
})

test.describe("free season signup (100% discount)", () => {
    test.use({ storageState: PERSONAS.player.storageState })
    test.describe.configure({ mode: "serial" })

    test("wizard completes without payment and records the signup", async ({
        page
    }) => {
        await page.goto("/dashboard/pay-season")
        await expect(
            page.getByRole("heading", { name: "Season Registration" })
        ).toBeVisible()

        // Info tab: keep defaults (age 20+, not a captain)
        await page.getByRole("button", { name: "Next", exact: true }).click()

        // Pairing tab: no pair request
        await expect(
            page.getByText("Request to pair for the season:")
        ).toBeVisible()
        await page.getByRole("button", { name: "Next", exact: true }).click()

        // Schedule tab: available every date. The week 1 tryout is broken out
        // into its own callout and defaults to unchecked (= attending) for
        // players with no draft history.
        await expect(
            page.getByText("Select which dates you will")
        ).toBeVisible()
        const week1Checkbox = page.getByRole("checkbox", {
            name: /Week 1 tryout/i
        })
        await expect(week1Checkbox).toBeVisible()
        await expect(week1Checkbox).not.toBeChecked()
        await page.getByRole("button", { name: "Next", exact: true }).click()

        // Waivers tab: the active waiver must be shown and agreed to
        await expect(page.getByText("E2E waiver terms")).toBeVisible()
        await page.getByRole("checkbox", { name: "I Agree" }).check()
        await page.getByRole("button", { name: "Next", exact: true }).click()

        // Payment tab: fully covered, no Square card form
        await expect(
            page.getByText("Your registration is fully covered!")
        ).toBeVisible()
        await page
            .getByRole("button", { name: "Complete Free Registration" })
            .click()

        await expect(
            page.getByText("Registration Complete!", { exact: true })
        ).toBeVisible({ timeout: 20_000 })

        // The transaction wrote the signup with the FREE order marker...
        const [signup] = await db
            .select()
            .from(signups)
            .where(eq(signups.player, playerId))
        expect(signup).toBeDefined()
        expect(signup.season).toBe(seasonId)
        expect(signup.order_id).toBe(`FREE-${discountId}`)
        expect(Number(signup.amount_paid)).toBe(0)

        // ...the waiver acceptance for the active waiver...
        const [activeWaiver] = await db
            .select({ id: waivers.id })
            .from(waivers)
            .where(eq(waivers.active, true))
        const acceptances = await db
            .select()
            .from(waiverAcceptances)
            .where(eq(waiverAcceptances.user_id, playerId))
        expect(acceptances.length).toBe(1)
        expect(acceptances[0].waiver_id).toBe(activeWaiver.id)

        // ...and consumed the discount so it can't be reused.
        const [usedDiscount] = await db
            .select({ used: discounts.used })
            .from(discounts)
            .where(eq(discounts.id, discountId))
        expect(usedDiscount.used).toBe(true)
    })

    test("pay-season page shows the registered confirmation afterwards", async ({
        page
    }) => {
        await page.goto("/dashboard/pay-season")
        await expect(
            page.getByText(/You('|’)re already registered/)
        ).toBeVisible()
        // No wizard is offered once registered
        await expect(
            page.getByRole("button", { name: "Complete Free Registration" })
        ).toHaveCount(0)
    })
})
