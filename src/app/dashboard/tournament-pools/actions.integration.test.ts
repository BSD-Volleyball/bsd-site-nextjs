import { and, eq, ne } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    tournamentDivisions,
    tournamentMatches,
    tournamentPools,
    tournamentPoolTeams,
    tournamentTeams,
    tournaments
} from "@/database/schema"
import { createDivision } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { seedTournamentBracket } from "@/lib/tournament-brackets"
import {
    getTournamentBracketEditorView,
    revertBracketSeeding,
    saveBracketPlacements
} from "./actions"

// Builds a tournament with two divisions, each with two pools of three teams,
// advancing two per pool → a clean four-team bracket (two round-1 winners games)
// per division. Pool matches are intentionally omitted: getPoolStandings falls
// back to name order, so seeding is deterministic (A1,A2 advance from Pool A1…).
async function seedPlayoffTournament(phase: "pool_play" | "playoffs") {
    const divA = await createDivision({ name: "A", level: 2 })
    const divBB = await createDivision({ name: "BB", level: 6 })

    const [t] = await db
        .insert(tournaments)
        .values({
            code: `INT-${crypto.randomUUID().slice(0, 8)}`,
            year: 2026,
            name: "Integration Playoff Test",
            phase: "pool_play",
            tournament_date: "2026-08-01",
            tournament_type: "coed",
            pool_size: 3,
            elimination_format: "single"
        })
        .returning({ id: tournaments.id })

    const [tdA] = await db
        .insert(tournamentDivisions)
        .values({
            tournament_id: t.id,
            division_id: divA.id,
            team_count: 6,
            male_per_team: 3,
            non_male_per_team: 3,
            teams_advancing_per_pool: 2,
            sort_order: 0
        })
        .returning({ id: tournamentDivisions.id })
    const [tdBB] = await db
        .insert(tournamentDivisions)
        .values({
            tournament_id: t.id,
            division_id: divBB.id,
            team_count: 6,
            male_per_team: 3,
            non_male_per_team: 3,
            teams_advancing_per_pool: 2,
            sort_order: 1
        })
        .returning({ id: tournamentDivisions.id })

    const teamIds: Record<string, number> = {}
    for (const [label, td] of [
        ["A", tdA.id],
        ["BB", tdBB.id]
    ] as const) {
        for (let i = 1; i <= 6; i++) {
            const captain = await createUser()
            const [row] = await db
                .insert(tournamentTeams)
                .values({
                    tournament_id: t.id,
                    division_id: td,
                    preferred_division_id: td,
                    captain_user_id: captain.id,
                    name: `${label}${i}`
                })
                .returning({ id: tournamentTeams.id })
            teamIds[`${label}${i}`] = row.id
        }
    }

    async function pool(
        td: number,
        name: string,
        sort: number,
        members: string[]
    ) {
        const [p] = await db
            .insert(tournamentPools)
            .values({
                tournament_id: t.id,
                division_id: td,
                name,
                sort_order: sort
            })
            .returning({ id: tournamentPools.id })
        for (const m of members) {
            await db.insert(tournamentPoolTeams).values({
                tournament_id: t.id,
                pool_id: p.id,
                team_id: teamIds[m]
            })
        }
    }
    await pool(tdA.id, "Pool A1", 0, ["A1", "A2", "A3"])
    await pool(tdA.id, "Pool A2", 1, ["A4", "A5", "A6"])
    await pool(tdBB.id, "Pool B1", 0, ["BB1", "BB2", "BB3"])
    await pool(tdBB.id, "Pool B2", 1, ["BB4", "BB5", "BB6"])

    if (phase === "playoffs") {
        await seedTournamentBracket(t.id)
        await db
            .update(tournaments)
            .set({ phase: "playoffs" })
            .where(eq(tournaments.id, t.id))
    }

    return { tId: t.id, tdA: tdA.id, tdBB: tdBB.id, teamIds }
}

/** All round-1 winners games (both divisions) as a savable snapshot. */
function snapshot(view: {
    divisions: {
        games: { matchId: number; home: number | null; away: number | null }[]
    }[]
}) {
    return view.divisions.flatMap((d) =>
        d.games.map((g) => ({ matchId: g.matchId, home: g.home, away: g.away }))
    )
}

async function teamDivision(teamId: number): Promise<number | null> {
    const [row] = await db
        .select({ d: tournamentTeams.division_id })
        .from(tournamentTeams)
        .where(eq(tournamentTeams.id, teamId))
    return row?.d ?? null
}

describe("getTournamentBracketEditorView", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await getTournamentBracketEditorView()
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("rejects authenticated non-admins", async () => {
        await seedPlayoffTournament("playoffs")
        await createUserWithRoles([{ role: "captain" }])
        const result = await getTournamentBracketEditorView()
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("returns null when the tournament is not in the playoffs phase", async () => {
        await seedPlayoffTournament("pool_play")
        await createUserWithRoles([{ role: "admin" }])
        const result = await getTournamentBracketEditorView()
        expect(result.status).toBe(true)
        if (result.status) expect(result.data).toBeNull()
    })

    it("returns the seeded bracket with pool-rank annotations for an admin", async () => {
        await seedPlayoffTournament("playoffs")
        await createUserWithRoles([{ role: "admin" }])

        const result = await getTournamentBracketEditorView()
        expect(result.status).toBe(true)
        if (!result.status || !result.data) throw new Error("expected view")
        const view = result.data

        expect(view.divisions.map((d) => d.divisionName)).toEqual(["A", "BB"])
        for (const d of view.divisions) {
            expect(d.games).toHaveLength(2)
            for (const g of d.games) {
                expect(g.home).not.toBeNull()
                expect(g.away).not.toBeNull()
            }
        }
        // 12 teams total; 8 advanced (top 2 of each pool of 3), 4 did not.
        expect(view.placeableTeams).toHaveLength(12)
        expect(view.placeableTeams.filter((t) => t.advanced)).toHaveLength(8)
        expect(view.placeableTeams.filter((t) => !t.advanced)).toHaveLength(4)
        const a1 = view.placeableTeams.find((t) => t.name === "A1")
        expect(a1?.annotation).toBe("A · Pool A1 #1")
        expect(view.bracketHasScores).toBe(false)
        expect(view.eliminationFormat).toBe("single")
    })
})

describe("saveBracketPlacements", () => {
    it("rejects non-admins", async () => {
        await seedPlayoffTournament("playoffs")
        await createUserWithRoles([{ role: "captain" }])
        const result = await saveBracketPlacements([])
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("moves a team across divisions and reconciles final divisions", async () => {
        const { tId, tdA, tdBB } = await seedPlayoffTournament("playoffs")
        await createUserWithRoles([{ role: "admin" }])

        const before = await getTournamentBracketEditorView()
        if (!before.status || !before.data) throw new Error("expected view")
        const view = before.data
        const aGames = view.divisions.find((d) => d.divisionName === "A")!.games
        const bGames = view.divisions.find(
            (d) => d.divisionName === "BB"
        )!.games

        const movedTeam = aGames[0].away! // an A-origin team in A's bracket
        const displaced = bGames[0].home! // the BB team it will bump out
        expect(await teamDivision(movedTeam)).toBe(tdA)

        const payload = snapshot(view).map((g) => {
            if (g.matchId === aGames[0].matchId) return { ...g, away: null }
            if (g.matchId === bGames[0].matchId)
                return { ...g, home: movedTeam }
            return g
        })
        const result = await saveBracketPlacements(payload)
        expect(result.status).toBe(true)

        // Match slots updated
        const [aSlot] = await db
            .select()
            .from(tournamentMatches)
            .where(eq(tournamentMatches.id, aGames[0].matchId))
        expect(aSlot.away_team_id).toBeNull()
        const [bSlot] = await db
            .select()
            .from(tournamentMatches)
            .where(eq(tournamentMatches.id, bGames[0].matchId))
        expect(bSlot.home_team_id).toBe(movedTeam)

        // Final divisions reconciled: moved team → BB; displaced team stays in
        // BB (its origin) even though it is now unplaced.
        expect(await teamDivision(movedTeam)).toBe(tdBB)
        expect(await teamDivision(displaced)).toBe(tdBB)

        // Displaced team is in no bracket slot anymore.
        const bracket = await db
            .select()
            .from(tournamentMatches)
            .where(
                and(
                    eq(tournamentMatches.tournament_id, tId),
                    ne(tournamentMatches.bracket, "pool")
                )
            )
        const placed = bracket.some(
            (m) => m.home_team_id === displaced || m.away_team_id === displaced
        )
        expect(placed).toBe(false)
    })

    it("rejects placing the same team in two slots", async () => {
        await seedPlayoffTournament("playoffs")
        await createUserWithRoles([{ role: "admin" }])
        const before = await getTournamentBracketEditorView()
        if (!before.status || !before.data) throw new Error("expected view")
        const view = before.data
        const g0 = view.divisions[0].games[0]

        const payload = snapshot(view).map((g) =>
            g.matchId === g0.matchId ? { ...g, away: g0.home } : g
        )
        const result = await saveBracketPlacements(payload)
        expect(result).toEqual({
            status: false,
            message: "A team can only be placed in one game."
        })
    })

    it("rejects a payload that does not cover every game", async () => {
        await seedPlayoffTournament("playoffs")
        await createUserWithRoles([{ role: "admin" }])
        const before = await getTournamentBracketEditorView()
        if (!before.status || !before.data) throw new Error("expected view")
        const partial = snapshot(before.data).slice(0, 1)
        const result = await saveBracketPlacements(partial)
        expect(result).toEqual({
            status: false,
            message: "Placement payload does not match the bracket."
        })
    })
})

describe("revertBracketSeeding", () => {
    it("rejects non-admins", async () => {
        await seedPlayoffTournament("playoffs")
        await createUserWithRoles([{ role: "captain" }])
        const result = await revertBracketSeeding()
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("re-seeds the bracket and resets cross-division moves", async () => {
        const { tdA, tdBB } = await seedPlayoffTournament("playoffs")
        await createUserWithRoles([{ role: "admin" }])

        // First move a team across divisions, then revert.
        const before = await getTournamentBracketEditorView()
        if (!before.status || !before.data) throw new Error("expected view")
        const view = before.data
        const aGames = view.divisions.find((d) => d.divisionName === "A")!.games
        const bGames = view.divisions.find(
            (d) => d.divisionName === "BB"
        )!.games
        const movedTeam = aGames[0].away!
        const payload = snapshot(view).map((g) => {
            if (g.matchId === aGames[0].matchId) return { ...g, away: null }
            if (g.matchId === bGames[0].matchId)
                return { ...g, home: movedTeam }
            return g
        })
        await saveBracketPlacements(payload)
        expect(await teamDivision(movedTeam)).toBe(tdBB)

        const result = await revertBracketSeeding()
        expect(result.status).toBe(true)

        // Division reset to the team's pool origin.
        expect(await teamDivision(movedTeam)).toBe(tdA)

        // Bracket rebuilt: both divisions have two fully populated games again.
        const after = await getTournamentBracketEditorView()
        if (!after.status || !after.data) throw new Error("expected view")
        for (const d of after.data.divisions) {
            expect(d.games).toHaveLength(2)
            for (const g of d.games) {
                expect(g.home).not.toBeNull()
                expect(g.away).not.toBeNull()
            }
        }
    })
})
