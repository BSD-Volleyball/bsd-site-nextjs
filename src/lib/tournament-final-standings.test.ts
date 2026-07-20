import { describe, expect, it } from "vitest"
import {
    rankDivisionFinal,
    type FinalMatch
} from "@/lib/tournament-final-standings"
import type { UsavTeam } from "@/lib/usav-ranking"

function t(id: number, name = `Team ${id}`): UsavTeam {
    return { id, name }
}

function poolWin(home: number, away: number, winner: number): FinalMatch {
    return {
        bracket: "pool",
        bracket_round: null,
        home_team_id: home,
        away_team_id: away,
        winner_team_id: winner,
        home_set1_score: winner === home ? 25 : 20,
        away_set1_score: winner === away ? 25 : 20,
        home_set2_score: winner === home ? 25 : 20,
        away_set2_score: winner === away ? 25 : 20,
        home_set3_score: null,
        away_set3_score: null
    }
}

function bracketMatch(
    bracket: "winners" | "losers" | "final",
    round: number,
    home: number | null,
    away: number | null,
    winner: number | null
): FinalMatch {
    const played = winner !== null
    return {
        bracket,
        bracket_round: round,
        home_team_id: home,
        away_team_id: away,
        winner_team_id: winner,
        home_set1_score: played ? (winner === home ? 25 : 18) : null,
        away_set1_score: played ? (winner === away ? 25 : 18) : null,
        home_set2_score: played ? (winner === home ? 25 : 18) : null,
        away_set2_score: played ? (winner === away ? 25 : 18) : null,
        home_set3_score: null,
        away_set3_score: null
    }
}

function places(teams: UsavTeam[], matches: FinalMatch[]): number[] {
    return rankDivisionFinal(teams, matches).map((r) => r.teamId)
}

describe("rankDivisionFinal — stopped during pool play (no bracket)", () => {
    it("ranks the whole division by USAV over pool matches", () => {
        const teams = [t(1), t(2), t(3), t(4)]
        // Two pools worth of results merged; pure match record here.
        const matches = [
            poolWin(1, 2, 1),
            poolWin(1, 3, 1),
            poolWin(2, 3, 2),
            poolWin(4, 3, 4),
            poolWin(4, 2, 4),
            poolWin(1, 4, 1)
        ]
        // Wins: T1=3, T4=2, T2=1, T3=0.
        expect(places(teams, matches)).toEqual([1, 4, 2, 3])
    })
})

describe("rankDivisionFinal — decided final pins 1st and 2nd", () => {
    it("champion and runner-up come from the final regardless of pool record", () => {
        const teams = [t(1), t(2), t(3), t(4)]
        // T3 dominated pool play but lost the final to T4.
        const matches = [
            poolWin(3, 1, 3),
            poolWin(3, 2, 3),
            poolWin(3, 4, 3),
            bracketMatch("winners", 1, 1, 4, 4), // T4 beats T1 (semi)
            bracketMatch("winners", 1, 2, 3, 3), // T3 beats T2 (semi)
            bracketMatch("final", 2, 3, 4, 4) // T4 beats T3 in the final
        ]
        const ranked = rankDivisionFinal(teams, matches)
        expect(ranked[0].teamId).toBe(4) // champion
        expect(ranked[1].teamId).toBe(3) // runner-up, despite best pool record
        // Semifinal losers T1 & T2 fill the remaining places.
        expect(
            ranked
                .map((r) => r.teamId)
                .slice(2)
                .sort()
        ).toEqual([1, 2])
    })
})

describe("rankDivisionFinal — partial bracket ranks by advancement", () => {
    it("still-alive teams outrank eliminated ones; deeper elimination ranks higher", () => {
        const teams = [t(1), t(2), t(3), t(4)]
        // 4-team single-elim, final not yet played.
        const matches = [
            bracketMatch("winners", 1, 1, 4, 1), // T1 beats T4 (round 1)
            bracketMatch("winners", 1, 2, 3, 2), // T2 beats T3 (round 1)
            // Final (round 2) exists but is unplayed — T1 & T2 still alive.
            bracketMatch("final", 2, 1, 2, null)
        ]
        const order = places(teams, matches)
        // T1 & T2 (alive, reached round 2) above T3 & T4 (eliminated round 1).
        expect(order.slice(0, 2).sort()).toEqual([1, 2])
        expect(order.slice(2).sort()).toEqual([3, 4])
    })
})

describe("rankDivisionFinal — USAV breaks ties within a bracket tier", () => {
    it("orders two same-round-eliminated teams by their full record", () => {
        const teams = [t(1), t(2), t(3), t(4)]
        // T1 & T2 reach the final (alive); T3 & T4 both lost in round 1.
        // Give T3 a better overall record than T4 so USAV ranks T3 above T4.
        const matches = [
            poolWin(3, 4, 3), // extra pool result: T3 beat T4
            bracketMatch("winners", 1, 1, 3, 1), // T1 beats T3
            bracketMatch("winners", 1, 2, 4, 2), // T2 beats T4
            bracketMatch("final", 2, 1, 2, null) // unplayed final
        ]
        const order = places(teams, matches)
        expect(order.slice(0, 2).sort()).toEqual([1, 2])
        // Among the round-1 losers, T3 (1-1) ranks ahead of T4 (0-2).
        expect(order.slice(2)).toEqual([3, 4])
    })
})
