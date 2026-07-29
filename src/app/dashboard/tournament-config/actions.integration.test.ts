import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { tournaments } from "@/database/schema"
import { createDivision, createTournament } from "@/test/factories"
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
