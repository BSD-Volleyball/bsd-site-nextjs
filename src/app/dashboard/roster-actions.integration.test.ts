import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { drafts } from "@/database/schema"
import { createDivision, createSeason, createTeam } from "@/test/factories"
import { createUser, createUserWithRoles, loginAs } from "@/test/session"
import { getTeamRoster } from "./roster-actions"

// Seeds a past season and a current season, each with one team whose captain
// drafted one player. getSeasonConfig resolves the highest season id as
// "current", so creation order matters.
async function seedTwoSeasons() {
    const division = await createDivision()
    const pastSeason = await createSeason()
    const pastCaptain = await createUser()
    const pastPlayer = await createUser()
    const pastTeam = await createTeam({
        season: pastSeason.id,
        captain: pastCaptain.id,
        division: division.id,
        name: "Past Team"
    })
    await db.insert(drafts).values([
        { team: pastTeam.id, user: pastCaptain.id, round: 1, overall: 1 },
        { team: pastTeam.id, user: pastPlayer.id, round: 2, overall: 2 }
    ])

    const currentSeason = await createSeason()
    const captain = await createUser()
    const member = await createUser()
    const currentTeam = await createTeam({
        season: currentSeason.id,
        captain: captain.id,
        division: division.id,
        name: "Current Team"
    })
    await db
        .insert(drafts)
        .values({ team: currentTeam.id, user: member.id, round: 1, overall: 1 })

    return { pastTeam, currentTeam, captain, member }
}

describe("getTeamRoster", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await getTeamRoster(1)
        expect(result).toEqual({
            status: false,
            message: "Not authenticated.",
            teamName: "",
            players: []
        })
    })

    it("returns Team not found for an unknown team", async () => {
        await createUserWithRoles([])
        const result = await getTeamRoster(999999)
        expect(result.status).toBe(false)
        expect(result.message).toBe("Team not found.")
    })

    it("lets an admin view any current-season roster", async () => {
        const { currentTeam, member } = await seedTwoSeasons()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getTeamRoster(currentTeam.id)
        expect(result.status).toBe(true)
        expect(result.teamName).toBe("Current Team")
        expect(result.players.map((p) => p.id)).toEqual([member.id])
    })

    it("lets any logged-in user view a past-season roster", async () => {
        const { pastTeam } = await seedTwoSeasons()
        await createUserWithRoles([]) // unrelated player, no roles

        const result = await getTeamRoster(pastTeam.id)
        expect(result.status).toBe(true)
        expect(result.teamName).toBe("Past Team")
        expect(result.players).toHaveLength(2)
    })

    it("denies a current-season roster to a non-member", async () => {
        const { currentTeam } = await seedTwoSeasons()
        await createUserWithRoles([])

        const result = await getTeamRoster(currentTeam.id)
        expect(result).toEqual({
            status: false,
            message:
                "Current-season rosters are only visible to that team's players.",
            teamName: "",
            players: []
        })
    })

    it("allows a drafted member to view their current-season roster", async () => {
        const { currentTeam, member } = await seedTwoSeasons()
        loginAs(member)

        const result = await getTeamRoster(currentTeam.id)
        expect(result.status).toBe(true)
        expect(result.players.map((p) => p.id)).toEqual([member.id])
    })

    it("allows the captain to view their current-season roster", async () => {
        const { currentTeam, captain } = await seedTwoSeasons()
        loginAs(captain)

        const result = await getTeamRoster(currentTeam.id)
        expect(result.status).toBe(true)
        expect(result.teamName).toBe("Current Team")
    })
})
