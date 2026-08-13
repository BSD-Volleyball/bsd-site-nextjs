import { describe, expect, it } from "vitest"
import {
    type BracketSlot,
    selectPrunableResets
} from "./playoff-bracket-cleanup"

const slot = (
    over: Partial<BracketSlot> & { matchNum: number }
): BracketSlot => ({
    metaId: over.matchNum * 100,
    homeSource: null,
    awaySource: null,
    matchId: over.matchNum * 10,
    winner: null,
    homeTeamId: null,
    awayTeamId: null,
    hasAnyScore: false,
    ...over
})

// A minimal double-elim tail: the winners-bracket team (1) reaches the first
// final undefeated, the losers-bracket team (2) arrives carrying a loss.
const tail = (firstFinalWinner: number): BracketSlot[] => [
    // Team 2's earlier loss, which is what makes them the one-loss side.
    slot({
        matchNum: 9,
        homeTeamId: 2,
        awayTeamId: 3,
        winner: 2,
        hasAnyScore: true
    }),
    slot({
        matchNum: 8,
        homeTeamId: 1,
        awayTeamId: 2,
        winner: 1,
        hasAnyScore: true
    }),
    slot({
        matchNum: 10,
        homeSource: "W8",
        awaySource: "W9",
        homeTeamId: 1,
        awayTeamId: 2,
        winner: firstFinalWinner,
        hasAnyScore: true
    }),
    slot({ matchNum: 11, homeSource: "W10", awaySource: "L10" })
]

describe("selectPrunableResets", () => {
    it("prunes the reset when the undefeated team won the first final", () => {
        const pruned = selectPrunableResets(tail(1))
        expect(pruned).toHaveLength(1)
        expect(pruned[0]).toMatchObject({
            matchNum: 11,
            decidedByMatchNum: 10,
            championTeamId: 1
        })
    })

    it("keeps the reset when the undefeated team LOST the first final", () => {
        // Team 2 won match 10, so both sides sit at one loss and a decider is
        // genuinely required. An empty slot here means the score has not been
        // entered yet -- pruning it would erase a real match.
        expect(selectPrunableResets(tail(2))).toEqual([])
    })

    it("keeps a reset that was actually played", () => {
        const slots = tail(1)
        slots[3] = slot({
            matchNum: 11,
            homeSource: "W10",
            awaySource: "L10",
            homeTeamId: 1,
            awayTeamId: 2,
            winner: 2,
            hasAnyScore: true
        })
        expect(selectPrunableResets(slots)).toEqual([])
    })

    it("keeps a reset holding a partial score with no winner yet", () => {
        const slots = tail(1)
        slots[3] = slot({
            matchNum: 11,
            homeSource: "W10",
            awaySource: "L10",
            hasAnyScore: true
        })
        expect(selectPrunableResets(slots)).toEqual([])
    })

    it("keeps the reset when the first final has no recorded winner", () => {
        const slots = tail(1)
        slots[2] = { ...slots[2], winner: null }
        expect(selectPrunableResets(slots)).toEqual([])
    })

    it("accepts the L{n}/W{n} order as well as W{n}/L{n}", () => {
        const slots = tail(1)
        slots[3] = slot({
            matchNum: 11,
            homeSource: "L10",
            awaySource: "W10"
        })
        expect(selectPrunableResets(slots)).toHaveLength(1)
    })

    it("ignores a normal final, which is not a reset at all", () => {
        // W9/W10 is two different matches feeding a final -- not the same
        // match's winner and loser, so it is never an "if necessary" slot.
        const slots = tail(1)
        slots[3] = slot({
            matchNum: 11,
            homeSource: "W9",
            awaySource: "W10"
        })
        expect(selectPrunableResets(slots)).toEqual([])
    })

    it("ignores a reset-shaped slot that is not the last match", () => {
        const slots = [
            ...tail(1),
            slot({
                matchNum: 12,
                homeTeamId: 1,
                awayTeamId: 2,
                winner: 1,
                hasAnyScore: true
            })
        ]
        expect(selectPrunableResets(slots)).toEqual([])
    })

    it("prunes a meta-only slot with no match row", () => {
        const slots = tail(1)
        slots[3] = slot({
            matchNum: 11,
            homeSource: "W10",
            awaySource: "L10",
            matchId: null
        })
        const pruned = selectPrunableResets(slots)
        expect(pruned).toHaveLength(1)
        expect(pruned[0].matchId).toBeNull()
    })

    it("returns nothing for an empty bracket", () => {
        expect(selectPrunableResets([])).toEqual([])
    })
})
