import { expect, test, type Locator, type Page } from "@playwright/test"
import { and, desc, eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import {
    draftHomework,
    drafts,
    divisions,
    individual_divisions,
    seasons,
    signups,
    teams,
    users
} from "@/database/schema"
import { createSignup, createTeam } from "@/test/factories"
import { PERSONAS } from "./helpers"

// Captain draft homework board: when a player on the board has been
// drafted, "Remove drafted & shift up" drops them and everyone ranked
// below moves up one slot (rounds and Considering are one ranked list),
// and any filled slot can be dragged to a new position.

const CONSIDERING = 9

interface Seeded {
    captainId: string
    seasonId: number
    divisionId: number
    teamId: number
    playerIds: string[] // six males, ranked p1..p6
    nonMaleIds: string[] // two non-males
    userIds: string[]
}

let seeded: Seeded

function playerName(i: number) {
    return `Homework Player${i}`
}

async function seedBoard(): Promise<Seeded> {
    const [captain] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, PERSONAS.captain.email))
    const [season] = await db
        .select({ id: seasons.id })
        .from(seasons)
        .orderBy(desc(seasons.id))
        .limit(1)
    const [division] = await db
        .select({ id: divisions.id })
        .from(divisions)
        .where(eq(divisions.name, "AA"))

    // 2 teams, 2 male rounds + 1 non-male round
    await db.insert(individual_divisions).values({
        season: season.id,
        division: division.id,
        gender_split: "2-1",
        teams: 2
    })
    const team = await createTeam({
        season: season.id,
        captain: captain.id,
        division: division.id
    })

    const playerIds: string[] = []
    const nonMaleIds: string[] = []
    for (let i = 1; i <= 8; i++) {
        const id = `e2e-homework-player-${i}`
        const male = i <= 6
        await db.insert(users).values({
            id,
            first_name: "Homework",
            last_name: `Player${i}`,
            email: `e2e-homework-${i}@example.test`,
            male,
            onboarding_completed: true
        })
        await createSignup({ season: season.id, player: id })
        ;(male ? playerIds : nonMaleIds).push(id)
    }

    // Saved board: R1 = p1,p2 · R2 = p3,p4 · Considering = p5,p6 · F R1 = n1,n2
    const rows = [
        [1, 0, playerIds[0], true],
        [1, 1, playerIds[1], true],
        [2, 0, playerIds[2], true],
        [2, 1, playerIds[3], true],
        [CONSIDERING, 0, playerIds[4], true],
        [CONSIDERING, 1, playerIds[5], true],
        [1, 0, nonMaleIds[0], false],
        [1, 1, nonMaleIds[1], false]
    ] as const
    await db.insert(draftHomework).values(
        rows.map(([round, slot, player, isMale]) => ({
            season: season.id,
            captain: captain.id,
            division: division.id,
            round,
            slot,
            player,
            is_male_tab: isMale
        }))
    )

    // p2 gets drafted (by anyone in the season) before the captain returns
    await db
        .insert(drafts)
        .values({ team: team.id, user: playerIds[1], round: 1, overall: 1 })

    return {
        captainId: captain.id,
        seasonId: season.id,
        divisionId: division.id,
        teamId: team.id,
        playerIds,
        nonMaleIds,
        userIds: [...playerIds, ...nonMaleIds]
    }
}

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
