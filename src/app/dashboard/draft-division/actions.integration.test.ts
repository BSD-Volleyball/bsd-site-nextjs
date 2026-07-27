import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { drafts, individual_divisions } from "@/database/schema"
import {
    createDivision,
    createSeason,
    createSignup,
    createTeam
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { getDraftDivisionData, submitDraft } from "./actions"

async function seedDraftSeason() {
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

describe("getDraftDivisionData", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await getDraftDivisionData()
        expect(result).toEqual({
            status: false,
            message: "You don't have permission to access this page."
        })
    })

    it("rejects a signed-in player with no draft-page role", async () => {
        await seedDraftSeason()
        await createUserWithRoles([])
        const result = await getDraftDivisionData()
        expect(result).toEqual({
            status: false,
            message: "You don't have permission to access this page."
        })
    })

    it("shows a division-scoped commissioner only their division", async () => {
        const { season, divA } = await seedDraftSeason()
        await createUserWithRoles([
            {
                role: "commissioner",
                seasonId: season.id,
                divisionId: divA.id
            }
        ])

        const result = await getDraftDivisionData()
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected data")
        expect(result.data.currentSeasonId).toBe(season.id)
        expect(result.data.divisions.map((d) => d.id)).toEqual([divA.id])
    })

    it("shows an admin every configured division and undrafted signups", async () => {
        const { season, divA, divBB } = await seedDraftSeason()
        const undrafted = await createUser()
        const drafted = await createUser()
        await createSignup({ season: season.id, player: undrafted.id })
        await createSignup({ season: season.id, player: drafted.id })
        const captain = await createUser()
        const team = await createTeam({
            season: season.id,
            captain: captain.id,
            division: divA.id,
            number: 1
        })
        await db
            .insert(drafts)
            .values({ team: team.id, user: drafted.id, round: 1, overall: 1 })
        await createUserWithRoles([{ role: "admin" }])

        const result = await getDraftDivisionData()
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected data")
        expect(result.data.divisions.map((d) => d.id)).toEqual([
            divA.id,
            divBB.id
        ])
        const userIds = result.data.users.map((u) => u.id)
        expect(userIds).toContain(undrafted.id)
        expect(userIds).not.toContain(drafted.id)
    })
})

describe("submitDraft", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await submitDraft(2, [
            { teamId: 1, teamNumber: 1, userId: "u", round: 1 }
        ])
        expect(result).toEqual({
            status: false,
            message: "You don't have permission to perform this action."
        })
    })

    it("rejects an empty pick list", async () => {
        await seedDraftSeason()
        await createUserWithRoles([{ role: "admin" }])
        const result = await submitDraft(2, [])
        expect(result).toEqual({
            status: false,
            message: "No draft picks to submit."
        })
    })

    it("rejects a division-scoped commissioner drafting another division", async () => {
        const { season, divA, divBB } = await seedDraftSeason()
        const captain = await createUser()
        const team = await createTeam({
            season: season.id,
            captain: captain.id,
            division: divA.id,
            number: 1
        })
        const player = await createUser()
        await createUserWithRoles([
            {
                role: "commissioner",
                seasonId: season.id,
                divisionId: divBB.id
            }
        ])

        const result = await submitDraft(2, [
            { teamId: team.id, teamNumber: 1, userId: player.id, round: 1 }
        ])
        expect(result).toEqual({
            status: false,
            message:
                "You don't have permission to submit this division's draft."
        })
    })

    it("inserts snake-draft picks with computed overall numbers", async () => {
        const { season, divA } = await seedDraftSeason()
        const cap1 = await createUser()
        const cap2 = await createUser()
        const team1 = await createTeam({
            season: season.id,
            captain: cap1.id,
            division: divA.id,
            name: "One",
            number: 1
        })
        const team2 = await createTeam({
            season: season.id,
            captain: cap2.id,
            division: divA.id,
            name: "Two",
            number: 2
        })
        const players = await Promise.all([
            createUser(),
            createUser(),
            createUser(),
            createUser()
        ])
        await createUserWithRoles([{ role: "admin" }])

        const result = await submitDraft(2, [
            {
                teamId: team1.id,
                teamNumber: 1,
                userId: players[0].id,
                round: 1
            },
            {
                teamId: team2.id,
                teamNumber: 2,
                userId: players[1].id,
                round: 1
            },
            {
                teamId: team1.id,
                teamNumber: 1,
                userId: players[2].id,
                round: 2
            },
            { teamId: team2.id, teamNumber: 2, userId: players[3].id, round: 2 }
        ])
        expect(result.status).toBe(true)
        expect(result.message).toBe("Successfully submitted 4 draft picks!")

        const rows = await db.select().from(drafts)
        expect(rows).toHaveLength(4)
        const overallFor = (userId: string) =>
            rows.find((r) => r.user === userId)?.overall
        // divisionLevel 2, 2 teams: base = 50 + (round-1)*2
        // round 1 (odd): position = teamNumber → 51, 52
        expect(overallFor(players[0].id)).toBe(51)
        expect(overallFor(players[1].id)).toBe(52)
        // round 2 (even): position = 3 - teamNumber → team1: 54, team2: 53
        expect(overallFor(players[2].id)).toBe(54)
        expect(overallFor(players[3].id)).toBe(53)
    })
})
