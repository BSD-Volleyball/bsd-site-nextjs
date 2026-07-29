import { describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { db } from "@/database/db"
import { tryoutSlotRequests } from "@/database/schema"
import { loadTryoutSlotRequests } from "@/lib/tryout-slot-requests"
import { createSeason } from "@/test/factories"
import { createUser, createUserWithRoles, logout } from "@/test/session"
import {
    createTryoutSlotRequest,
    deleteTryoutSlotRequest,
    getTryoutSlotRequests,
    updateTryoutSlotRequest
} from "./actions"

function requestData(
    userId: string,
    overrides: Partial<{
        week: number
        canSlot1: boolean
        canSlot2: boolean
        canSlot3: boolean
        comment: string | null
    }> = {}
) {
    return {
        userId,
        week: 2,
        canSlot1: true,
        canSlot2: false,
        canSlot3: true,
        comment: "works late on Tuesdays",
        ...overrides
    }
}

describe("createTryoutSlotRequest", () => {
    it("rejects unauthenticated callers", async () => {
        logout()
        const result = await createTryoutSlotRequest(requestData("x"))
        expect(result.status).toBe(false)
    })

    it("rejects authenticated non-admins", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const result = await createTryoutSlotRequest(requestData("x"))
        expect(result.status).toBe(false)
    })

    it("rejects a request with no slots selected", async () => {
        await createSeason()
        const player = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await createTryoutSlotRequest(
            requestData(player.id, {
                canSlot1: false,
                canSlot2: false,
                canSlot3: false
            })
        )
        expect(result.status).toBe(false)
        expect(!result.status && result.message).toContain("at least one")
    })

    it("rejects slot 3 for week 1", async () => {
        await createSeason()
        const player = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await createTryoutSlotRequest(
            requestData(player.id, { week: 1, canSlot3: true })
        )
        expect(result.status).toBe(false)
        expect(!result.status && result.message).toContain("2 sessions")
    })

    it("rejects an invalid week", async () => {
        await createSeason()
        const player = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await createTryoutSlotRequest(
            requestData(player.id, { week: 4 })
        )
        expect(result.status).toBe(false)
    })

    it("creates a request and reads it back", async () => {
        const season = await createSeason()
        const player = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await createTryoutSlotRequest(requestData(player.id))
        expect(result.status).toBe(true)

        const list = await getTryoutSlotRequests()
        expect(list.status).toBe(true)
        expect(list.requests).toHaveLength(1)
        expect(list.requests[0].userId).toBe(player.id)
        expect(list.requests[0].week).toBe(2)
        expect(list.requests[0].canSlot1).toBe(true)
        expect(list.requests[0].canSlot2).toBe(false)
        expect(list.requests[0].canSlot3).toBe(true)
        expect(list.requests[0].comment).toBe("works late on Tuesdays")
        void season
    })

    it("rejects a duplicate (player, week) with an edit hint", async () => {
        await createSeason()
        const player = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        await createTryoutSlotRequest(requestData(player.id))
        const duplicate = await createTryoutSlotRequest(
            requestData(player.id, { canSlot1: false, canSlot2: true })
        )
        expect(duplicate.status).toBe(false)
        expect(!duplicate.status && duplicate.message).toContain(
            "edit it instead"
        )
    })
})

describe("updateTryoutSlotRequest / deleteTryoutSlotRequest", () => {
    it("updates slots and comment, enforcing week-1 slot rules", async () => {
        await createSeason()
        const player = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        await createTryoutSlotRequest(
            requestData(player.id, { week: 1, canSlot3: false })
        )
        const list = await getTryoutSlotRequests()
        const id = list.requests[0].id

        const invalid = await updateTryoutSlotRequest({
            id,
            canSlot1: false,
            canSlot2: false,
            canSlot3: true,
            comment: null
        })
        expect(invalid.status).toBe(false)

        const valid = await updateTryoutSlotRequest({
            id,
            canSlot1: false,
            canSlot2: true,
            canSlot3: false,
            comment: "updated"
        })
        expect(valid.status).toBe(true)

        const after = await getTryoutSlotRequests()
        expect(after.requests[0].canSlot1).toBe(false)
        expect(after.requests[0].canSlot2).toBe(true)
        expect(after.requests[0].comment).toBe("updated")
    })

    it("deletes a request", async () => {
        await createSeason()
        const player = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        await createTryoutSlotRequest(requestData(player.id))
        const list = await getTryoutSlotRequests()

        const result = await deleteTryoutSlotRequest(list.requests[0].id)
        expect(result.status).toBe(true)

        const after = await getTryoutSlotRequests()
        expect(after.requests).toHaveLength(0)
    })
})

describe("loadTryoutSlotRequests", () => {
    it("returns the season+week map, skipping other weeks and slot 3 for week 1", async () => {
        const season = await createSeason()
        const week1Player = await createUser()
        const week2Player = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        // Direct inserts so we can construct a week-1 row with slot 3 set
        // (the actions forbid it) and verify the loader drops it.
        await db.insert(tryoutSlotRequests).values([
            {
                season: season.id,
                user_id: week1Player.id,
                week: 1,
                can_slot_1: false,
                can_slot_2: true,
                can_slot_3: true,
                comment: "week 1"
            },
            {
                season: season.id,
                user_id: week2Player.id,
                week: 2,
                can_slot_1: true,
                can_slot_2: false,
                can_slot_3: true,
                comment: null
            }
        ])

        const week1Map = await loadTryoutSlotRequests(season.id, 1)
        expect(week1Map.get(week1Player.id)?.availableSlots).toEqual([2])
        expect(week1Map.has(week2Player.id)).toBe(false)

        const week2Map = await loadTryoutSlotRequests(season.id, 2)
        expect(week2Map.get(week2Player.id)?.availableSlots).toEqual([1, 3])
        expect(week2Map.has(week1Player.id)).toBe(false)

        // Other seasons are not included
        const otherSeason = await createSeason()
        const otherMap = await loadTryoutSlotRequests(otherSeason.id, 2)
        expect(otherMap.size).toBe(0)

        // Cleanup guard: rows really exist for this season
        const rows = await db
            .select()
            .from(tryoutSlotRequests)
            .where(eq(tryoutSlotRequests.season, season.id))
        expect(rows).toHaveLength(2)
    })
})
