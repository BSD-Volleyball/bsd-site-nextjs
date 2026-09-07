import { expect, test } from "@playwright/test"
import { desc, eq } from "drizzle-orm"
import { db } from "@/database/db"
import { seasons, sponsors, sponsorships, users } from "@/database/schema"
import { PERSONAS } from "./helpers"

// Sponsors: an admin records that a business (with a player as contact)
// owes a season sponsorship; the contact sees a card and a pay/manage page;
// once paid (here: marked paid by the admin, since the Square card iframe is
// out of e2e scope) the business appears on /sponsors and the homepage.

let sponsorId: number
let sponsorshipId: number

test.beforeAll(async () => {
    const [season] = await db
        .select({ id: seasons.id })
        .from(seasons)
        .orderBy(desc(seasons.id))
        .limit(1)
    const [contact] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, PERSONAS.player.email))
    const [sponsor] = await db
        .insert(sponsors)
        .values({
            name: "Bravo Bakery",
            website: "https://bravo.example",
            blurb: "Fresh bread for hungry hitters",
            contact_user: contact.id
        })
        .returning()
    sponsorId = sponsor.id
    const [sponsorship] = await db
        .insert(sponsorships)
        .values({ sponsor_id: sponsorId, season: season.id, amount: "500.00" })
        .returning()
    sponsorshipId = sponsorship.id
})

test.afterAll(async () => {
    await db.delete(sponsorships).where(eq(sponsorships.id, sponsorshipId))
    await db.delete(sponsors).where(eq(sponsors.id, sponsorId))
})

test.describe("while payment is pending", () => {
    test("the public sponsors page does not list the unpaid sponsor", async ({
        page
    }) => {
        await page.goto("/sponsors")
        await expect(
            page.getByRole("heading", { name: "Our Sponsors" })
        ).toBeVisible()
        await expect(page.getByText(/coming soon/i)).toBeVisible()
        await expect(page.getByText("Bravo Bakery")).toHaveCount(0)
    })

    test.describe("as the sponsor contact", () => {
        test.use({ storageState: PERSONAS.player.storageState })

        test("the dashboard card leads to the pay/manage page", async ({
            page
        }) => {
            await page.goto("/dashboard")
            await expect(
                page.getByText("Sponsorship Payment Due")
            ).toBeVisible()
            await page
                .getByRole("link", { name: "Pay & manage details" })
                .click()
            await expect(page).toHaveURL(/\/dashboard\/sponsorship$/)
            await expect(
                page.getByRole("heading", { name: /Bravo Bakery/ })
            ).toBeVisible()
            await expect(page.getByText("Amount due")).toBeVisible()
            await expect(
                page.getByText("$500.00", { exact: true })
            ).toBeVisible()
        })

        test("can save business details", async ({ page }) => {
            await page.goto("/dashboard/sponsorship")
            const blurb = page.getByLabel(/Short blurb/)
            await blurb.fill("Fresh bread and strong coffee")
            await page.getByRole("button", { name: "Save details" }).click()
            await expect(page.getByText("Details saved.")).toBeVisible()
            const [row] = await db
                .select({ blurb: sponsors.blurb })
                .from(sponsors)
                .where(eq(sponsors.id, sponsorId))
            expect(row.blurb).toBe("Fresh bread and strong coffee")
        })
    })

    test.describe("as an admin", () => {
        test.use({ storageState: PERSONAS.admin.storageState })

        test("Manage Sponsors lists the pending sponsorship and can mark it paid", async ({
            page
        }) => {
            await page.goto("/dashboard/manage-sponsors")
            await expect(
                page.getByRole("heading", { name: "Manage Sponsors" })
            ).toBeVisible()
            const row = page.getByRole("row").filter({
                hasText: "Bravo Bakery"
            })
            await expect(row).toBeVisible()
            await expect(row.getByText("Pending")).toBeVisible()
            await expect(row.getByText("Pat Player")).toBeVisible()

            await row.getByTitle("Mark as paid").click()
            await page.getByLabel("Note").fill("check #1042")
            await page.getByRole("button", { name: "Mark Paid" }).click()

            await expect(row.getByText("Paid", { exact: true })).toBeVisible()
            await expect(row.getByText("check #1042")).toBeVisible()
            const [saved] = await db
                .select({
                    status: sponsorships.status,
                    method: sponsorships.payment_method,
                    note: sponsorships.paid_note
                })
                .from(sponsorships)
                .where(eq(sponsorships.id, sponsorshipId))
            expect(saved).toEqual({
                status: "paid",
                method: "manual",
                note: "check #1042"
            })
        })
    })
})

test.describe("once paid", () => {
    test("the sponsor appears on /sponsors and the homepage strip", async ({
        page
    }) => {
        await page.goto("/sponsors")
        await expect(
            page.getByRole("heading", { name: "Bravo Bakery" })
        ).toBeVisible()
        await expect(
            page.getByText("Fresh bread and strong coffee")
        ).toBeVisible()
        await expect(
            page.getByRole("link", { name: /Visit website/ })
        ).toHaveAttribute("href", "https://bravo.example")

        await page.goto("/?stay=1")
        await expect(page.getByText(/Thanks to our .* sponsors/)).toBeVisible()
        await expect(
            page.getByRole("link", { name: "Bravo Bakery" })
        ).toBeVisible()
    })

    test.describe("as the sponsor contact", () => {
        test.use({ storageState: PERSONAS.player.storageState })

        test("the dashboard card thanks them", async ({ page }) => {
            await page.goto("/dashboard")
            await expect(
                page.getByText("Thank You for Sponsoring!")
            ).toBeVisible()
        })
    })

    test.describe("as a non-contact", () => {
        test.use({ storageState: PERSONAS.captain.storageState })

        test("has no card and is redirected off the sponsorship page", async ({
            page
        }) => {
            await page.goto("/dashboard")
            await expect(page.getByText(/Sponsorship/)).toHaveCount(0)
            await page.goto("/dashboard/sponsorship")
            await page.waitForURL(
                (url) => !url.pathname.includes("sponsorship")
            )
            await expect(page).toHaveURL(/\/dashboard$/)
        })
    })
})
