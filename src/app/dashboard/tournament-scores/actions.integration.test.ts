import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    tournamentDivisions,
    tournamentMatches,
    tournamentPools,
    tournamentPoolTeams,
    tournamentRoster,
    tournamentTeams,
    tournaments
} from "@/database/schema"
import { createDivision } from "@/test/factories"
import { createUser, createUserWithRoles, logout } from "@/test/session"
import { getScoreEntryRows, saveTournamentMatchScore } from "./actions"

async function winnerOf(matchId: number): Promise<number | null> {
    const [m] = await db
        .select({ w: tournamentMatches.winner_team_id })
        .from(tournamentMatches)
        .where(eq(tournamentMatches.id, matchId))
    return m?.w ?? null
}

const NO_SCORE = {
    homeSet1: null,
    awaySet1: null,
    homeSet2: null,
    awaySet2: null,
    homeSet3: null,
    awaySet3: null
}

// One division "A", one "Pool A" of four teams, plus two pool matches and one
// seeded winners-bracket match — enough to exercise both the pool-play and
// playoff groupings and the work-team visibility filter.
async function seedScorableTournament() {
    const divA = await createDivision({ name: "A", level: 2 })

    const [t] = await db
        .insert(tournaments)
        .values({
            code: `SCORE-${crypto.randomUUID().slice(0, 8)}`,
            year: 2026,
            name: "Score Entry Test",
            phase: "playoffs",
            tournament_date: "2026-08-01",
            tournament_type: "coed",
            pool_size: 4,
            elimination_format: "single"
        })
        .returning({ id: tournaments.id })

    const [tdA] = await db
        .insert(tournamentDivisions)
        .values({
            tournament_id: t.id,
            division_id: divA.id,
            team_count: 4,
            male_per_team: 3,
            non_male_per_team: 3,
            teams_advancing_per_pool: 2,
            sort_order: 0
        })
        .returning({ id: tournamentDivisions.id })

    const teamIds: Record<string, number> = {}
    for (let i = 1; i <= 4; i++) {
        const captain = await createUser()
        const [row] = await db
            .insert(tournamentTeams)
            .values({
                tournament_id: t.id,
                division_id: tdA.id,
                preferred_division_id: tdA.id,
                captain_user_id: captain.id,
                name: `A${i}`
            })
            .returning({ id: tournamentTeams.id })
        teamIds[`A${i}`] = row.id
    }

    const [pool] = await db
        .insert(tournamentPools)
        .values({
            tournament_id: t.id,
            division_id: tdA.id,
            name: "Pool A",
            sort_order: 0
        })
        .returning({ id: tournamentPools.id })
    for (const label of ["A1", "A2", "A3", "A4"]) {
        await db.insert(tournamentPoolTeams).values({
            tournament_id: t.id,
            pool_id: pool.id,
            team_id: teamIds[label]
        })
    }

    // Two pool matches; A3 is the work team on the first, A1 on the second.
    const [m1] = await db
        .insert(tournamentMatches)
        .values({
            tournament_id: t.id,
            division_id: tdA.id,
            pool_id: pool.id,
            bracket: "pool",
            court: 1,
            start_time: "09:00:00",
            home_team_id: teamIds.A1,
            away_team_id: teamIds.A2,
            work_team_id: teamIds.A3
        })
        .returning({ id: tournamentMatches.id })
    await db.insert(tournamentMatches).values({
        tournament_id: t.id,
        division_id: tdA.id,
        pool_id: pool.id,
        bracket: "pool",
        court: 2,
        start_time: "09:00:00",
        home_team_id: teamIds.A3,
        away_team_id: teamIds.A4,
        work_team_id: teamIds.A1
    })

    // One playoff match with both seats filled; A2 works it.
    const [b1] = await db
        .insert(tournamentMatches)
        .values({
            tournament_id: t.id,
            division_id: tdA.id,
            bracket: "winners",
            bracket_round: 1,
            court: 1,
            start_time: "11:00:00",
            home_team_id: teamIds.A1,
            away_team_id: teamIds.A4,
            work_team_id: teamIds.A2
        })
        .returning({ id: tournamentMatches.id })

    return {
        tId: t.id,
        teamIds,
        poolMatch1Id: m1.id,
        bracketMatchId: b1.id
    }
}

describe("getScoreEntryRows", () => {
    it("returns 'Not authenticated' for unauthenticated callers", async () => {
        logout()
        const result = await getScoreEntryRows()
        expect(result).toEqual({ status: false, message: "Not authenticated." })
    })

    it("groups every playable match by pool and bracket round for an admin", async () => {
        await seedScorableTournament()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getScoreEntryRows()
        expect(result.status).toBe(true)
        if (!result.status || !result.data) throw new Error("expected view")
        const { view, poolSetsCount, playoffSetsCount } = result.data

        // Default sets config: pool exact-2, playoffs best-of-3.
        expect(poolSetsCount).toBe(2)
        expect(playoffSetsCount).toBe(3)

        expect(view.hasPoolMatches).toBe(true)
        expect(view.hasBracketMatches).toBe(true)
        expect(view.divisions).toHaveLength(1)

        const div = view.divisions[0]
        expect(div.name).toBe("A")
        expect(div.pools).toHaveLength(1)
        expect(div.pools[0].name).toBe("Pool A")
        expect(div.pools[0].matches).toHaveLength(2)

        expect(div.bracketGroups).toHaveLength(1)
        expect(div.bracketGroups[0].bracket).toBe("winners")
        expect(div.bracketGroups[0].round).toBe(1)
        expect(div.bracketGroups[0].matches).toHaveLength(1)
    })

    it("shows a non-admin only the matches their team works", async () => {
        const { tId, teamIds } = await seedScorableTournament()
        const user = await createUserWithRoles([{ role: "captain" }])
        // Roster the caller onto A3 — the work team for exactly one pool match.
        await db.insert(tournamentRoster).values({
            tournament_id: tId,
            team_id: teamIds.A3,
            user_id: user.id,
            added_by_user_id: user.id
        })

        const result = await getScoreEntryRows()
        expect(result.status).toBe(true)
        if (!result.status || !result.data) throw new Error("expected view")
        const { view } = result.data

        expect(view.hasPoolMatches).toBe(true)
        expect(view.hasBracketMatches).toBe(false)
        expect(view.divisions).toHaveLength(1)
        expect(view.divisions[0].pools).toHaveLength(1)
        expect(view.divisions[0].pools[0].matches).toHaveLength(1)
        // The single visible match is the one A3 works (A1 vs A2).
        const only = view.divisions[0].pools[0].matches[0]
        expect(only.home?.id).toBe(teamIds.A1)
        expect(only.away?.id).toBe(teamIds.A2)
    })
})

describe("saveTournamentMatchScore — format-aware winner", () => {
    it("pool (exact-2): a 1-1 split records no winner", async () => {
        const { poolMatch1Id } = await seedScorableTournament()
        await createUserWithRoles([{ role: "admin" }])

        // A1 (home) takes set 1, A2 (away) takes set 2 — a split.
        const result = await saveTournamentMatchScore(poolMatch1Id, {
            ...NO_SCORE,
            homeSet1: 25,
            awaySet1: 20,
            homeSet2: 20,
            awaySet2: 25
        })
        expect(result.status).toBe(true)
        expect(await winnerOf(poolMatch1Id)).toBeNull()
    })

    it("pool (exact-2): a 2-0 records the winner", async () => {
        const { poolMatch1Id, teamIds } = await seedScorableTournament()
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveTournamentMatchScore(poolMatch1Id, {
            ...NO_SCORE,
            homeSet1: 25,
            awaySet1: 20,
            homeSet2: 25,
            awaySet2: 20
        })
        expect(result.status).toBe(true)
        expect(await winnerOf(poolMatch1Id)).toBe(teamIds.A1)
    })

    it("playoff (best-of-3): not decided until a side clinches two sets", async () => {
        const { bracketMatchId, teamIds } = await seedScorableTournament()
        await createUserWithRoles([{ role: "admin" }])

        // Only one set entered — best-of-3 is not yet decided.
        const partial = await saveTournamentMatchScore(bracketMatchId, {
            ...NO_SCORE,
            homeSet1: 25,
            awaySet1: 18
        })
        expect(partial.status).toBe(true)
        expect(await winnerOf(bracketMatchId)).toBeNull()

        // Second set clinches it 2-0 for the home seat (A1).
        const clinched = await saveTournamentMatchScore(bracketMatchId, {
            ...NO_SCORE,
            homeSet1: 25,
            awaySet1: 18,
            homeSet2: 25,
            awaySet2: 18
        })
        expect(clinched.status).toBe(true)
        expect(await winnerOf(bracketMatchId)).toBe(teamIds.A1)
    })
})
