import { describe, expect, it } from "vitest"
import { buildTeamsForDivision, type TeamBuildOptions } from "./teams"
import { toOriginalPlacedPlayer } from "./units"
import type { PreseasonCandidate, PreseasonDivision } from "./types"

function candidate(
    overrides: Partial<PreseasonCandidate> = {}
): PreseasonCandidate {
    const id = overrides.userId ?? "user-x"
    return {
        userId: id,
        firstName: `First-${id}`,
        lastName: `Last-${id}`,
        preferredName: null,
        male: true,
        pairUserId: null,
        pairWithName: null,
        overallMostRecent: 1,
        placementScore: 50,
        ratingScore: null,
        seasonsPlayedCount: 1,
        captainDivisionId: null,
        captainDivisionName: null,
        isCaptain: false,
        ...overrides
    }
}

function division(
    overrides: Partial<PreseasonDivision> = {}
): PreseasonDivision {
    return {
        id: 1,
        name: "AA",
        level: 1,
        index: 0,
        teamCount: 3,
        isLast: false,
        usesCoaches: false,
        ...overrides
    }
}

const WEEK2_OPTIONS: TeamBuildOptions = {
    newPlayersRequireCaptainedTeam: true,
    backCourt: null
}

const WEEK3_OPTIONS: TeamBuildOptions = {
    newPlayersRequireCaptainedTeam: false,
    backCourt: { divisionIndex: 0, requiredTeamCount: 6, backTeamCount: 2 }
}

describe("buildTeamsForDivision", () => {
    it("builds balanced teams with captains spread across them", () => {
        const pool = Array.from({ length: 18 }, (_, i) =>
            candidate({
                userId: `t${String(i).padStart(2, "0")}`,
                placementScore: i + 1,
                male: i % 2 === 0,
                isCaptain: i < 3
            })
        )
        // A mutual pair among non-captains
        pool[10] = { ...pool[10], pairUserId: pool[11].userId }
        pool[11] = { ...pool[11], pairUserId: pool[10].userId }

        const teams = buildTeamsForDivision(
            division(),
            pool.map(toOriginalPlacedPlayer),
            WEEK2_OPTIONS
        )

        expect(teams).toHaveLength(3)

        const assigned = teams.flatMap((team) =>
            team.players.map((p) => p.assignmentUserId)
        )
        expect(assigned).toHaveLength(18)
        expect(new Set(assigned).size).toBe(18)

        for (const team of teams) {
            expect(team.players).toHaveLength(6)
            expect(team.players.filter((p) => p.isCaptain)).toHaveLength(1)
            // 9 males over 3 teams → 3 per team
            expect(team.maleCount).toBe(3)
        }

        // The mutual pair lands on one team together
        const pairTeams = teams.filter((team) =>
            team.players.some(
                (p) =>
                    p.assignmentUserId === pool[10].userId ||
                    p.assignmentUserId === pool[11].userId
            )
        )
        expect(pairTeams).toHaveLength(1)
    })

    it("keeps new players off uncaptained teams when the constraint is on", () => {
        // 2 captains for 3 teams → one team has no captain. Only two new
        // players, so the captained teams have room for them (the constraint
        // is hard only while capacity allows).
        const pool = Array.from({ length: 18 }, (_, i) =>
            candidate({
                userId: `t${String(i).padStart(2, "0")}`,
                placementScore: i + 1,
                male: i % 2 === 0,
                isCaptain: i < 2,
                overallMostRecent: i === 10 || i === 15 ? null : 1
            })
        )

        const teams = buildTeamsForDivision(
            division(),
            pool.map(toOriginalPlacedPlayer),
            WEEK2_OPTIONS
        )

        const uncaptainedTeams = teams.filter(
            (team) => !team.players.some((p) => p.isCaptain)
        )
        expect(uncaptainedTeams.length).toBeGreaterThan(0)
        for (const team of uncaptainedTeams) {
            expect(team.players.filter((p) => p.isNew)).toHaveLength(0)
        }
    })

    it("allows new players on uncaptained teams when the constraint is off", () => {
        const pool = Array.from({ length: 18 }, (_, i) =>
            candidate({
                userId: `t${String(i).padStart(2, "0")}`,
                placementScore: i + 1,
                male: i % 2 === 0,
                isCaptain: i < 2,
                overallMostRecent: i % 3 === 2 ? null : 1
            })
        )

        const teams = buildTeamsForDivision(
            division(),
            pool.map(toOriginalPlacedPlayer),
            { newPlayersRequireCaptainedTeam: false, backCourt: null }
        )

        // 6 new players over 3 teams: balance targets put some on every team,
        // including the uncaptained one
        const uncaptained = teams.filter(
            (team) => !team.players.some((p) => p.isCaptain)
        )
        expect(uncaptained.length).toBeGreaterThan(0)
        expect(
            uncaptained.some((team) => team.players.some((p) => p.isNew))
        ).toBe(true)
    })

    it("treats coach-division captains as regular players", () => {
        const pool = Array.from({ length: 12 }, (_, i) =>
            candidate({
                userId: `t${String(i).padStart(2, "0")}`,
                placementScore: i + 1,
                isCaptain: i < 3
            })
        )

        const teams = buildTeamsForDivision(
            division({ usesCoaches: true }),
            pool.map(toOriginalPlacedPlayer),
            WEEK2_OPTIONS
        )

        for (const team of teams) {
            expect(team.players.filter((p) => p.isCaptain)).toHaveLength(0)
        }
    })

    describe("back-court split", () => {
        function buildBackCourtPool() {
            // 36 players: 4 captains, 4 new players, seniority variety
            return Array.from({ length: 36 }, (_, i) =>
                candidate({
                    userId: `t${String(i).padStart(2, "0")}`,
                    placementScore: ((i * 7) % 31) + 1,
                    male: i % 3 !== 0,
                    isCaptain: i < 4,
                    overallMostRecent: i >= 32 ? null : 1,
                    consecutiveSeasonsInTopDiv: (i * 5) % 9
                })
            )
        }

        it("keeps captains and new players off the back-court teams", () => {
            const teams = buildTeamsForDivision(
                division({ teamCount: 6 }),
                buildBackCourtPool().map(toOriginalPlacedPlayer),
                WEEK3_OPTIONS
            )

            expect(teams).toHaveLength(6)
            const backTeams = teams.slice(4)
            for (const team of backTeams) {
                expect(team.players.filter((p) => p.isCaptain)).toHaveLength(0)
                expect(team.players.filter((p) => p.isNew)).toHaveLength(0)
            }

            // Front teams 1-4 each get one captain
            for (const team of teams.slice(0, 4)) {
                expect(team.players.filter((p) => p.isCaptain)).toHaveLength(1)
            }
        })

        it("fills the back court with the most experienced eligible players", () => {
            const teams = buildTeamsForDivision(
                division({ teamCount: 6 }),
                buildBackCourtPool().map(toOriginalPlacedPlayer),
                WEEK3_OPTIONS
            )

            const backSeniority = teams
                .slice(4)
                .flatMap((team) =>
                    team.players.map((p) => p.consecutiveSeasonsInTopDiv)
                )
            // The very most-senior players (8 consecutive seasons in the
            // fixture) all sit on the back court
            expect(Math.max(...backSeniority)).toBe(8)
        })

        it("does not activate for divisions with a different team count", () => {
            const teams = buildTeamsForDivision(
                division({ teamCount: 4, isLast: true }),
                buildBackCourtPool().map(toOriginalPlacedPlayer),
                WEEK3_OPTIONS
            )

            // Captains seed normally when the split is inactive
            const captainedTeams = teams.filter((team) =>
                team.players.some((p) => p.isCaptain)
            )
            expect(captainedTeams).toHaveLength(4)
        })

        it("places every player exactly once with the split active", () => {
            const placed = buildBackCourtPool().map(toOriginalPlacedPlayer)
            const teams = buildTeamsForDivision(
                division({ teamCount: 6 }),
                placed,
                WEEK3_OPTIONS
            )

            const assigned = teams.flatMap((team) =>
                team.players.map((p) => p.entryId)
            )
            expect(assigned).toHaveLength(36)
            expect(new Set(assigned).size).toBe(36)
        })
    })
})
