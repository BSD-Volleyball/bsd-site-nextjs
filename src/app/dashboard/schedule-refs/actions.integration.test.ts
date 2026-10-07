import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { matchReferees, seasonRefs } from "@/database/schema"
import { createDivision, createMatch, createSeason } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { saveRefAssignments } from "./actions"

const DATE = "2026-10-07"

async function seed() {
    const oldSeason = await createSeason()
    const season = await createSeason()
    const division = await createDivision()
    const ref = await createUser()
    await db.insert(seasonRefs).values({
        season_id: season.id,
        user_id: ref.id,
        is_active: true,
        max_division_level: 5
    })
    const match = await createMatch({
        season: season.id,
        division: division.id,
        date: DATE
    })
    const oldMatch = await createMatch({
        season: oldSeason.id,
        division: division.id,
        date: "2025-10-07"
    })
    const oldRef = await createUser()
    await db.insert(matchReferees).values({
        match_id: oldMatch.id,
        referee_id: oldRef.id,
        season_id: oldSeason.id,
        role: "primary"
    })
    await createUserWithRoles([
        { role: "referee_coordinator", seasonId: season.id }
    ])
    return { season, match, oldMatch, ref }
}

describe("saveRefAssignments", () => {
    it("saves assignments for a current-season match on the given date", async () => {
        const { match, ref } = await seed()

        const result = await saveRefAssignments(DATE, [
            { matchId: match.id, primaryRefId: ref.id, backupRefId: null }
        ])

        expect(result.status).toBe(true)
        const rows = await db
            .select()
            .from(matchReferees)
            .where(eq(matchReferees.match_id, match.id))
        expect(rows).toHaveLength(1)
        expect(rows[0].referee_id).toBe(ref.id)
    })

    it("refuses a match from another season and leaves its assignments intact", async () => {
        const { match, oldMatch, ref } = await seed()

        const result = await saveRefAssignments(DATE, [
            { matchId: match.id, primaryRefId: ref.id, backupRefId: null },
            { matchId: oldMatch.id, primaryRefId: null, backupRefId: null }
        ])

        expect(result.status).toBe(false)
        expect(result.status === false && result.message).toContain(
            "not on this date"
        )
        expect(
            await db
                .select()
                .from(matchReferees)
                .where(eq(matchReferees.match_id, oldMatch.id))
        ).toHaveLength(1)
        // Nothing was written for the valid match either: all or nothing.
        expect(
            await db
                .select()
                .from(matchReferees)
                .where(eq(matchReferees.match_id, match.id))
        ).toHaveLength(0)
    })

    it("refuses a match from a different date in the current season", async () => {
        const { match, ref } = await seed()

        const result = await saveRefAssignments("2026-10-14", [
            { matchId: match.id, primaryRefId: ref.id, backupRefId: null }
        ])

        expect(result.status).toBe(false)
    })

    it("refuses a referee who is not on the season's ref roster", async () => {
        const { match } = await seed()
        const stranger = await createUser()

        const result = await saveRefAssignments(DATE, [
            { matchId: match.id, primaryRefId: stranger.id, backupRefId: null }
        ])

        expect(result.status).toBe(false)
        expect(result.status === false && result.message).toContain(
            "not on the referee roster"
        )
    })

    it("refuses a non-staff caller", async () => {
        const { match, ref } = await seed()
        await createUserWithRoles([{ role: "captain" }])

        const result = await saveRefAssignments(DATE, [
            { matchId: match.id, primaryRefId: ref.id, backupRefId: null }
        ])

        expect(result.status).toBe(false)
        expect(result.status === false && result.message).toBe("Unauthorized.")
    })
})
