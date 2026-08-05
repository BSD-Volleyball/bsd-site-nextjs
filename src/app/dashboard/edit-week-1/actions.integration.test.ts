import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { auditLog, week1Rosters } from "@/database/schema"
import { createSeason, createSignup } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { updateWeek1Rosters } from "./actions"

async function seedSignedUpPlayer(seasonId: number) {
    const player = await createUser()
    await createSignup({ season: seasonId, player: player.id })
    return player
}

describe("updateWeek1Rosters", () => {
    it("rejects non-admin callers", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "captain" }])

        const result = await updateWeek1Rosters([])

        expect(result.status).toBe(false)
        expect(result.status === false && result.message).toContain(
            "permission"
        )
    })

    it("replaces the season's roster wholesale", async () => {
        const season = await createSeason()
        const first = await seedSignedUpPlayer(season.id)
        const second = await seedSignedUpPlayer(season.id)
        await createUserWithRoles([{ role: "admin" }])

        await updateWeek1Rosters([
            { userId: first.id, sessionNumber: 1, courtNumber: 1 }
        ])
        await updateWeek1Rosters([
            { userId: second.id, sessionNumber: 2, courtNumber: 3 }
        ])

        const rows = await db
            .select()
            .from(week1Rosters)
            .where(eq(week1Rosters.season, season.id))
        expect(rows).toHaveLength(1)
        expect(rows[0].user).toBe(second.id)
    })

    // That wholesale replace is the hazard: one bad save drops every week 1
    // placement for the season. A count in the audit summary would not be
    // enough to put them back, so the entry carries the placements.
    it("records the full roster in the audit entry", async () => {
        const season = await createSeason()
        const player = await seedSignedUpPlayer(season.id)
        const admin = await createUserWithRoles([{ role: "admin" }])

        const result = await updateWeek1Rosters([
            { userId: player.id, sessionNumber: 2, courtNumber: 3 },
            // Empty slots are dropped before the write, so they should not
            // appear in the recorded payload either.
            { userId: "", sessionNumber: 1, courtNumber: 1 }
        ])
        expect(result.status).toBe(true)

        const [entry] = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.user, admin.id))
        expect(entry.entity_type).toBe("week1_rosters")
        expect(entry.summary).toContain("(1 slots)")
        expect(JSON.parse(entry.summary.split("Full roster: ")[1])).toEqual([
            { userId: player.id, sessionNumber: 2, courtNumber: 3 }
        ])
    })
})
