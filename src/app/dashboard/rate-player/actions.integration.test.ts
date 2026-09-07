import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { playerRatings } from "@/database/schema"
import { createSeason, createSignup } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { getRatePlayerData } from "./actions"

async function rate(
    evaluator: string,
    player: string,
    season: number,
    overall: number,
    updatedAt: string
) {
    await db.insert(playerRatings).values({
        evaluator,
        player,
        season,
        overall,
        updated_at: new Date(updatedAt)
    })
}

describe("getRatePlayerData: Players I've Rated", () => {
    it("lists every rated (player, season) newest first with signup-aware Rate access", async () => {
        const prior = await createSeason({ year: 2025, season: "spring" })
        const current = await createSeason({ year: 2026, season: "fall" })
        const evaluator = await createUserWithRoles([{ role: "admin" }])

        const alice = await createUser({
            first_name: "Alice",
            last_name: "Adams"
        })
        const bob = await createUser({ first_name: "Bob", last_name: "Brown" })
        const cara = await createUser({ first_name: "Cara", last_name: "Cole" })
        const otherEvaluator = await createUser()

        await createSignup({ season: current.id, player: alice.id })
        await createSignup({ season: current.id, player: cara.id })

        await rate(
            evaluator.id,
            alice.id,
            current.id,
            7,
            "2026-09-01T12:00:00Z"
        )
        await rate(evaluator.id, bob.id, prior.id, 5, "2025-03-10T12:00:00Z")
        await rate(evaluator.id, cara.id, prior.id, 6, "2025-03-12T12:00:00Z")
        await rate(evaluator.id, cara.id, current.id, 8, "2026-08-20T12:00:00Z")
        // Another evaluator's rating must not leak into this evaluator's list.
        await rate(
            otherEvaluator.id,
            bob.id,
            current.id,
            9,
            "2026-09-05T12:00:00Z"
        )

        const result = await getRatePlayerData()

        expect(result.status).toBe(true)
        expect(result.currentSeasonId).toBe(current.id)
        expect(
            result.ratedPlayers.map((r) => [
                r.player.lastName,
                r.seasonLabel,
                r.canRate
            ])
        ).toEqual([
            ["Adams", "Fall 2026", true],
            ["Cole", "Fall 2026", true],
            ["Cole", "Spring 2025", true],
            ["Brown", "Spring 2025", false]
        ])
        expect(result.ratedPlayers.map((r) => r.overall)).toEqual([7, 8, 6, 5])
        expect(result.ratedPlayers[0].ratedAt).toBe("2026-09-01T12:00:00.000Z")
        expect(result.ratedSeasons).toEqual([
            { seasonId: current.id, label: "Fall 2026" },
            { seasonId: prior.id, label: "Spring 2025" }
        ])
    })

    it("still returns rated players when the current season has no signups", async () => {
        const prior = await createSeason({ year: 2025, season: "fall" })
        await createSeason({ year: 2026, season: "spring" })
        const evaluator = await createUserWithRoles([{ role: "admin" }])
        const dan = await createUser({ first_name: "Dan", last_name: "Dean" })
        await rate(evaluator.id, dan.id, prior.id, 4, "2025-10-01T12:00:00Z")

        const result = await getRatePlayerData()

        expect(result.status).toBe(true)
        expect(result.players).toEqual([])
        expect(result.ratedPlayers).toHaveLength(1)
        expect(result.ratedPlayers[0].player.id).toBe(dan.id)
        expect(result.ratedPlayers[0].canRate).toBe(false)
        expect(result.ratedSeasons).toEqual([
            { seasonId: prior.id, label: "Fall 2025" }
        ])
    })
})
