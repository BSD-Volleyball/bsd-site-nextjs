import { expect, test } from "@playwright/test"
import { and, eq } from "drizzle-orm"
import { db } from "@/database/db"
import {
    divisions,
    tournamentDivisions,
    tournaments,
    tournamentWaitlist,
    users,
    waiverAcceptances
} from "@/database/schema"
import { PERSONAS } from "./helpers"

// Player signup (waiver acceptance) stays open after team registration
// closes — through the end of tournament day — so captains can still add
// waiver-cleared players to rosters.

function isoDateET(offsetDays: number): string {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    // en-CA formats as YYYY-MM-DD
    return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" })
}

let tournamentId: number

test.beforeAll(async () => {
    const [division] = await db.select().from(divisions).limit(1)
    const [t] = await db
        .insert(tournaments)
        .values({
            code: "e2e-closed-reg",
            year: new Date().getFullYear(),
            name: "E2E Closed Registration Tournament",
            // Team registration is closed, tournament day is still ahead
            phase: "prepare_for_tournament",
            tournament_date: isoDateET(3),
            tournament_type: "coed",
            pool_size: 4,
            elimination_format: "single",
            cost: "120"
        })
        .returning({ id: tournaments.id })
    tournamentId = t.id
    await db.insert(tournamentDivisions).values({
        tournament_id: tournamentId,
        division_id: division.id,
        team_count: 8,
        male_per_team: 4,
        non_male_per_team: 2,
        sort_order: 0
    })
})

test.afterAll(async () => {
    // Waitlist rows cascade with the tournament
    await db.delete(tournaments).where(eq(tournaments.id, tournamentId))
})

test.describe("player signup after team registration closes", () => {
    test.use({ storageState: PERSONAS.player.storageState })
    test.describe.configure({ mode: "serial" })

    test("dashboard offers waiver signup and records acceptance", async ({
        page
    }) => {
        await page.goto("/dashboard")
        await expect(
            page.getByText("Team registration is closed, but you can still")
        ).toBeVisible()
        // Sidebar link is gated on canPlayerSignUp, not team registration
        await expect(
            page.getByRole("link", { name: "Sign Up as a Player" })
        ).toBeVisible()

        await page.getByRole("button", { name: "Sign Up as a Player" }).click()
        await page.waitForURL(/tournament-waitlist/)

        await page
            .getByRole("button", { name: "Sign Up & Accept Waiver" })
            .click()
        await expect(page.getByText("E2E waiver terms")).toBeVisible()
        await page
            .getByRole("checkbox", {
                name: "I have read and agree to the waiver."
            })
            .check()
        await page.getByRole("button", { name: "Sign Up", exact: true }).click()
        await expect(
            page.getByText("Thanks for signing up to play").first()
        ).toBeVisible()

        // The acceptance and waitlist rows exist for the player
        const [player] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, PERSONAS.player.email))
        const acceptances = await db
            .select()
            .from(waiverAcceptances)
            .where(eq(waiverAcceptances.user_id, player.id))
        expect(acceptances.length).toBe(1)
        const waitlistRows = await db
            .select()
            .from(tournamentWaitlist)
            .where(
                and(
                    eq(tournamentWaitlist.tournament_id, tournamentId),
                    eq(tournamentWaitlist.user_id, player.id)
                )
            )
        expect(waitlistRows.length).toBe(1)
    })

    test("waitlist page closes once tournament day has passed", async ({
        page
    }) => {
        await db
            .update(tournaments)
            .set({ tournament_date: isoDateET(-1) })
            .where(eq(tournaments.id, tournamentId))

        await page.goto("/dashboard/tournament-waitlist")
        await page.waitForURL((url) => url.pathname === "/dashboard")
    })
})
