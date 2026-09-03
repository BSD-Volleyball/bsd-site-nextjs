import { expect, test, type Locator, type Page } from "@playwright/test"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import {
    draftHomework,
    drafts,
    individual_divisions,
    signups,
    teams,
    users
} from "@/database/schema"
import {
    CONSIDERING,
    playerName,
    seedBoard,
    type Seeded
} from "./draft-homework-board"
import { PERSONAS } from "./helpers"

// Captain draft homework board: when a player on the board has been
// drafted, "Remove drafted & shift up" drops them and everyone ranked
// below moves up one slot (rounds and Considering are one ranked list),
// and any filled slot can be dragged to a new position.

let seeded: Seeded

test.beforeAll(async () => {
    seeded = await seedBoard()
})

test.afterAll(async () => {
    await db.delete(drafts).where(eq(drafts.team, seeded.teamId))
    await db
        .delete(draftHomework)
        .where(eq(draftHomework.captain, seeded.captainId))
    await db.delete(teams).where(eq(teams.id, seeded.teamId))
    await db
        .delete(individual_divisions)
        .where(
            and(
                eq(individual_divisions.season, seeded.seasonId),
                eq(individual_divisions.division, seeded.divisionId)
            )
        )
    await db.delete(signups).where(inArray(signups.player, seeded.userIds))
    await db.delete(users).where(inArray(users.id, seeded.userIds))
})

function roundGroup(page: Page, label: string): Locator {
    return page
        .getByRole("tabpanel")
        .locator("div.mb-4")
        .filter({ has: page.getByText(label, { exact: true }) })
}

async function slotNames(group: Locator): Promise<string[]> {
    const texts = await group.getByRole("combobox").allInnerTexts()
    // Labels carry an auto-assigned "[old_id] " prefix; compare names only
    return texts.map((t) => t.trim().replace(/^\[\d+\]\s*/, ""))
}

async function expectBoard(
    page: Page,
    expected: { round1: string[]; round2: string[]; considering: string[] }
) {
    await expect
        .poll(() => slotNames(roundGroup(page, "Round 1")))
        .toEqual(expected.round1)
    await expect
        .poll(() => slotNames(roundGroup(page, "Round 2")))
        .toEqual(expected.round2)
    await expect
        .poll(() => slotNames(roundGroup(page, "Considering")))
        .toEqual(expected.considering)
}

async function savedMaleBoard() {
    const rows = await db
        .select({
            round: draftHomework.round,
            slot: draftHomework.slot,
            player: draftHomework.player
        })
        .from(draftHomework)
        .where(
            and(
                eq(draftHomework.captain, seeded.captainId),
                eq(draftHomework.is_male_tab, true)
            )
        )
    return rows
        .sort((a, b) => a.round - b.round || a.slot - b.slot)
        .map((r) => `${r.round}-${r.slot}:${r.player}`)
}

test.describe("draft homework shift-up and drag reorder", () => {
    test.use({ storageState: PERSONAS.captain.storageState })
    test.describe.configure({ mode: "serial" })

    test("removing a drafted player shifts everyone below up one slot", async ({
        page
    }) => {
        await page.goto("/dashboard/draft-homework")
        await expect(
            page.getByRole("heading", { name: "Draft Homework" })
        ).toBeVisible()

        await expect(
            page.getByText(
                `1 player on this board has been drafted: ${playerName(2)}`
            )
        ).toBeVisible()
        await expectBoard(page, {
            round1: [playerName(1), playerName(2)],
            round2: [playerName(3), playerName(4)],
            considering: [playerName(5), playerName(6)]
        })

        await page
            .getByRole("button", { name: "Remove drafted & shift up" })
            .click()

        await expect(
            page.getByText("has been drafted", { exact: false })
        ).toHaveCount(0)
        await expectBoard(page, {
            round1: [playerName(1), playerName(3)],
            round2: [playerName(4), playerName(5)],
            considering: [playerName(6)]
        })

        await page.getByRole("button", { name: "Update" }).click()
        await expect(
            page.getByText("Draft homework saved successfully!")
        ).toBeVisible()

        const p = seeded.playerIds
        expect(await savedMaleBoard()).toEqual([
            `1-0:${p[0]}`,
            `1-1:${p[2]}`,
            `2-0:${p[3]}`,
            `2-1:${p[4]}`,
            `${CONSIDERING}-0:${p[5]}`
        ])
    })

    test("dragging a player to a higher slot shifts the players in between down", async ({
        page
    }) => {
        await page.goto("/dashboard/draft-homework")
        await expectBoard(page, {
            round1: [playerName(1), playerName(3)],
            round2: [playerName(4), playerName(5)],
            considering: [playerName(6)]
        })

        const handle = roundGroup(page, "Considering")
            .getByRole("listitem")
            .first()
            .getByRole("button", { name: "Drag to reorder" })
        const target = roundGroup(page, "Round 1").getByRole("listitem").first()
        await handle.dragTo(target)

        await expectBoard(page, {
            round1: [playerName(6), playerName(1)],
            round2: [playerName(3), playerName(4)],
            considering: [playerName(5)]
        })

        await page.getByRole("button", { name: "Update" }).click()
        await expect(
            page.getByText("Draft homework saved successfully!")
        ).toBeVisible()

        const p = seeded.playerIds
        expect(await savedMaleBoard()).toEqual([
            `1-0:${p[5]}`,
            `1-1:${p[0]}`,
            `2-0:${p[2]}`,
            `2-1:${p[3]}`,
            `${CONSIDERING}-0:${p[4]}`
        ])
    })
})
