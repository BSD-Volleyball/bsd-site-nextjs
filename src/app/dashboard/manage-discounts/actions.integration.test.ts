import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { discounts } from "@/database/schema"
import { createDiscount } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import {
    createDiscount as createDiscountAction,
    deleteDiscount,
    getDiscounts,
    updateDiscount
} from "./actions"

describe("createDiscount", () => {
    it("rejects non-admin callers", async () => {
        const target = await createUser()
        await createUserWithRoles([{ role: "commissioner" }])

        const result = await createDiscountAction({
            userId: target.id,
            percentage: "50",
            expiration: null,
            reason: null,
            scope: "season"
        })

        expect(result).toEqual({ status: false, message: "Unauthorized" })
        expect(await db.select().from(discounts)).toHaveLength(0)
    })

    it.each([
        "0",
        "101",
        "abc"
    ])("rejects invalid percentage %s", async (percentage) => {
        const target = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await createDiscountAction({
            userId: target.id,
            percentage,
            expiration: null,
            reason: null,
            scope: "season"
        })

        expect(result.status).toBe(false)
        expect(result.message).toBe("Percentage must be between 1 and 100.")
    })

    it("rejects unknown scopes", async () => {
        const target = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await createDiscountAction({
            userId: target.id,
            percentage: "50",
            expiration: null,
            reason: null,
            scope: "lifetime" as never
        })

        expect(result).toEqual({
            status: false,
            message: "Invalid discount scope."
        })
    })

    it("creates a discount visible via getDiscounts", async () => {
        const target = await createUser({
            first_name: "Pat",
            last_name: "Player",
            preferred_name: null
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await createDiscountAction({
            userId: target.id,
            percentage: "25",
            expiration: null,
            reason: "Volunteer",
            scope: "season"
        })

        expect(result.status).toBe(true)
        const listing = await getDiscounts()
        expect(listing.status).toBe(true)
        expect(listing.discounts).toHaveLength(1)
        expect(listing.discounts[0].percentage).toBe("25")
        expect(listing.discounts[0].userName).toBe("Pat Player")
        expect(listing.discounts[0].used).toBe(false)
    })
})

describe("updateDiscount", () => {
    it("updates the percentage and resets the used flag", async () => {
        const target = await createUser()
        const discount = await createDiscount({
            user: target.id,
            percentage: "10",
            used: true
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await updateDiscount({
            id: discount.id,
            percentage: "60",
            expiration: null,
            reason: "Updated"
        })

        expect(result.status).toBe(true)
        const [row] = await db
            .select()
            .from(discounts)
            .where(eq(discounts.id, discount.id))
        expect(row.percentage).toBe("60")
        expect(row.used).toBe(false)
    })
})

describe("deleteDiscount", () => {
    it("rejects non-admin callers", async () => {
        const target = await createUser()
        const discount = await createDiscount({ user: target.id })
        await createUserWithRoles([])

        const result = await deleteDiscount(discount.id)
        expect(result).toEqual({ status: false, message: "Unauthorized" })
        expect(await db.select().from(discounts)).toHaveLength(1)
    })

    it("removes the discount for an admin", async () => {
        const target = await createUser()
        const discount = await createDiscount({ user: target.id })
        await createUserWithRoles([{ role: "admin" }])

        const result = await deleteDiscount(discount.id)
        expect(result.status).toBe(true)
        expect(await db.select().from(discounts)).toHaveLength(0)
    })
})
