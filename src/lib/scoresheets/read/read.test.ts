import { describe, expect, it } from "vitest"

import type { GameReading, PageReader, PageReading } from "./page-reader"
import { readSheet } from "./read"

const MATCHES = [
    { matchId: 101, home: "Team Soo", away: "Team Landeo" },
    { matchId: 102, home: "Team Pham", away: "Team Stafford" }
]

const g = (home: number | null, away: number | null): GameReading => ({
    home,
    away,
    confidence: "high",
    note: ""
})

const SCORES: GameReading[][] = [
    [g(22, 25), g(25, 22), g(20, 25)],
    [g(27, 26), g(25, 19), g(null, null)]
]

function fake(
    name: string,
    answer: Partial<PageReading> | Error = {}
): PageReader & { calls: number } {
    return {
        name,
        calls: 0,
        async read({ matches }) {
            this.calls++
            if (answer instanceof Error) throw answer
            expect(matches.map((m) => m.home)).toEqual([
                "Team Soo",
                "Team Pham"
            ])
            return {
                model: name,
                sheetCode: "F26-W5-C1",
                matches: SCORES,
                ...answer
            }
        },
        async readCode() {
            return "F26-W5-C1"
        }
    }
}

const input = (readers: PageReader[]) => ({
    photo: new Uint8Array([1]),
    matches: MATCHES,
    eventType: "regular_season" as const,
    readers,
    identity: null,
    tag: "BSD3:F26:W5:2026-10-08:1",
    expectedSheetCode: "F26-W5-C1"
})

describe("readSheet", () => {
    it("fills a sheet both readers agree on, with nothing to review", async () => {
        const read = await readSheet(input([fake("a/one"), fake("b/two")]))

        expect(read.status).toBe("read")
        expect(read.problems).toEqual([])
        expect(read.transcriber).toBe("a/one + b/two")
        expect(read.matches.map((m) => m.matchId)).toEqual([101, 102])
        expect(read.matches[0]).toMatchObject({
            awayGamesWon: 2,
            winner: "away"
        })
        expect(read.matches[1].games[2].blank).toBe(true)
        // Both readings kept whole, for measuring the models later
        expect(read.readings?.map((r) => r.model)).toEqual(["a/one", "b/two"])
    })

    it("asks both readers at once, not one after the other", async () => {
        const one = fake("a/one")
        const two = fake("b/two")
        await readSheet(input([one, two]))
        expect([one.calls, two.calls]).toEqual([1, 1])
    })

    it("carries on with one reader when the other fails, but proves nothing", async () => {
        const read = await readSheet(
            input([fake("a/one"), fake("b/two", new Error("returned 429"))])
        )
        expect(read.status).toBe("needs_review")
        expect(read.problems[0]).toBe(
            "b/two could not read this sheet: returned 429"
        )
        expect(read.matches[0].games.every((x) => x.level === "low")).toBe(true)
        // Scores are still offered, so the admin has less to type
        expect(read.matches[0].games[0].away).toBe(25)
    })

    it("fails the read only when no reader answered", async () => {
        const read = await readSheet(
            input([
                fake("a/one", new Error("timeout")),
                fake("b/two", new Error("timeout"))
            ])
        )
        expect(read.status).toBe("failed")
        expect(read.matches).toEqual([])
        expect(read.problems).toHaveLength(2)
    })

    it("notices a photo filed against the wrong court", async () => {
        const read = await readSheet(
            input([fake("a/one", { sheetCode: "F26-W5-C2" }), fake("b/two")])
        )
        expect(read.status).toBe("needs_review")
        expect(read.problems[0]).toContain(
            "read the sheet's code as F26-W5-C2, but this photo is filed as F26-W5-C1"
        )
    })

    it("sends a sheet to review when a slot names the team the scores did not", async () => {
        // 2026-10-29: Gomez 26-24 in game 3 on the paper, Collazo written into
        // the next block's Winner of M6 slot. Both readers agree on the scores.
        const playoff = [
            {
                matchId: 201,
                home: "Team Gomez",
                away: "Team Collazo",
                number: 6,
                bracket: {
                    division: "ABA",
                    matchNum: 6,
                    home: { captains: [], source: null },
                    away: { captains: [], source: null }
                }
            },
            {
                matchId: 202,
                home: "Team Pham",
                away: "Winner of M6",
                number: 8,
                bracket: {
                    division: "ABA",
                    matchNum: 8,
                    home: { captains: [], source: null },
                    away: {
                        captains: [],
                        source: { kind: "winner" as const, matchNum: 6 }
                    }
                }
            }
        ]
        const reader = (name: string): PageReader => ({
            name,
            async read() {
                return {
                    model: name,
                    sheetCode: "F26-P2-C4",
                    matches: [
                        [g(19, 25), g(25, 19), g(26, 24)],
                        [g(25, 20), g(25, 22), g(null, null)]
                    ],
                    writtenNames: [
                        { home: null, away: null },
                        { home: null, away: "Team Collazo" }
                    ]
                }
            },
            async readCode() {
                return "F26-P2-C4"
            }
        })

        const read = await readSheet({
            ...input([reader("a/one"), reader("b/two")]),
            matches: playoff,
            eventType: "playoff",
            expectedSheetCode: "F26-P2-C4"
        })

        expect(read.matches[0].games.every((x) => x.level === "high")).toBe(
            true
        )
        expect(read.status).toBe("needs_review")
        expect(read.problems).toEqual([
            expect.stringMatching(
                /^Match 6: The referee wrote "Team Collazo" into match 8 as the winner of M6, but these scores make Team Gomez the winner/
            )
        ])
    })

    it("needs no secret to run: with no readers it asks for typing", async () => {
        const read = await readSheet(input([]))
        expect(read.status).toBe("needs_review")
        expect(read.matches).toEqual([])
        expect(read.problems[0]).toContain("not set up")
    })
})
