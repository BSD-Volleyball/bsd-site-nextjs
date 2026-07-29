import { asc, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { tournamentDivisions, tournaments } from "@/database/schema"
import {
    createDivision,
    createTournament as seedTournament,
    createTournamentDivision
} from "@/test/factories"
import { createUserWithRoles, logout } from "@/test/session"
import { createTournament } from "./actions"

const input = { name: "Fall Classic", year: 2027, code: "Fall-2027" }

describe("createTournament", () => {
    it("rejects unauthenticated callers", async () => {
        logout()
        const result = await createTournament(input)
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("rejects authenticated non-admins", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const result = await createTournament(input)
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("clones metadata and divisions from the previous tournament", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const source = await seedTournament({
            phase: "complete",
            tournament_date: "2026-08-01",
            checkin_time: "08:30:00",
            first_serve_time: "09:00:00",
            address: "123 Beach Way",
            cost: "120.00",
            late_cost: "150.00",
            late_date: "2026-07-15",
            registration_close_date: "2026-07-25",
            roster_lock_date: "2026-07-30",
            tournament_type: "reverse_coed",
            pool_size: 3,
            elimination_format: "double",
            pool_sets_mode: "best_of",
            pool_sets_count: 3,
            playoff_sets_mode: "best_of",
            playoff_sets_count: 1,
            additional_info: "Bring sunscreen."
        })
        const divA = await createDivision({ name: "A", level: 1 })
        const divBB = await createDivision({ name: "BB", level: 2 })
        await createTournamentDivision({
            tournament_id: source.id,
            division_id: divA.id,
            team_count: 6,
            male_per_team: 2,
            non_male_per_team: 4,
            teams_advancing_per_pool: 3,
            sort_order: 0
        })
        await createTournamentDivision({
            tournament_id: source.id,
            division_id: divBB.id,
            sort_order: 1
        })

        const result = await createTournament(input)
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected success")

        const [row] = await db
            .select()
            .from(tournaments)
            .where(eq(tournaments.id, result.data.tournamentId))
        expect(row).toMatchObject({
            code: "fall-2027",
            name: "Fall Classic",
            year: 2027,
            phase: "registration_open",
            tournament_date: "2026-08-01",
            checkin_time: "08:30:00",
            first_serve_time: "09:00:00",
            address: "123 Beach Way",
            cost: "120.00",
            late_cost: "150.00",
            late_date: "2026-07-15",
            registration_close_date: "2026-07-25",
            roster_lock_date: "2026-07-30",
            tournament_type: "reverse_coed",
            pool_size: 3,
            elimination_format: "double",
            pool_sets_mode: "best_of",
            pool_sets_count: 3,
            playoff_sets_mode: "best_of",
            playoff_sets_count: 1,
            additional_info: "Bring sunscreen."
        })

        const clonedDivisions = await db
            .select()
            .from(tournamentDivisions)
            .where(
                eq(tournamentDivisions.tournament_id, result.data.tournamentId)
            )
            .orderBy(asc(tournamentDivisions.sort_order))
        expect(clonedDivisions).toHaveLength(2)
        expect(clonedDivisions[0]).toMatchObject({
            division_id: divA.id,
            team_count: 6,
            male_per_team: 2,
            non_male_per_team: 4,
            teams_advancing_per_pool: 3,
            sort_order: 0
        })
        expect(clonedDivisions[1]).toMatchObject({
            division_id: divBB.id,
            sort_order: 1
        })

        // Source rows are untouched.
        const sourceDivisions = await db
            .select()
            .from(tournamentDivisions)
            .where(eq(tournamentDivisions.tournament_id, source.id))
        expect(sourceDivisions).toHaveLength(2)
    })

    it("blocks creation while a tournament is not complete", async () => {
        await createUserWithRoles([{ role: "admin" }])
        await seedTournament({
            phase: "registration_open",
            name: "Spring Fling",
            year: 2026
        })

        const result = await createTournament(input)
        expect(result).toEqual({
            status: false,
            message:
                'Cannot create a new tournament while "Spring Fling (2026)" is not Complete. Finish it with the phase controls or End Tournament Early.'
        })

        const rows = await db.select({ id: tournaments.id }).from(tournaments)
        expect(rows).toHaveLength(1)
    })

    it("rejects a duplicate code", async () => {
        await createUserWithRoles([{ role: "admin" }])
        await seedTournament({ phase: "complete", code: "fall-2027" })

        const result = await createTournament(input)
        expect(result).toEqual({
            status: false,
            message: "Tournament code already in use."
        })
    })

    it("creates with defaults when no prior tournament exists", async () => {
        await createUserWithRoles([{ role: "admin" }])

        const result = await createTournament(input)
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected success")

        const [row] = await db
            .select()
            .from(tournaments)
            .where(eq(tournaments.id, result.data.tournamentId))
        expect(row).toMatchObject({
            code: "fall-2027",
            name: "Fall Classic",
            year: 2027,
            phase: "registration_open",
            checkin_time: null,
            first_serve_time: null,
            address: null,
            cost: null,
            late_cost: null,
            late_date: null,
            registration_close_date: null,
            roster_lock_date: null,
            tournament_type: "coed",
            pool_size: 4,
            elimination_format: "single",
            pool_sets_mode: "exact",
            pool_sets_count: 2,
            playoff_sets_mode: "best_of",
            playoff_sets_count: 3,
            additional_info: null
        })
        // tournament_date is NOT NULL — with nothing to clone it falls back
        // to today's date (ET).
        expect(row.tournament_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)

        const clonedDivisions = await db
            .select()
            .from(tournamentDivisions)
            .where(
                eq(tournamentDivisions.tournament_id, result.data.tournamentId)
            )
        expect(clonedDivisions).toHaveLength(0)
    })
})
