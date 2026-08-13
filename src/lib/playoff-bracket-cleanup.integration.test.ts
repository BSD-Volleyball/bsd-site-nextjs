import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { matches, playoffMatchesMeta, seasons } from "@/database/schema"
import {
    createDivision,
    createMatch,
    createSeason,
    createTeam
} from "@/test/factories"
import { createUserWithRoles } from "@/test/session"
import { advanceSeasonPhase } from "@/app/dashboard/season-control/actions"
import {
    findUnplayedBracketResets,
    pruneUnplayedBracketResets
} from "./playoff-bracket-cleanup"

/**
 * A three-match tail of a double-elim bracket:
 *   #8  winners final  - team A beats team B (A is now undefeated)
 *   #9  losers final   - team B beats team C, so B carries one loss
 *   #10 first final    - A vs B, winner controlled by `firstFinalWinner`
 *   #11 reset final    - W10/L10, scheduled but left empty
 * When A wins #10 the tournament is over and #11 was never needed.
 */
async function seedBracket(opts: { firstFinalWinnerIsUndefeated: boolean }) {
    const captain = await createUserWithRoles([{ role: "admin" }])
    const season = await createSeason({
        code: `T${Math.floor(Date.now() % 100000)}`,
        year: 2030,
        season: "spring",
        phase: "playoffs"
    })
    const division = await createDivision({ name: "TestDiv", level: 1 })

    const teamA = await createTeam({
        season: season.id,
        division: division.id,
        captain: captain.id,
        name: "Alpha",
        number: 1
    })
    const teamB = await createTeam({
        season: season.id,
        division: division.id,
        captain: captain.id,
        name: "Bravo",
        number: 2
    })
    const teamC = await createTeam({
        season: season.id,
        division: division.id,
        captain: captain.id,
        name: "Charlie",
        number: 3
    })

    const mk = async (
        num: number,
        home: number,
        away: number,
        winner: number | null,
        sources: [string, string],
        bracket: string | null,
        played: boolean
    ) => {
        const match = await createMatch({
            season: season.id,
            division: division.id,
            week: 3,
            playoff: true,
            home_team: home,
            away_team: away,
            winner,
            home_score: played ? (winner === home ? 2 : 0) : null,
            away_score: played ? (winner === home ? 0 : 2) : null
        })
        await db.insert(playoffMatchesMeta).values({
            season: season.id,
            division: division.id,
            week: 3,
            match_num: num,
            match_id: match.id,
            bracket,
            home_source: sources[0],
            away_source: sources[1]
        })
        return match
    }

    await mk(8, teamA.id, teamB.id, teamA.id, ["W6", "W7"], "winners", true)
    await mk(9, teamB.id, teamC.id, teamB.id, ["L8", "W5"], "losers", true)
    const firstFinalWinner = opts.firstFinalWinnerIsUndefeated
        ? teamA.id
        : teamB.id
    await mk(
        10,
        teamA.id,
        teamB.id,
        firstFinalWinner,
        ["W8", "W9"],
        "championship",
        true
    )
    const reset = await mk(
        11,
        teamA.id,
        teamB.id,
        null,
        ["W10", "L10"],
        "championship",
        false
    )

    return { season, division, teamA, teamB, reset }
}

describe("pruneUnplayedBracketResets", () => {
    it("removes the reset final and its meta when it was never needed", async () => {
        const { season, reset } = await seedBracket({
            firstFinalWinnerIsUndefeated: true
        })

        const found = await findUnplayedBracketResets(season.id)
        expect(found).toHaveLength(1)
        expect(found[0].matchNum).toBe(11)

        const { pruned, skipped } = await pruneUnplayedBracketResets(season.id)
        expect(skipped).toEqual([])
        expect(pruned).toHaveLength(1)

        const remainingMatch = await db
            .select()
            .from(matches)
            .where(eq(matches.id, reset.id))
        expect(remainingMatch).toHaveLength(0)

        const remainingMeta = await db
            .select()
            .from(playoffMatchesMeta)
            .where(eq(playoffMatchesMeta.season, season.id))
        expect(
            remainingMeta.map((m) => m.match_num).sort((a, b) => a - b)
        ).toEqual([8, 9, 10])
    })

    it("leaves the reset alone when the first final was won by the one-loss team", async () => {
        // The decider genuinely was required, so an empty slot means the score
        // has not been entered -- removing it would erase a real match.
        const { season, reset } = await seedBracket({
            firstFinalWinnerIsUndefeated: false
        })

        expect(await findUnplayedBracketResets(season.id)).toEqual([])

        const { pruned } = await pruneUnplayedBracketResets(season.id)
        expect(pruned).toEqual([])
        expect(
            await db.select().from(matches).where(eq(matches.id, reset.id))
        ).toHaveLength(1)
    })

    it("is idempotent", async () => {
        const { season } = await seedBracket({
            firstFinalWinnerIsUndefeated: true
        })
        await pruneUnplayedBracketResets(season.id)
        const second = await pruneUnplayedBracketResets(season.id)
        expect(second).toEqual({ pruned: [], skipped: [] })
    })
})

describe("advanceSeasonPhase to complete", () => {
    it("prunes the unplayed reset final as part of completing the season", async () => {
        const { season, reset } = await seedBracket({
            firstFinalWinnerIsUndefeated: true
        })

        const result = await advanceSeasonPhase(season.id, "complete")
        expect(result.status).toBe(true)

        const [row] = await db
            .select({ phase: seasons.phase })
            .from(seasons)
            .where(eq(seasons.id, season.id))
        expect(row.phase).toBe("complete")

        expect(
            await db.select().from(matches).where(eq(matches.id, reset.id))
        ).toHaveLength(0)
    })
})
