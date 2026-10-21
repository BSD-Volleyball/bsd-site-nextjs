import { beforeEach, describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { drafts, individual_divisions, userRoles } from "@/database/schema"
import { getDraftBoardDivisions } from "@/lib/draft-results"
import { createDivision, createSeason, createTeam } from "@/test/factories"
import { createUser, createUserWithRoles, loginAs } from "@/test/session"
import { getDraftBoard } from "./actions"

// Two divisions in the current season, each with one team and one pick.
// Captaincy of division A last season must not carry over.
async function seedSeason() {
    const lastSeason = await createSeason({ phase: "complete" })
    const season = await createSeason({ phase: "regular_season" })
    const divA = await createDivision({ name: "A", level: 2 })
    const divB = await createDivision({ name: "B", level: 4 })
    await db.insert(individual_divisions).values(
        [divA, divB].map((d) => ({
            season: season.id,
            division: d.id,
            gender_split: "5-3",
            teams: 1
        }))
    )

    const captainA = await createUser()
    const coachA = await createUser()
    const captainB = await createUser()
    const lastSeasonCaptain = await createUser()

    const teamA = await createTeam({
        season: season.id,
        division: divA.id,
        captain: captainA.id,
        captain2: coachA.id,
        name: "Team A",
        number: 1
    })
    const teamB = await createTeam({
        season: season.id,
        division: divB.id,
        captain: captainB.id,
        name: "Team B",
        number: 1
    })
    await createTeam({
        season: lastSeason.id,
        division: divA.id,
        captain: lastSeasonCaptain.id
    })

    const pickA = await createUser()
    const pickB = await createUser()
    await db.insert(drafts).values([
        { team: teamA.id, user: pickA.id, round: 1, overall: 1 },
        { team: teamB.id, user: pickB.id, round: 1, overall: 1 }
    ])

    return {
        lastSeason,
        season,
        divA,
        divB,
        captainA,
        coachA,
        captainB,
        lastSeasonCaptain,
        pickA
    }
}

let s: Awaited<ReturnType<typeof seedSeason>>

beforeEach(async () => {
    s = await seedSeason()
})

describe("getDraftBoard", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await getDraftBoard(s.divA.id)
        expect(result.status).toBe(false)
    })

    it("lets an admin read any division", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const a = await getDraftBoard(s.divA.id)
        const b = await getDraftBoard(s.divB.id)
        expect(a.status && b.status).toBe(true)
        if (!a.status) return
        expect(a.data).toHaveLength(1)
        expect(a.data[0].teamName).toBe("Team A")
        expect(a.data[0].players.map((p) => p.userId)).toEqual([s.pickA.id])
    })

    it("limits a captain to their own division", async () => {
        loginAs(s.captainA)
        expect((await getDraftBoard(s.divA.id)).status).toBe(true)
        expect(await getDraftBoard(s.divB.id)).toEqual({
            status: false,
            message: "Unauthorized."
        })
    })

    it("lets a coach (captain2) read their division", async () => {
        loginAs(s.coachA)
        expect((await getDraftBoard(s.divA.id)).status).toBe(true)
        expect((await getDraftBoard(s.divB.id)).status).toBe(false)
    })

    it("limits a commissioner to the division on their role", async () => {
        await createUserWithRoles([
            {
                role: "commissioner",
                seasonId: s.season.id,
                divisionId: s.divB.id
            }
        ])
        expect((await getDraftBoard(s.divB.id)).status).toBe(true)
        expect((await getDraftBoard(s.divA.id)).status).toBe(false)
    })

    it("grants nothing for a commissioner row without a division", async () => {
        await createUserWithRoles([
            { role: "commissioner", seasonId: s.season.id }
        ])
        expect((await getDraftBoard(s.divA.id)).status).toBe(false)
        expect((await getDraftBoard(s.divB.id)).status).toBe(false)
    })

    it("ignores captaincy and commissioner roles from earlier seasons", async () => {
        loginAs(s.lastSeasonCaptain)
        expect((await getDraftBoard(s.divA.id)).status).toBe(false)

        await createUserWithRoles([
            {
                role: "commissioner",
                seasonId: s.lastSeason.id,
                divisionId: s.divA.id
            }
        ])
        expect((await getDraftBoard(s.divA.id)).status).toBe(false)
    })

    it("rejects a player with no role", async () => {
        await createUserWithRoles([])
        expect((await getDraftBoard(s.divA.id)).status).toBe(false)
    })
})

describe("getDraftBoardDivisions", () => {
    it("combines captaincy and commissioner divisions, by level", async () => {
        await db.insert(userRoles).values({
            user_id: s.captainA.id,
            role: "commissioner",
            season_id: s.season.id,
            division_id: s.divB.id
        })
        const divisions = await getDraftBoardDivisions(
            s.captainA.id,
            s.season.id
        )
        expect(divisions.map((d) => d.id)).toEqual([s.divA.id, s.divB.id])
    })

    it("returns nothing for someone with no team or role", async () => {
        const user = await createUser()
        expect(await getDraftBoardDivisions(user.id, s.season.id)).toEqual([])
    })
})
