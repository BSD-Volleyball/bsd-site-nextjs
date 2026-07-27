import { and, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { tournamentRoster, tournamentTeams } from "@/database/schema"
import {
    addToTournamentRoster,
    createDivision,
    createTournament,
    createTournamentDivision,
    createTournamentTeam,
    createWaiver
} from "@/test/factories"
import { createUser, createUserWithRoles, loginAs } from "@/test/session"
import {
    addPlayerToRoster,
    getCaptainTeamView,
    removePlayerFromRoster,
    updateTeamName
} from "./actions"

async function seedCaptainTeam(tournamentOverrides = {}) {
    const tournament = await createTournament(tournamentOverrides)
    const leagueDivision = await createDivision({ name: "A", level: 2 })
    const tournamentDivision = await createTournamentDivision({
        tournament_id: tournament.id,
        division_id: leagueDivision.id
    })
    await createWaiver()
    const captain = await createUser()
    const team = await createTournamentTeam({
        tournament_id: tournament.id,
        preferred_division_id: tournamentDivision.id,
        captain_user_id: captain.id,
        name: "Original Name"
    })
    await addToTournamentRoster({
        tournament_id: tournament.id,
        team_id: team.id,
        user_id: captain.id,
        added_by_user_id: captain.id
    })
    return { tournament, tournamentDivision, captain, team }
}

describe("getCaptainTeamView", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await getCaptainTeamView()
        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
    })

    it("returns null data when there is no active tournament", async () => {
        await createUserWithRoles([])
        const result = await getCaptainTeamView()
        expect(result.status).toBe(true)
        if (result.status) expect(result.data).toBeNull()
    })

    it("returns the captain's team with its roster", async () => {
        const { tournament, captain, team } = await seedCaptainTeam()
        loginAs(captain)

        const result = await getCaptainTeamView()
        expect(result.status).toBe(true)
        if (!result.status || !result.data) throw new Error("expected view")
        expect(result.data.tournamentId).toBe(tournament.id)
        expect(result.data.team).toMatchObject({
            id: team.id,
            name: "Original Name"
        })
        expect(result.data.roster.map((r) => r.userId)).toEqual([captain.id])
        expect(result.data.rosterLocked).toBe(false)
    })
})

describe("updateTeamName", () => {
    it("rejects an empty name", async () => {
        const { captain } = await seedCaptainTeam()
        loginAs(captain)
        const result = await updateTeamName("   ")
        expect(result).toEqual({
            status: false,
            message: "Team name is required."
        })
    })

    it("rejects users who captain no team", async () => {
        await seedCaptainTeam()
        await createUserWithRoles([])
        const result = await updateTeamName("Hijack")
        expect(result).toEqual({ status: false, message: "Team not found." })
    })

    it("rejects edits after the roster locks", async () => {
        const { captain } = await seedCaptainTeam({
            roster_lock_date: "2020-01-01"
        })
        loginAs(captain)
        const result = await updateTeamName("Too Late")
        expect(result).toEqual({ status: false, message: "Roster is locked." })
    })

    it("renames the captain's team", async () => {
        const { captain, team } = await seedCaptainTeam()
        loginAs(captain)

        const result = await updateTeamName("Net Gains")
        expect(result.status).toBe(true)

        const [row] = await db
            .select({ name: tournamentTeams.name })
            .from(tournamentTeams)
            .where(eq(tournamentTeams.id, team.id))
        expect(row.name).toBe("Net Gains")
    })
})

describe("addPlayerToRoster / removePlayerFromRoster", () => {
    it("adds a free player and refuses double-rostering", async () => {
        const { tournament, captain, team } = await seedCaptainTeam()
        const player = await createUser()
        loginAs(captain)

        const added = await addPlayerToRoster(player.id)
        expect(added.status).toBe(true)

        const rows = await db
            .select()
            .from(tournamentRoster)
            .where(
                and(
                    eq(tournamentRoster.team_id, team.id),
                    eq(tournamentRoster.user_id, player.id)
                )
            )
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            tournament_id: tournament.id,
            added_by_user_id: captain.id
        })

        const again = await addPlayerToRoster(player.id)
        expect(again).toEqual({
            status: false,
            message: "Player is already on a team in this tournament."
        })
    })

    it("prevents the captain from removing themselves", async () => {
        const { captain } = await seedCaptainTeam()
        loginAs(captain)
        const result = await removePlayerFromRoster(captain.id)
        expect(result).toEqual({
            status: false,
            message: "Captain cannot remove themselves from the roster."
        })
    })

    it("removes a rostered player", async () => {
        const { captain, team } = await seedCaptainTeam()
        const player = await createUser()
        loginAs(captain)
        await addPlayerToRoster(player.id)

        const result = await removePlayerFromRoster(player.id)
        expect(result.status).toBe(true)

        const rows = await db
            .select()
            .from(tournamentRoster)
            .where(
                and(
                    eq(tournamentRoster.team_id, team.id),
                    eq(tournamentRoster.user_id, player.id)
                )
            )
        expect(rows).toHaveLength(0)
    })
})
