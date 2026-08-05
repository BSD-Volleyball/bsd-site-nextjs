import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    tournamentDivisions,
    tournamentPools,
    tournaments
} from "@/database/schema"
import { CONFIRM_DESTRUCTIVE_SUFFIX } from "@/lib/confirm-destructive"
import {
    createDivision,
    createTournament,
    createTournamentDivision
} from "@/test/factories"
import { createUserWithRoles, logout } from "@/test/session"
import {
    saveTournamentConfig,
    type TournamentDivisionInput,
    type TournamentMetadataInput
} from "./actions"

function baseMetadata(
    overrides: Partial<TournamentMetadataInput> = {}
): TournamentMetadataInput {
    return {
        code: `int-${crypto.randomUUID().slice(0, 8)}`,
        year: 2026,
        name: "Config Test",
        tournamentDate: "2026-09-01",
        checkinTime: null,
        firstServeTime: null,
        address: null,
        cost: "",
        lateCost: "",
        lateDate: null,
        registrationCloseDate: null,
        rosterLockDate: null,
        tournamentType: "coed",
        poolSize: 4,
        eliminationFormat: "single",
        poolSetsMode: "exact",
        poolSetsCount: 2,
        playoffSetsMode: "best_of",
        playoffSetsCount: 3,
        additionalInfo: null,
        ...overrides
    }
}

async function seedTournamentWithDivision() {
    const tournament = await createTournament()
    const division = await createDivision()
    const divisionsInput: TournamentDivisionInput[] = [
        {
            divisionId: division.id,
            teamCount: 4,
            malePerTeam: 3,
            nonMalePerTeam: 3,
            teamsAdvancingPerPool: 2,
            sortOrder: 0
        }
    ]
    return { tournament, divisionsInput }
}

describe("saveTournamentConfig — sets config", () => {
    it("rejects unauthenticated callers", async () => {
        logout()
        const { tournament, divisionsInput } =
            await seedTournamentWithDivision()
        const result = await saveTournamentConfig(
            tournament.id,
            baseMetadata(),
            divisionsInput
        )
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("persists the pool and playoff sets formats", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const { tournament, divisionsInput } =
            await seedTournamentWithDivision()
        const result = await saveTournamentConfig(
            tournament.id,
            baseMetadata({
                poolSetsMode: "best_of",
                poolSetsCount: 3,
                playoffSetsMode: "best_of",
                playoffSetsCount: 1
            }),
            divisionsInput
        )
        expect(result.status).toBe(true)

        const [row] = await db
            .select({
                poolMode: tournaments.pool_sets_mode,
                poolCount: tournaments.pool_sets_count,
                playoffMode: tournaments.playoff_sets_mode,
                playoffCount: tournaments.playoff_sets_count
            })
            .from(tournaments)
            .where(eq(tournaments.id, tournament.id))
        expect(row).toEqual({
            poolMode: "best_of",
            poolCount: 3,
            playoffMode: "best_of",
            playoffCount: 1
        })
    })

    it("rejects an even best-of count", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const { tournament, divisionsInput } =
            await seedTournamentWithDivision()
        const result = await saveTournamentConfig(
            tournament.id,
            baseMetadata({ poolSetsMode: "best_of", poolSetsCount: 2 }),
            divisionsInput
        )
        expect(result).toEqual({
            status: false,
            message: "Invalid pool play sets format."
        })
    })

    it("rejects a playoff format that can tie (exact-2)", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const { tournament, divisionsInput } =
            await seedTournamentWithDivision()
        const result = await saveTournamentConfig(
            tournament.id,
            baseMetadata({ playoffSetsMode: "exact", playoffSetsCount: 2 }),
            divisionsInput
        )
        expect(result).toEqual({
            status: false,
            message:
                "Invalid playoff sets format — playoffs must produce a winner."
        })
    })
})

// Removing a tournament division cascades through tournament_pools to their
// matches and pool teams, and takes tournament_placements with it — the same
// silent-cascade shape that destroyed Fall 2026 availability on 2026-08-05.
describe("saveTournamentConfig — destructive division removal", () => {
    async function seedDivisionWithPool() {
        const tournament = await createTournament()
        const division = await createDivision()
        const tDivision = await createTournamentDivision({
            tournament_id: tournament.id,
            division_id: division.id
        })
        const [pool] = await db
            .insert(tournamentPools)
            .values({
                tournament_id: tournament.id,
                division_id: tDivision.id,
                name: "Pool A",
                sort_order: 0
            })
            .returning()
        return { tournament, division, tDivision, pool }
    }

    it("refuses to drop a division that already has pools", async () => {
        const { tournament, tDivision, pool } = await seedDivisionWithPool()
        const other = await createDivision({ name: "Other", level: 9 })
        await createUserWithRoles([{ role: "admin" }])

        // Submit a division list that omits the existing one.
        const result = await saveTournamentConfig(
            tournament.id,
            baseMetadata(),
            [
                {
                    divisionId: other.id,
                    teamCount: 4,
                    malePerTeam: 3,
                    nonMalePerTeam: 3,
                    teamsAdvancingPerPool: 2,
                    sortOrder: 0
                }
            ]
        )

        expect(result.status).toBe(false)
        expect(result.status === false && result.message).toContain("1 pool")
        expect(result.status === false && result.message).toContain(
            CONFIRM_DESTRUCTIVE_SUFFIX
        )

        // Whole save rolled back — the division and its pool are untouched.
        const divisionRows = await db
            .select()
            .from(tournamentDivisions)
            .where(eq(tournamentDivisions.id, tDivision.id))
        expect(divisionRows).toHaveLength(1)
        const poolRows = await db
            .select()
            .from(tournamentPools)
            .where(eq(tournamentPools.id, pool.id))
        expect(poolRows).toHaveLength(1)
    })

    it("drops the division and its pools once confirmed", async () => {
        const { tournament, tDivision, pool } = await seedDivisionWithPool()
        const other = await createDivision({ name: "Other", level: 9 })
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveTournamentConfig(
            tournament.id,
            baseMetadata(),
            [
                {
                    divisionId: other.id,
                    teamCount: 4,
                    malePerTeam: 3,
                    nonMalePerTeam: 3,
                    teamsAdvancingPerPool: 2,
                    sortOrder: 0
                }
            ],
            { confirmDeletions: true }
        )

        expect(result.status).toBe(true)
        const divisionRows = await db
            .select()
            .from(tournamentDivisions)
            .where(eq(tournamentDivisions.id, tDivision.id))
        expect(divisionRows).toHaveLength(0)
        const poolRows = await db
            .select()
            .from(tournamentPools)
            .where(eq(tournamentPools.id, pool.id))
        expect(poolRows).toHaveLength(0)
    })

    it("allows removing a division that has no dependents", async () => {
        const tournament = await createTournament()
        const division = await createDivision()
        const tDivision = await createTournamentDivision({
            tournament_id: tournament.id,
            division_id: division.id
        })
        const other = await createDivision({ name: "Other", level: 9 })
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveTournamentConfig(
            tournament.id,
            baseMetadata(),
            [
                {
                    divisionId: other.id,
                    teamCount: 4,
                    malePerTeam: 3,
                    nonMalePerTeam: 3,
                    teamsAdvancingPerPool: 2,
                    sortOrder: 0
                }
            ]
        )

        expect(result.status).toBe(true)
        const rows = await db
            .select()
            .from(tournamentDivisions)
            .where(eq(tournamentDivisions.id, tDivision.id))
        expect(rows).toHaveLength(0)
    })
})
