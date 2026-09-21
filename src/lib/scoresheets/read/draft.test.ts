import { describe, expect, it } from "vitest"

import { flaggedFieldCount, toScoreDraft } from "./draft"
import type { MatchRead } from "./read"
import type { GameVerdict } from "./reconcile"

const game = (over: Partial<GameVerdict> = {}): GameVerdict => ({
    home: null,
    away: null,
    winner: null,
    confidence: 1,
    level: "high",
    conflict: null,
    blank: true,
    ...over
})

const won = (
    home: number,
    away: number,
    level: GameVerdict["level"] = "high"
) =>
    game({
        home,
        away,
        winner: home > away ? "home" : "away",
        level,
        confidence: level === "high" ? 0.97 : 0.6,
        blank: false
    })

const match = (
    games: GameVerdict[],
    over: Partial<MatchRead> = {}
): MatchRead => {
    const played = games.filter((g) => !g.blank)
    return {
        matchId: 42,
        orderOnCourt: 1,
        games,
        homeGamesWon: played.filter((g) => g.winner === "home").length,
        awayGamesWon: played.filter((g) => g.winner === "away").length,
        winner: "home",
        problems: [],
        ...over
    }
}

describe("toScoreDraft", () => {
    it("lays a clean two-nil match into the form's shape", () => {
        const draft = toScoreDraft(match([won(25, 19), won(25, 21), game()]))

        expect(draft.fields).toMatchObject({
            homeSet1Score: "25",
            awaySet1Score: "19",
            homeSet2Score: "25",
            awaySet2Score: "21",
            homeSet3Score: "",
            awaySet3Score: "",
            homeScore: "2",
            awayScore: "0",
            winnerSide: "home"
        })
        expect(draft.flags).toEqual([])
        expect(draft.empty).toBe(false)
    })

    it("leaves an unplayed match entirely alone", () => {
        const draft = toScoreDraft(match([game(), game(), game()]))
        expect(draft.empty).toBe(true)
        expect(draft.fields.homeScore).toBe("")
        expect(draft.flags).toEqual([])
    })

    it("offers a shaky reading but marks it", () => {
        const draft = toScoreDraft(
            match([won(25, 19), won(25, 21, "low"), game()])
        )
        expect(draft.fields.homeSet2Score).toBe("25")
        const fields = draft.flags.map((f) => f.field)
        expect(fields).toContain("homeSet2Score")
        expect(fields).toContain("awaySet2Score")
        expect(draft.flags[0].level).toBe("low")
        expect(draft.confidence).toBeLessThan(0.85)
    })

    it("passes a conflict through in words", () => {
        const conflicted = game({
            home: 25,
            away: 19,
            winner: "home",
            level: "low",
            confidence: 0.5,
            blank: false,
            conflict: "The WIN tick says away won, but the scores read 25-19."
        })
        const draft = toScoreDraft(match([conflicted, game(), game()]))
        expect(draft.flags[0].level).toBe("conflict")
        expect(draft.flags[0].note).toContain("WIN tick")
    })

    it("withholds the totals when a game could not be read", () => {
        const draft = toScoreDraft(
            match([won(25, 19), game({ blank: false, level: "unreadable" })], {
                homeGamesWon: null,
                awayGamesWon: null,
                winner: null
            })
        )
        expect(draft.fields.homeScore).toBe("")
        expect(draft.fields.winnerSide).toBeNull()
        expect(draft.flags.map((f) => f.field)).toContain("homeScore")
        expect(draft.confidence).toBe(0)
    })

    it("counts each flagged field once however many notes it has", () => {
        const draft = toScoreDraft(
            match([won(25, 19, "low"), won(25, 21, "low"), game()])
        )
        // Four inputs flagged, not eight notes
        expect(flaggedFieldCount([draft])).toBe(4)
    })
})
