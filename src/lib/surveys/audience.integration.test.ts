import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { emailRecipientGroups } from "@/database/schema"
import {
    createDivision,
    createSeason,
    createSignup,
    createTeam
} from "@/test/factories"
import { createUser } from "@/test/session"
import { resolveAudience } from "./audience"

describe("resolveAudience", () => {
    it("unions the groups, applies the manual edits, and counts each group", async () => {
        const season = await createSeason({ year: 2026, season: "fall" })
        const division = await createDivision()
        const signedUp = await createUser()
        const excluded = await createUser()
        const captain = await createUser()
        const extra = await createUser()

        await createSignup({ season: season.id, player: signedUp.id })
        await createSignup({ season: season.id, player: excluded.id })
        await createTeam({
            season: season.id,
            captain: captain.id,
            division: division.id
        })

        const resolved = await resolveAudience(
            {
                groups: [
                    { type: "season_signups" },
                    { type: "season_captains" }
                ],
                addUserIds: [extra.id],
                removeUserIds: [excluded.id]
            },
            season.id
        )

        expect(new Set(resolved.recipients.map((r) => r.userId))).toEqual(
            new Set([signedUp.id, captain.id, extra.id])
        )
        // Counts are per group, before the manual add/remove pass.
        expect(resolved.groupCounts.map((g) => g.count)).toEqual([3, 1])

        // The group rows it minted carry the season in their name.
        const groups = await db
            .select()
            .from(emailRecipientGroups)
            .where(eq(emailRecipientGroups.season_id, season.id))
        expect(groups).toHaveLength(2)
        for (const group of groups) {
            expect(group.name).toContain("Fall 2026")
        }
    })

    it("rejects a season-bound group with no season", async () => {
        await expect(
            resolveAudience(
                {
                    groups: [{ type: "season_signups" }],
                    addUserIds: [],
                    removeUserIds: []
                },
                null
            )
        ).rejects.toThrow(/requires a season/i)
    })

    it("does not scope a season-less group to the season", async () => {
        const season = await createSeason()
        const member = await createUser()

        const resolved = await resolveAudience(
            {
                groups: [{ type: "all_users" }],
                addUserIds: [],
                removeUserIds: []
            },
            season.id
        )

        expect(resolved.recipients.map((r) => r.userId)).toEqual([member.id])
        const [group] = await db.select().from(emailRecipientGroups)
        expect(group.season_id).toBeNull()
    })
})
