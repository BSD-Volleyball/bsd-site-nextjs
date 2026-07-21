import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { tournaments } from "@/database/schema"
import { createUserWithRoles, logout } from "@/test/session"
import { createTournament, type TournamentMetadataInput } from "./actions"

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

describe("createTournament — sets config", () => {
    it("rejects unauthenticated callers", async () => {
        logout()
        const result = await createTournament(baseMetadata())
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("persists the pool and playoff sets formats", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await createTournament(
            baseMetadata({
                poolSetsMode: "exact",
                poolSetsCount: 2,
                playoffSetsMode: "best_of",
                playoffSetsCount: 3
            })
        )
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected success")

        const [row] = await db
            .select({
                poolMode: tournaments.pool_sets_mode,
                poolCount: tournaments.pool_sets_count,
                playoffMode: tournaments.playoff_sets_mode,
                playoffCount: tournaments.playoff_sets_count
            })
            .from(tournaments)
            .where(eq(tournaments.id, result.data.tournamentId))
        expect(row).toEqual({
            poolMode: "exact",
            poolCount: 2,
            playoffMode: "best_of",
            playoffCount: 3
        })
    })

    it("rejects an even best-of count", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await createTournament(
            baseMetadata({ poolSetsMode: "best_of", poolSetsCount: 2 })
        )
        expect(result).toEqual({
            status: false,
            message: "Invalid pool play sets format."
        })
    })

    it("rejects a playoff format that can tie (exact-2)", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await createTournament(
            baseMetadata({ playoffSetsMode: "exact", playoffSetsCount: 2 })
        )
        expect(result).toEqual({
            status: false,
            message:
                "Invalid playoff sets format — playoffs must produce a winner."
        })
    })
})
