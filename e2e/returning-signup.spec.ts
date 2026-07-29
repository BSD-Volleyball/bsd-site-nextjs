import { expect, test } from "@playwright/test"
import { asc, desc, eq } from "drizzle-orm"
import { db } from "@/database/db"
import {
    discounts,
    drafts,
    seasonEvents,
    seasons,
    signups,
    userUnavailability,
    users,
    waiverAcceptances
} from "@/database/schema"
import { createDiscount, createDivision, createTeam } from "@/test/factories"
import { PERSONAS } from "./helpers"

// Returning-player signup: the week 1 tryout renders as a positive
// "Opt-in to Evaluations" checkbox whose stored representation is
// INVERTED (unchecked = a user_unavailability row for the week 1 event).
// These tests prove the inversion round-trips to the database correctly.
//
// Uses the dedicated "returning" persona so the shared player persona
// keeps the no-draft-history state other specs expect.

let userId: string
let seasonId: number
let week1EventId: number

test.beforeAll(async () => {
    const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, PERSONAS.returning.email))
    userId = user.id

    const [season] = await db
        .select({ id: seasons.id })
        .from(seasons)
        .orderBy(desc(seasons.id))
        .limit(1)
    seasonId = season.id

    const [week1] = await db
        .select({ id: seasonEvents.id })
        .from(seasonEvents)
        .where(eq(seasonEvents.event_type, "tryout"))
        .orderBy(asc(seasonEvents.sort_order))
        .limit(1)
    week1EventId = week1.id

    // Any drafts row makes this a returning player. Guard so worker
    // restarts on CI retries don't create duplicate fixtures.
    const [existingDraft] = await db
        .select({ id: drafts.id })
        .from(drafts)
        .where(eq(drafts.user, userId))
        .limit(1)
    if (!existingDraft) {
        const division = await createDivision({
            name: "E2E Returning",
            level: 9
        })
        const team = await createTeam({
            season: seasonId,
            captain: userId,
            division: division.id
        })
        await db
            .insert(drafts)
            .values({ team: team.id, user: userId, round: 1, overall: 99 })
    }
})

async function cleanupSignupState() {
    await db
        .delete(userUnavailability)
        .where(eq(userUnavailability.user_id, userId))
    await db.delete(signups).where(eq(signups.player, userId))
    await db
        .delete(waiverAcceptances)
        .where(eq(waiverAcceptances.user_id, userId))
    await db.delete(discounts).where(eq(discounts.user, userId))
}

test.afterAll(async () => {
    await cleanupSignupState()
})

// Mirrors free-signup.spec's pacing: assert visible content between steps
// so clicks land after each tab has rendered (CI runners cold-compile
// routes, so racing ahead of hydration flakes there).
async function completeWizard(
    page: import("@playwright/test").Page,
    { optIn }: { optIn: boolean }
) {
    await page.goto("/dashboard/pay-season")
    await expect(
        page.getByRole("heading", { name: "Season Registration" })
    ).toBeVisible()

    // Info tab: keep defaults
    await expect(page.getByText("Interested in being a Captain?")).toBeVisible()
    await page.getByRole("button", { name: "Next", exact: true }).click()

    // Pairing tab: no pair request
    await expect(
        page.getByText("Request to pair for the season:")
    ).toBeVisible()
    await page.getByRole("button", { name: "Next", exact: true }).click()

    // Schedule tab: the returning presentation shows the opt-in checkbox,
    // unchecked by default (= sitting out week 1)
    const optInBox = page.getByRole("checkbox", {
        name: "Opt-in to Evaluations"
    })
    await expect(optInBox).toBeVisible()
    await expect(optInBox).not.toBeChecked()
    if (optIn) {
        await optInBox.check()
    }
    await page.getByRole("button", { name: "Next", exact: true }).click()

    // Waivers tab
    await expect(page.getByText("E2E waiver terms")).toBeVisible()
    await page.getByRole("checkbox", { name: "I Agree" }).check()
    await page.getByRole("button", { name: "Next", exact: true }).click()

    // Payment tab: fully covered by the discount
    await expect(
        page.getByText("Your registration is fully covered!")
    ).toBeVisible()
    await page
        .getByRole("button", { name: "Complete Free Registration" })
        .click()
    // The success card is transient: on success the wizard fires
    // router.refresh(), and the refreshed page's already-registered branch
    // replaces the wizard entirely. On slow CI runners that swap can land
    // before the visibility poller ever observes the card, so accept either
    // terminal state — the DB assertions afterwards are the real proof.
    await expect(
        page
            .getByText("Registration Complete!", { exact: true })
            .or(page.getByRole("heading", { name: /already registered/i }))
    ).toBeVisible({ timeout: 20_000 })
}

test.describe("returning player week 1 opt-in", () => {
    test.use({ storageState: PERSONAS.returning.storageState })
    test.describe.configure({ mode: "serial" })

    test("default (not opted in) writes a week 1 unavailability row", async ({
        page
    }) => {
        // Start from a clean slate so CI retries don't inherit a partial
        // signup from a failed earlier attempt
        await cleanupSignupState()
        await createDiscount({ user: userId })
        await completeWizard(page, { optIn: false })

        const rows = await db
            .select({ eventId: userUnavailability.event_id })
            .from(userUnavailability)
            .where(eq(userUnavailability.user_id, userId))
        expect(rows.map((r) => r.eventId)).toContain(week1EventId)
    })

    test("opting in writes NO week 1 unavailability row", async ({ page }) => {
        await cleanupSignupState()
        await createDiscount({ user: userId })
        await completeWizard(page, { optIn: true })

        const [signup] = await db
            .select({ id: signups.id })
            .from(signups)
            .where(eq(signups.player, userId))
        expect(signup).toBeDefined()

        const rows = await db
            .select({ eventId: userUnavailability.event_id })
            .from(userUnavailability)
            .where(eq(userUnavailability.user_id, userId))
        expect(rows).toHaveLength(0)
    })
})
