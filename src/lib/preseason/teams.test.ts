import { describe, expect, it } from "vitest"
import {
    buildTeamsForDivision,
    getSlotViolationEntryIds,
    type TeamBucket,
    type TeamBuildOptions
} from "./teams"
import { toOriginalPlacedPlayer } from "./units"
import type { PreseasonCandidate, PreseasonDivision } from "./types"
import parityFixture from "./teams-parity-fixture.json"

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
        isCoach: false,
        coachDivisionName: null,
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
        malePerTeam: 5,
        nonMalePerTeam: 3,
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

    it("places a coach in a regular division on a slot-3 team without a captain flag", () => {
        const pool = Array.from({ length: 18 }, (_, i) =>
            candidate({
                userId: `t${String(i).padStart(2, "0")}`,
                placementScore: i + 1,
                isCaptain: i < 6
            })
        )
        pool[10] = candidate({
            userId: "coach",
            placementScore: 11,
            isCoach: true,
            coachDivisionName: "BB",
            availableSlots: [3]
        })

        const teams = buildTeamsForDivision(
            division({ teamCount: 6 }),
            pool.map(toOriginalPlacedPlayer),
            WEEK3_OPTIONS
        )

        const home = teams.find((team) =>
            team.players.some((p) => p.entryId === "orig:coach")
        )
        expect(home?.number).toBeGreaterThanOrEqual(5)
        const coach = home?.players.find((p) => p.entryId === "orig:coach")
        expect(coach?.isCaptain).toBe(false)
        expect(getSlotViolationEntryIds(teams).has("orig:coach")).toBe(false)
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

/**
 * The fixture holds outputs captured from the engine BEFORE slot requests
 * existed. With no requests present the engine must reproduce them exactly —
 * this pins the leading slot-penalty tuple element, the loop comparator, and
 * the captain-seeding rework as behavior-neutral for request-free seasons.
 */
describe("zero-request parity", () => {
    function parityPool(captainCount: number) {
        const pool = Array.from({ length: 33 }, (_, i) =>
            candidate({
                userId: `p${String(i).padStart(2, "0")}`,
                placementScore: ((i * 7) % 29) + 3 * (i % 4) + 1,
                male: i % 3 !== 0,
                isCaptain: i < captainCount,
                overallMostRecent: i % 11 === 4 ? null : 1,
                consecutiveSeasonsInTopDiv: (i * 5) % 9
            })
        )
        pool[10] = { ...pool[10], pairUserId: pool[11].userId }
        pool[11] = { ...pool[11], pairUserId: pool[10].userId }
        pool[20] = { ...pool[20], pairUserId: pool[21].userId }
        pool[21] = { ...pool[21], pairUserId: pool[20].userId }

        const placed = pool.map(toOriginalPlacedPlayer)
        placed.push({
            ...pool[8],
            entryId: `dup:${pool[8].userId}:1`,
            sourceUserId: pool[8].userId,
            isDuplicateEntry: true
        })
        return placed
    }

    function project(teams: TeamBucket[]) {
        return teams.map((team) => ({
            number: team.number,
            scoreSum: team.scoreSum,
            maleCount: team.maleCount,
            nonMaleCount: team.nonMaleCount,
            newCount: team.newCount,
            players: team.players.map((p) => ({
                entryId: p.entryId,
                isCaptain: p.isCaptain,
                isNew: p.isNew
            }))
        }))
    }

    it("reproduces the pre-slot-request outputs exactly", () => {
        expect(
            project(
                buildTeamsForDivision(
                    division({ teamCount: 6 }),
                    parityPool(6),
                    { newPlayersRequireCaptainedTeam: true, backCourt: null }
                )
            )
        ).toEqual(parityFixture.week2SixTeams)

        expect(
            project(
                buildTeamsForDivision(
                    division({ teamCount: 4, isLast: true, index: 3 }),
                    parityPool(6),
                    { newPlayersRequireCaptainedTeam: true, backCourt: null }
                )
            )
        ).toEqual(parityFixture.week2LastFourTeams)

        expect(
            project(
                buildTeamsForDivision(
                    division({ teamCount: 6 }),
                    parityPool(4),
                    WEEK3_OPTIONS
                )
            )
        ).toEqual(parityFixture.week3BackCourt)

        expect(
            project(
                buildTeamsForDivision(
                    division({ teamCount: 6, index: 1 }),
                    parityPool(4),
                    WEEK3_OPTIONS
                )
            )
        ).toEqual(parityFixture.week3NoBackCourt)
    })
})

describe("tryout slot requests", () => {
    const NO_CONSTRAINT: TeamBuildOptions = {
        newPlayersRequireCaptainedTeam: false,
        backCourt: null
    }

    function slotPool(
        count: number,
        restrict: (index: number) => number[] | null
    ) {
        return Array.from({ length: count }, (_, i) =>
            candidate({
                userId: `s${String(i).padStart(2, "0")}`,
                placementScore: ((i * 11) % 37) + 1,
                male: i % 3 !== 0,
                availableSlots: restrict(i)
            })
        ).map(toOriginalPlacedPlayer)
    }

    it("places a slot-restricted player on a matching team", () => {
        const teams = buildTeamsForDivision(
            division({ teamCount: 6 }),
            slotPool(36, (i) => (i === 17 ? [1] : i === 23 ? [3] : null)),
            NO_CONSTRAINT
        )

        const teamOf = (userId: string) =>
            teams.find((team) =>
                team.players.some((p) => p.assignmentUserId === userId)
            )
        expect([1, 2]).toContain(teamOf("s17")?.number)
        expect([5, 6]).toContain(teamOf("s23")?.number)
        expect(getSlotViolationEntryIds(teams).size).toBe(0)
    })

    it("honors a full slot's worth of restrictions without violations", () => {
        // 12 players restricted to slot 2 exactly fill teams 3-4
        const teams = buildTeamsForDivision(
            division({ teamCount: 6 }),
            slotPool(36, (i) => (i < 12 ? [2] : null)),
            NO_CONSTRAINT
        )

        for (const team of teams) {
            expect(team.players).toHaveLength(6)
        }

        const restrictedTeams = new Set(
            teams
                .filter((team) =>
                    team.players.some((p) => p.availableSlots !== null)
                )
                .map((team) => team.number)
        )
        expect([...restrictedTeams].sort()).toEqual([3, 4])
        expect(getSlotViolationEntryIds(teams).size).toBe(0)
    })

    it("keeps team sizes when restrictions are unsatisfiable and reports violations", () => {
        // 18 players want slot 1 but slot 1 only holds 12
        const teams = buildTeamsForDivision(
            division({ teamCount: 6 }),
            slotPool(36, (i) => (i < 18 ? [1] : null)),
            NO_CONSTRAINT
        )

        for (const team of teams) {
            expect(team.players).toHaveLength(6)
        }

        expect(getSlotViolationEntryIds(teams).size).toBe(6)
    })

    it("moves a restricted captain to an allowed team, keeping one captain per team", () => {
        // 4 captains on a 6-team division; the second-best captain can only
        // attend slot 2, so they must seed team 3 or 4
        const pool = Array.from({ length: 36 }, (_, i) =>
            candidate({
                userId: `k${String(i).padStart(2, "0")}`,
                placementScore: i + 1,
                male: i % 2 === 0,
                isCaptain: i < 4,
                availableSlots: i === 1 ? [2] : null
            })
        ).map(toOriginalPlacedPlayer)

        const teams = buildTeamsForDivision(
            division({ teamCount: 6 }),
            pool,
            NO_CONSTRAINT
        )

        const captainTeams = new Map(
            teams
                .filter((team) => team.players.some((p) => p.isCaptain))
                .map((team) => [
                    team.players.find((p) => p.isCaptain)?.assignmentUserId,
                    team.number
                ])
        )
        // Every captained team has exactly one captain
        expect(captainTeams.size).toBe(4)
        for (const team of teams) {
            expect(
                team.players.filter((p) => p.isCaptain).length
            ).toBeLessThanOrEqual(1)
        }
        // The restricted captain landed on a slot-2 team
        expect([3, 4]).toContain(captainTeams.get("k01"))
        // Unconstrained captains keep score order over remaining teams
        expect(captainTeams.get("k00")).toBe(1)
        expect(getSlotViolationEntryIds(teams).size).toBe(0)
    })

    it("still seats every captain when captain requests are unsatisfiable", () => {
        // Three captains all demand slot 1 (two slot-1 teams): everyone
        // still seeds a distinct team; one violation is reported
        const pool = Array.from({ length: 18 }, (_, i) =>
            candidate({
                userId: `u${String(i).padStart(2, "0")}`,
                placementScore: i + 1,
                male: i % 2 === 0,
                isCaptain: i < 3,
                availableSlots: i < 3 ? [1] : null
            })
        ).map(toOriginalPlacedPlayer)

        const teams = buildTeamsForDivision(
            division({ teamCount: 6 }),
            pool,
            NO_CONSTRAINT
        )

        const captainedTeams = teams.filter((team) =>
            team.players.some((p) => p.isCaptain)
        )
        expect(captainedTeams).toHaveLength(3)

        const violations = getSlotViolationEntryIds(teams)
        expect(violations.size).toBe(1)
    })

    it("puts only-slot-3 veterans on the back court and keeps slot-1-only players off it", () => {
        const pool = Array.from({ length: 36 }, (_, i) =>
            candidate({
                userId: `b${String(i).padStart(2, "0")}`,
                placementScore: ((i * 7) % 31) + 1,
                male: i % 3 !== 0,
                isCaptain: i < 4,
                consecutiveSeasonsInTopDiv: (i * 5) % 9,
                availableSlots: i === 20 ? [3] : i === 25 ? [1] : null
            })
        ).map(toOriginalPlacedPlayer)

        const teams = buildTeamsForDivision(
            division({ teamCount: 6 }),
            pool,
            WEEK3_OPTIONS
        )

        const teamOf = (userId: string) =>
            teams.find((team) =>
                team.players.some((p) => p.assignmentUserId === userId)
            )
        expect([5, 6]).toContain(teamOf("b20")?.number)
        expect([1, 2]).toContain(teamOf("b25")?.number)
        expect(getSlotViolationEntryIds(teams).size).toBe(0)
    })

    it("capacity still outranks slot requests with the captained-team rule on", () => {
        // Week-2 options: new players must sit on captained teams even if
        // their slot request points elsewhere
        const pool = Array.from({ length: 18 }, (_, i) =>
            candidate({
                userId: `c${String(i).padStart(2, "0")}`,
                placementScore: i + 1,
                male: i % 2 === 0,
                isCaptain: i < 3,
                overallMostRecent: i === 10 ? null : 1,
                availableSlots: i === 10 ? [2] : null
            })
        ).map(toOriginalPlacedPlayer)

        const teams = buildTeamsForDivision(
            division({ teamCount: 3 }),
            pool,
            WEEK2_OPTIONS
        )

        const assigned = teams.flatMap((team) =>
            team.players.map((p) => p.assignmentUserId)
        )
        expect(assigned).toHaveLength(18)
        expect(new Set(assigned).size).toBe(18)
        for (const team of teams) {
            expect(team.players).toHaveLength(6)
        }
    })
})
