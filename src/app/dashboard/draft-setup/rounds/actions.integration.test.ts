import { and, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    draftCaptRounds,
    draftPairDiffs,
    individual_divisions
} from "@/database/schema"
import { createDivision, createSeason, createTeam } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import {
    getPrepareForDraftData,
    lockDraftRounds,
    setCaptainRound,
    setPairDiff
} from "./actions"

async function seedSeasonWithDivisions() {
    const season = await createSeason()
    const divA = await createDivision({ name: "A", level: 2 })
    const divBB = await createDivision({ name: "BB", level: 6 })
    await db.insert(individual_divisions).values([
        {
            season: season.id,
            division: divA.id,
            gender_split: "5-3",
            teams: 4
        },
        {
            season: season.id,
            division: divBB.id,
            gender_split: "5-3",
            teams: 4
        }
    ])
    return { season, divA, divBB }
}

describe("getPrepareForDraftData", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await getPrepareForDraftData()
        expect(result).toEqual({
            status: false,
            message: "Not authenticated"
        })
    })

    it("rejects authenticated users without commissioner access", async () => {
        await seedSeasonWithDivisions()
        await createUserWithRoles([{ role: "captain" }])
        const result = await getPrepareForDraftData()
        expect(result).toEqual({
            status: false,
            message: "You are not authorized to access this page."
        })
    })

    it("gives an admin league-wide access to all season divisions", async () => {
        const { divA, divBB } = await seedSeasonWithDivisions()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getPrepareForDraftData()
        expect(result.status).toBe(true)
        expect(result.data?.isLeagueWide).toBe(true)
        expect(result.data?.availableDivisions.map((d) => d.id)).toEqual([
            divA.id,
            divBB.id
        ])
        // Defaults to the lowest-level division
        expect(result.data?.divisionId).toBe(divA.id)
    })

    it("restricts a division-scoped commissioner to their own division", async () => {
        const { season, divA, divBB } = await seedSeasonWithDivisions()
        await createUserWithRoles([
            {
                role: "commissioner",
                seasonId: season.id,
                divisionId: divBB.id
            }
        ])

        // Requesting the other division must be ignored
        const result = await getPrepareForDraftData(divA.id)
        expect(result.status).toBe(true)
        expect(result.data?.isLeagueWide).toBe(false)
        expect(result.data?.availableDivisions.map((d) => d.id)).toEqual([
            divBB.id
        ])
        expect(result.data?.divisionId).toBe(divBB.id)
    })
})

describe("setCaptainRound", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await setCaptainRound({
            captainId: "x",
            round: 3,
            divisionId: 1
        })
        expect(result).toEqual({ status: false, message: "Not authorized" })
    })

    it("rejects an out-of-range round", async () => {
        await seedSeasonWithDivisions()
        await createUserWithRoles([{ role: "admin" }])
        const result = await setCaptainRound({
            captainId: "x",
            round: 9,
            divisionId: 1
        })
        expect(result).toEqual({
            status: false,
            message: "Invalid round (must be 1–8)"
        })
    })

    it("rejects a division-scoped commissioner writing another division", async () => {
        const { season, divA, divBB } = await seedSeasonWithDivisions()
        const captain = await createUser()
        await createUserWithRoles([
            {
                role: "commissioner",
                seasonId: season.id,
                divisionId: divBB.id
            }
        ])
        const result = await setCaptainRound({
            captainId: captain.id,
            round: 2,
            divisionId: divA.id
        })
        expect(result).toEqual({
            status: false,
            message: "You don't have permission for this division."
        })
    })

    it("saves and upserts a captain's round", async () => {
        const { season, divA } = await seedSeasonWithDivisions()
        const captain = await createUser()
        const admin = await createUserWithRoles([{ role: "admin" }])

        const first = await setCaptainRound({
            captainId: captain.id,
            round: 2,
            divisionId: divA.id
        })
        expect(first.status).toBe(true)

        const second = await setCaptainRound({
            captainId: captain.id,
            round: 5,
            divisionId: divA.id
        })
        expect(second.status).toBe(true)

        const rows = await db
            .select()
            .from(draftCaptRounds)
            .where(
                and(
                    eq(draftCaptRounds.season, season.id),
                    eq(draftCaptRounds.captain, captain.id)
                )
            )
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            division: divA.id,
            round: 5,
            saved_by: admin.id
        })
    })
})

describe("setPairDiff", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await setPairDiff({
            player1Id: "a",
            player2Id: "b",
            diff: 2,
            divisionId: 1
        })
        expect(result).toEqual({ status: false, message: "Not authorized" })
    })

    it("saves a pair differential, replacing either ordering", async () => {
        const { season, divA } = await seedSeasonWithDivisions()
        const p1 = await createUser()
        const p2 = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const first = await setPairDiff({
            player1Id: p1.id,
            player2Id: p2.id,
            diff: 2,
            divisionId: divA.id
        })
        expect(first.status).toBe(true)

        // Save again with the players swapped: old row must be replaced
        const second = await setPairDiff({
            player1Id: p2.id,
            player2Id: p1.id,
            diff: 4,
            divisionId: divA.id
        })
        expect(second.status).toBe(true)

        const rows = await db
            .select()
            .from(draftPairDiffs)
            .where(eq(draftPairDiffs.season, season.id))
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            player1: p2.id,
            player2: p1.id,
            diff: 4,
            division: divA.id
        })
    })
})

describe("lockDraftRounds", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await lockDraftRounds({ divisionId: 1 })
        expect(result).toEqual({ status: false, message: "Not authorized" })
    })

    it("rejects a division-scoped commissioner locking another division", async () => {
        const { season, divA, divBB } = await seedSeasonWithDivisions()
        await createUserWithRoles([
            {
                role: "commissioner",
                seasonId: season.id,
                divisionId: divBB.id
            }
        ])
        const result = await lockDraftRounds({ divisionId: divA.id })
        expect(result).toEqual({
            status: false,
            message: "You don't have permission for this division."
        })
    })

    it("refuses to lock while a captain has no saved round", async () => {
        const { season, divA } = await seedSeasonWithDivisions()
        const seated = await createUser({ first_name: "Ann", last_name: "A" })
        const unseated = await createUser({
            first_name: "Bob",
            last_name: "Beta"
        })
        await createTeam({
            season: season.id,
            division: divA.id,
            captain: seated.id
        })
        await createTeam({
            season: season.id,
            division: divA.id,
            captain: unseated.id
        })
        await createUserWithRoles([{ role: "admin" }])
        await setCaptainRound({
            captainId: seated.id,
            round: 1,
            divisionId: divA.id
        })

        const result = await lockDraftRounds({ divisionId: divA.id })
        expect(result.status).toBe(false)
        expect(result.message).toContain("Bob Beta")

        const [row] = await db
            .select({ lockedAt: individual_divisions.draft_rounds_locked_at })
            .from(individual_divisions)
            .where(eq(individual_divisions.division, divA.id))
        expect(row.lockedAt).toBeNull()
    })

    it("stamps the lock once every captain is seated", async () => {
        const { season, divA } = await seedSeasonWithDivisions()
        const captain = await createUser()
        await createTeam({
            season: season.id,
            division: divA.id,
            captain: captain.id
        })
        const admin = await createUserWithRoles([{ role: "admin" }])
        await setCaptainRound({
            captainId: captain.id,
            round: 3,
            divisionId: divA.id
        })

        const result = await lockDraftRounds({ divisionId: divA.id })
        expect(result.status).toBe(true)

        const [row] = await db
            .select({
                lockedAt: individual_divisions.draft_rounds_locked_at,
                lockedBy: individual_divisions.draft_rounds_locked_by
            })
            .from(individual_divisions)
            .where(eq(individual_divisions.division, divA.id))
        expect(row.lockedAt).toBeInstanceOf(Date)
        expect(row.lockedBy).toBe(admin.id)
    })
})
