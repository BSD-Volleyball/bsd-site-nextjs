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
import { getScoreEntryRows } from "./actions"

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
    await db.insert(tournamentMatches).values({
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

    return { tId: t.id, teamIds, poolMatch1Id: m1.id }
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
        const view = result.data

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
        const view = result.data

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
