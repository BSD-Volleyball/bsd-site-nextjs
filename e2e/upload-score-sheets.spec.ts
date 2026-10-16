import { expect, test } from "@playwright/test"
import { eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import {
    divisions,
    individual_divisions,
    matches,
    scoreSheetReads,
    scoreSheets,
    seasonEvents,
    seasons,
    teams,
    users
} from "@/database/schema"
import type { GameVerdict } from "@/lib/scoresheets/read/combine"
import type { SheetRead } from "@/lib/scoresheets/read/read"
import {
    createDivision,
    createMatch,
    createSeason,
    createSeasonEvent,
    createTeam
} from "@/test/factories"
import { PERSONAS } from "./helpers"

// The upload page is where a night's scoring happens on a phone: each court
// card shows what was read off its sheet, a clean read saves with one tap, an
// unclear one is fixed in the popup editor, and a court with no photo is
// typed in by hand. Reads are seeded rather than made, so no model is called.

const NIGHT = new Date().toISOString().split("T")[0]
let seasonId: number
let divisionId: number
let adminId: string
const matchIdByCourt: Record<number, number> = {}

function game(home: number, away: number): GameVerdict {
    return {
        home,
        away,
        winner: home > away ? "home" : "away",
        confidence: 1,
        level: "high",
        conflict: null,
        blank: false
    }
}

const BLANK: GameVerdict = {
    home: null,
    away: null,
    winner: null,
    confidence: 1,
    level: "high",
    conflict: null,
    blank: true
}

function sheetRead(
    matchId: number,
    games: GameVerdict[],
    extra: Partial<SheetRead> = {}
): SheetRead {
    const unclear = games.some((g) => g.level === "unreadable")
    const home = games.filter((g) => g.winner === "home").length
    const away = games.filter((g) => g.winner === "away").length
    return {
        status: unclear ? "needs_review" : "read",
        tag: null,
        identity: null,
        transcriber: "e2e-a + e2e-b",
        problems: [],
        matches: [
            {
                matchId,
                orderOnCourt: 1,
                games,
                homeGamesWon: unclear ? null : home,
                awayGamesWon: unclear ? null : away,
                winner: unclear ? null : home > away ? "home" : "away",
                problems: []
            }
        ],
        ...extra
    }
}

async function seedSheet(court: number, read: SheetRead) {
    const [sheet] = await db
        .insert(scoreSheets)
        .values({
            season_id: seasonId,
            court,
            match_date: NIGHT,
            image_path: `scoresheets/${seasonId}/${NIGHT}/e2e_${court}.jpg`,
            uploaded_by: adminId
        })
        .returning()
    await db.insert(scoreSheetReads).values({
        score_sheet_id: sheet.id,
        status: read.status,
        result: read,
        problems: read.problems,
        attempts: 1
    })
}

test.beforeAll(async () => {
    const [admin] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, PERSONAS.admin.email))
    const [captain] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, PERSONAS.captain.email))
    adminId = admin.id

    const season = await createSeason({
        code: "E2EUPL",
        phase: "regular_season"
    })
    seasonId = season.id
    const division = await createDivision({ name: "E2E Upload", level: 91 })
    divisionId = division.id
    await db.insert(individual_divisions).values({
        season: seasonId,
        division: divisionId,
        gender_split: "5-3",
        teams: 6
    })
    await createSeasonEvent(seasonId, {
        event_type: "regular_season",
        event_date: NIGHT,
        sort_order: 0
    })

    const names = [
        ["Aces", "Blockers"],
        ["Cyclones", "Diggers"],
        ["Eagles", "Falcons"]
    ]
    for (const [index, [homeName, awayName]] of names.entries()) {
        const court = index + 1
        const home = await createTeam({
            season: seasonId,
            division: divisionId,
            captain: captain.id,
            name: homeName
        })
        const away = await createTeam({
            season: seasonId,
            division: divisionId,
            captain: captain.id,
            name: awayName
        })
        const match = await createMatch({
            season: seasonId,
            division: divisionId,
            week: 1,
            date: NIGHT,
            time: "19:00",
            court,
            home_team: home.id,
            away_team: away.id
        })
        matchIdByCourt[court] = match.id
    }

    // Court 1: both readers agreed. Court 2: they split on game 2.
    await seedSheet(
        1,
        sheetRead(matchIdByCourt[1], [game(25, 20), game(25, 22), BLANK])
    )
    await seedSheet(
        2,
        sheetRead(
            matchIdByCourt[2],
            [
                game(18, 25),
                {
                    home: null,
                    away: null,
                    winner: null,
                    confidence: 0,
                    level: "unreadable",
                    conflict:
                        "The two readers disagree: e2e-a read 25-23, e2e-b read 25-21. Check the photo.",
                    blank: false
                },
                game(15, 11)
            ],
            {
                problems: ["Match 1: Game 2: The two readers disagree."],
                readings: [
                    {
                        model: "e2e-a",
                        sheetCode: null,
                        matches: [
                            [
                                {
                                    home: 18,
                                    away: 25,
                                    confidence: "high",
                                    note: ""
                                },
                                {
                                    home: 25,
                                    away: 23,
                                    confidence: "high",
                                    note: ""
                                },
                                {
                                    home: 15,
                                    away: 11,
                                    confidence: "high",
                                    note: ""
                                }
                            ]
                        ]
                    },
                    {
                        model: "e2e-b",
                        sheetCode: null,
                        matches: [
                            [
                                {
                                    home: 18,
                                    away: 25,
                                    confidence: "high",
                                    note: ""
                                },
                                {
                                    home: 25,
                                    away: 21,
                                    confidence: "high",
                                    note: ""
                                },
                                {
                                    home: 15,
                                    away: 11,
                                    confidence: "high",
                                    note: ""
                                }
                            ]
                        ]
                    }
                ]
            }
        )
    )
})

test.afterAll(async () => {
    const sheetIds = (
        await db
            .select({ id: scoreSheets.id })
            .from(scoreSheets)
            .where(eq(scoreSheets.season_id, seasonId))
    ).map((s) => s.id)
    if (sheetIds.length > 0) {
        await db.delete(scoreSheets).where(inArray(scoreSheets.id, sheetIds))
    }
    await db.delete(matches).where(eq(matches.season, seasonId))
    await db.delete(teams).where(eq(teams.season, seasonId))
    await db
        .delete(individual_divisions)
        .where(eq(individual_divisions.season, seasonId))
    await db.delete(seasonEvents).where(eq(seasonEvents.season_id, seasonId))
    await db.delete(seasons).where(eq(seasons.id, seasonId))
    await db.delete(divisions).where(eq(divisions.id, divisionId))
})

async function savedMatch(court: number) {
    const [row] = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchIdByCourt[court]))
    return row
}

test.describe("upload score sheets", () => {
    test.use({
        storageState: PERSONAS.admin.storageState,
        viewport: { width: 390, height: 844 }
    })

    test("scores a whole night from the court cards", async ({ page }) => {
        await page.goto("/dashboard/upload-score-sheets")
        await expect(
            page.getByRole("heading", { name: "Upload Score Sheets" })
        ).toBeVisible()

        const court1 = page.locator("#court-1")
        const court2 = page.locator("#court-2")
        const court3 = page.locator("#court-3")
        await expect(court1.getByText("Ready to save")).toBeVisible()
        await expect(court2.getByText("Needs a look")).toBeVisible()
        await expect(court3.getByText("No photo yet")).toBeVisible()
        await expect(court1.getByText("Photo by Ada Admin")).toBeVisible()

        // A clean read: one tap
        await court1.getByRole("button", { name: "Looks right — Save" }).click()
        await expect(court1.getByText("Saved", { exact: true })).toBeVisible()
        const one = await savedMatch(1)
        expect([one.home_set1_score, one.away_set1_score]).toEqual([25, 20])
        expect([one.home_score, one.away_score]).toEqual([2, 0])
        expect(one.winner).toBe(one.home_team)
        expect(one.scores_entered_by).toBe(adminId)
        await expect(court1.getByText(/Saved by Ada Admin/)).toBeVisible()

        // The readers split on game 2: pick a reading in the editor
        await court2.getByRole("button", { name: "Fix scores" }).click()
        const editor = page.getByRole("dialog")
        await expect(editor.getByText("Court 2 scores")).toBeVisible()
        await expect(
            editor.getByRole("button", { name: "Save court 2" })
        ).toBeDisabled()
        await editor.getByRole("button", { name: "Use 25–21" }).click()
        await expect(editor.getByText("✓ Cyclones won")).toBeVisible()
        await editor.getByRole("button", { name: "Save court 2" }).click()
        await expect(editor).toBeHidden()
        await expect(court2.getByText("Saved", { exact: true })).toBeVisible()
        const two = await savedMatch(2)
        expect([two.home_set2_score, two.away_set2_score]).toEqual([25, 21])
        expect([two.home_score, two.away_score]).toEqual([2, 1])
        expect(two.winner).toBe(two.home_team)

        // No photo: typed in by hand
        await court3.getByRole("button", { name: "Enter by hand" }).click()
        await editor.getByLabel("G1 home").fill("21")
        await editor.getByLabel("G1 away").fill("25")
        await editor.getByLabel("G2 home").fill("19")
        await editor.getByLabel("G2 away").fill("25")
        await expect(editor.getByText("✓ Falcons won")).toBeVisible()
        await editor.getByRole("button", { name: "Save court 3" }).click()
        await expect(court3.getByText("Saved", { exact: true })).toBeVisible()
        const three = await savedMatch(3)
        expect(three.winner).toBe(three.away_team)

        await expect(
            page.getByText("Every court is saved for this night.")
        ).toBeVisible()

        // Edit Scores shows who photographed each sheet and who saved each match
        await page.goto("/dashboard/enter-scores")
        await expect(
            page.getByRole("heading", { name: "Edit Scores" })
        ).toBeVisible()
        await expect(page.getByText("Photo by Ada Admin").first()).toBeVisible()
        await expect(page.getByText(/Saved by Ada Admin/).first()).toBeVisible()
        await page.screenshot({
            path: "test-results/enter-scores-attribution.png",
            fullPage: true
        })
    })
})
