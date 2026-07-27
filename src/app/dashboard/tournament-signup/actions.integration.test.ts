import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    discounts,
    tournamentRoster,
    tournamentTeams,
    waiverAcceptances
} from "@/database/schema"
import {
    addToTournamentRoster,
    createDiscount,
    createDivision,
    createTournament,
    createTournamentDivision,
    createTournamentTeam,
    createWaiver
} from "@/test/factories"
import { createUser, createUserWithRoles, loginAs } from "@/test/session"
import { getEligibleTournamentPlayers, submitTournamentSignup } from "./actions"

async function seedTournament(
    divisionOverrides: {
        male_per_team?: number
        non_male_per_team?: number
    } = {}
) {
    const tournament = await createTournament()
    const leagueDivision = await createDivision({ name: "A", level: 2 })
    const tournamentDivision = await createTournamentDivision({
        tournament_id: tournament.id,
        division_id: leagueDivision.id,
        ...divisionOverrides
    })
    const waiver = await createWaiver()
    return { tournament, tournamentDivision, waiver }
}

describe("getEligibleTournamentPlayers", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await getEligibleTournamentPlayers(1)
        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
    })

    it("excludes players already rostered in this tournament", async () => {
        const { tournament, tournamentDivision } = await seedTournament()
        const captain = await createUser()
        const team = await createTournamentTeam({
            tournament_id: tournament.id,
            preferred_division_id: tournamentDivision.id,
            captain_user_id: captain.id
        })
        await addToTournamentRoster({
            tournament_id: tournament.id,
            team_id: team.id,
            user_id: captain.id,
            added_by_user_id: captain.id
        })
        const free = await createUser()
        await createUserWithRoles([])

        const result = await getEligibleTournamentPlayers(tournament.id)
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected players")
        const ids = result.data.map((p) => p.id)
        expect(ids).toContain(free.id)
        expect(ids).not.toContain(captain.id)
    })
})

describe("submitTournamentSignup", () => {
    const form = (preferredDivisionId: number, rosterUserIds: string[]) => ({
        teamName: "Spikers",
        preferredDivisionId,
        rosterUserIds
    })

    it("rejects unauthenticated callers", async () => {
        const result = await submitTournamentSignup(null, form(1, []), 1)
        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
    })

    it("rejects signups after registration closes", async () => {
        await createTournament({ phase: "pool_play" })
        await createUserWithRoles([])
        const result = await submitTournamentSignup(null, form(1, []), 1)
        expect(result).toEqual({
            status: false,
            message: "Registration is closed for this tournament."
        })
    })

    it("rejects a stale waiver version", async () => {
        const { tournamentDivision, waiver } = await seedTournament()
        await createUserWithRoles([])
        const result = await submitTournamentSignup(
            null,
            form(tournamentDivision.id, []),
            waiver.id + 1
        )
        expect(result).toEqual({
            status: false,
            message:
                "The waiver was updated. Please reload and re-confirm the current waiver."
        })
    })

    it("rejects rosters exceeding the division's male cap", async () => {
        const { tournamentDivision, waiver } = await seedTournament({
            male_per_team: 1
        })
        const captain = await createUser({ male: true })
        const extraMale = await createUser({ male: true })
        loginAs(captain)

        const result = await submitTournamentSignup(
            null,
            form(tournamentDivision.id, [extraMale.id]),
            waiver.id
        )
        expect(result.status).toBe(false)
        if (!result.status) {
            expect(result.message).toContain("exceeds male cap (2 / 1)")
        }
    })

    it("registers a team, roster and waiver acceptance (100% discount, no payment)", async () => {
        const { tournament, tournamentDivision, waiver } =
            await seedTournament()
        const captain = await createUser({ male: true })
        const teammate = await createUser({ male: false })
        const discount = await createDiscount({
            user: captain.id,
            percentage: "100",
            scope: "tournament"
        })
        loginAs(captain)

        const result = await submitTournamentSignup(
            null,
            form(tournamentDivision.id, [teammate.id]),
            waiver.id,
            discount.id
        )
        expect(result.status).toBe(true)

        const [team] = await db
            .select()
            .from(tournamentTeams)
            .where(eq(tournamentTeams.tournament_id, tournament.id))
        expect(team).toMatchObject({
            name: "Spikers",
            captain_user_id: captain.id,
            preferred_division_id: tournamentDivision.id,
            amount_paid: "0.00",
            order_id: null
        })

        const roster = await db
            .select()
            .from(tournamentRoster)
            .where(eq(tournamentRoster.team_id, team.id))
        expect(roster.map((r) => r.user_id).sort()).toEqual(
            [captain.id, teammate.id].sort()
        )

        const acceptances = await db
            .select()
            .from(waiverAcceptances)
            .where(eq(waiverAcceptances.user_id, captain.id))
        expect(acceptances).toHaveLength(1)

        const [usedDiscount] = await db
            .select({ used: discounts.used })
            .from(discounts)
            .where(eq(discounts.id, discount.id))
        expect(usedDiscount.used).toBe(true)
    })
})
