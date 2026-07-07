import { describe, expect, it } from "vitest"
import { calculateDiscountedAmount } from "@/lib/discount"

// Only the pure calculation is unit-tested here; getActiveDiscountForUser and
// markDiscountAsUsed hit the database and are covered by the pay-season
// integration tests.
describe("calculateDiscountedAmount", () => {
    it("applies percentage discounts to two decimal places", () => {
        expect(calculateDiscountedAmount("100.00", "50")).toBe("50.00")
        expect(calculateDiscountedAmount("120.50", "10")).toBe("108.45")
    })

    it("returns zero for a 100% discount", () => {
        expect(calculateDiscountedAmount("100.00", "100")).toBe("0.00")
    })

    it("returns the base amount for a 0% discount", () => {
        expect(calculateDiscountedAmount("85.00", "0")).toBe("85.00")
    })

    it("rounds fractional cents", () => {
        // 99.99 * 0.75 = 74.9925 → 74.99
        expect(calculateDiscountedAmount("99.99", "25")).toBe("74.99")
    })
})
