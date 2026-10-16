import { describe, expect, it } from "vitest"
import type { GameVerdict } from "./read/combine"
import type { MatchRead, SheetRead } from "./read/read"
import {
    type CourtMatchInput,
    type CourtSheetInput,
    gameCandidates,
    summarizeCourts
} from "./court-status"

function match(
    matchId: number,
    court: number,
    overrides: Partial<CourtMatchInput> = {}
): CourtMatchInput {
    return {
        matchId,
        divisionId: 1,
        court,
        time: `19:${String(matchId).padStart(2, "0")}`,
        homeTeamId: matchId * 10,
        awayTeamId: matchId * 10 + 1,
        homeScore: null,
        awayScore: null,
        homeSet1Score: null,
        awaySet1Score: null,
        homeSet2Score: null,
        awaySet2Score: null,
        homeSet3Score: null,
        awaySet3Score: null,
        winner: null,
        scoresEnteredAt: null,
        ...overrides
    }
}

/** Home wins 25-20, 20-25, 15-10, as saved. */
function saved(matchId: number, court: number): CourtMatchInput {
    return match(matchId, court, {
        homeScore: 2,
        awayScore: 1,
        homeSet1Score: 25,
        awaySet1Score: 20,
        homeSet2Score: 20,
        awaySet2Score: 25,
        homeSet3Score: 15,
        awaySet3Score: 10,
        winner: matchId * 10
    })
}

function game(home: number, away: number, high = true): GameVerdict {
    return {
        home,
        away,
        winner: home > away ? "home" : "away",
        confidence: high ? 1 : 0.6,
        level: high ? "high" : "low",
        conflict: null,
        blank: false
    }
}

function disagreement(): GameVerdict {
    return {
        home: null,
        away: null,
        winner: null,
        confidence: 0,
        level: "unreadable",
        conflict: "The two readers disagree: a read 25-23, b read 25-21.",
        blank: false
    }
}

function matchRead(matchId: number, games: GameVerdict[]): MatchRead {
    const unclear = games.some((g) => g.level === "unreadable")
    const homeWon = games.filter((g) => g.winner === "home").length
    const awayWon = games.filter((g) => g.winner === "away").length
    return {
        matchId,
        orderOnCourt: 1,
        games,
        homeGamesWon: unclear ? null : homeWon,
        awayGamesWon: unclear ? null : awayWon,
        winner: unclear ? null : homeWon > awayWon ? "home" : "away",
        problems: []
    }
}

const homeWins = () => [game(25, 20), game(20, 25), game(15, 10)]

function sheet(
    court: number,
    matches: MatchRead[],
    overrides: Partial<CourtSheetInput> = {}
): CourtSheetInput {
    const read: SheetRead = {
        status: "read",
        tag: null,
        identity: null,
        matches,
        problems: [],
        transcriber: "a + b"
    }
    return {
        scoreSheetId: court * 100,
        court,
        status: "read",
        read,
        uploadedAt: "2026-10-05T01:30:00.000Z",
        ...overrides
    }
}

describe("summarizeCourts", () => {
    it("lists every scheduled court, without a photo as no_photo", () => {
        const courts = summarizeCourts([match(1, 2), match(2, 1)], [])
        expect(courts.map((c) => [c.court, c.state])).toEqual([
            [1, "no_photo"],
            [2, "no_photo"]
        ])
    })

    it("orders a court's matches by time", () => {
        const [court] = summarizeCourts(
            [match(2, 1, { time: "20:00" }), match(1, 1, { time: "19:00" })],
            []
        )
        expect(court.matchIds).toEqual([1, 2])
    })

    it("offers a one-tap save when both readers agreed on every game", () => {
        const [court] = summarizeCourts(
            [match(1, 1)],
            [sheet(1, [matchRead(1, homeWins())])]
        )
        expect(court.state).toBe("ready")
        expect(court.drafts[1].fields.winnerSide).toBe("home")
    })

    it("needs a look when a game is a guess or the readers disagree", () => {
        const guess = summarizeCourts(
            [match(1, 1)],
            [sheet(1, [matchRead(1, [game(25, 20), game(25, 21, false)])])]
        )
        expect(guess[0].state).toBe("needs_review")

        const split = summarizeCourts(
            [match(1, 1)],
            [sheet(1, [matchRead(1, [game(25, 20), disagreement()])])]
        )
        expect(split[0].state).toBe("needs_review")
    })

    it("needs a look when the read missed a match on the court", () => {
        const [court] = summarizeCourts(
            [match(1, 1), match(2, 1)],
            [sheet(1, [matchRead(1, homeWins())])]
        )
        expect(court.state).toBe("needs_review")
    })

    it("is saved once every match has a result, photo or not", () => {
        expect(summarizeCourts([saved(1, 1)], [])[0].state).toBe("saved")
        const [court] = summarizeCourts(
            [saved(1, 1)],
            [
                sheet(1, [matchRead(1, homeWins())], {
                    status: "confirmed"
                })
            ]
        )
        expect(court.state).toBe("saved")
        expect(court.differsFromSaved).toBe(false)
    })

    it("flags a new photo that reads differently from what was saved", () => {
        const [court] = summarizeCourts(
            [saved(1, 1)],
            [
                sheet(1, [
                    matchRead(1, [game(25, 20), game(25, 22), game(15, 10)])
                ])
            ]
        )
        expect(court.differsFromSaved).toBe(true)
        expect(court.state).toBe("needs_review")
    })

    it("trusts a result saved after the photo, corrections and all", () => {
        const [court] = summarizeCourts(
            [{ ...saved(1, 1), scoresEnteredAt: "2026-10-05T02:00:00.000Z" }],
            [
                sheet(1, [
                    matchRead(1, [game(25, 20), disagreement(), game(15, 10)])
                ])
            ]
        )
        expect(court.differsFromSaved).toBe(false)
        expect(court.state).toBe("saved")
    })

    it("shows the newest photo while it is still being read", () => {
        const [court] = summarizeCourts(
            [match(1, 1)],
            [
                sheet(1, [matchRead(1, homeWins())]),
                {
                    scoreSheetId: 2,
                    court: 1,
                    status: "processing",
                    read: null,
                    uploadedAt: "2026-10-05T02:00:00.000Z"
                }
            ]
        )
        expect(court.state).toBe("reading")
        expect(court.sheet?.scoreSheetId).toBe(2)
        expect(court.sheets).toHaveLength(2)
    })

    it("falls back to an earlier good read when the newest photo failed", () => {
        const [court] = summarizeCourts(
            [match(1, 1)],
            [
                sheet(1, [matchRead(1, homeWins())]),
                {
                    scoreSheetId: 2,
                    court: 1,
                    status: "failed",
                    read: null,
                    uploadedAt: "2026-10-05T02:00:00.000Z"
                }
            ]
        )
        expect(court.sheet?.scoreSheetId).toBe(100)
        expect(court.state).toBe("ready")
    })

    it("is failed when the only photo could not be read", () => {
        const [court] = summarizeCourts(
            [match(1, 1)],
            [
                {
                    scoreSheetId: 2,
                    court: 1,
                    status: "failed",
                    read: null,
                    uploadedAt: "2026-10-05T02:00:00.000Z"
                }
            ]
        )
        expect(court.state).toBe("failed")
    })

    it("keeps a court spanning two divisions on one card", () => {
        const [court] = summarizeCourts(
            [match(1, 1, { divisionId: 1 }), match(2, 1, { divisionId: 2 })],
            [
                sheet(1, [
                    matchRead(1, homeWins()),
                    { ...matchRead(2, homeWins()), orderOnCourt: 2 }
                ])
            ]
        )
        expect(court.matchIds).toEqual([1, 2])
        expect(court.state).toBe("ready")
    })
})

describe("gameCandidates", () => {
    it("offers each reader's distinct reading of a game", () => {
        const read: SheetRead = {
            ...sheet(1, [matchRead(1, [game(25, 20), disagreement()])]).read!,
            readings: [
                {
                    model: "a",
                    sheetCode: null,
                    matches: [
                        [
                            {
                                home: 25,
                                away: 20,
                                confidence: "high",
                                note: ""
                            },
                            { home: 25, away: 23, confidence: "high", note: "" }
                        ]
                    ]
                },
                {
                    model: "b",
                    sheetCode: null,
                    matches: [
                        [
                            {
                                home: 25,
                                away: 20,
                                confidence: "high",
                                note: ""
                            },
                            { home: 25, away: 21, confidence: "high", note: "" }
                        ]
                    ]
                }
            ]
        }
        expect(gameCandidates(read, 1, 1)).toEqual([
            { home: 25, away: 23, models: ["a"] },
            { home: 25, away: 21, models: ["b"] }
        ])
        expect(gameCandidates(read, 1, 0)).toEqual([
            { home: 25, away: 20, models: ["a", "b"] }
        ])
        expect(gameCandidates(read, 99, 0)).toEqual([])
    })
})
