import { describe, expect, it } from "vitest"
import { DEFAULT_AGE_GROUP, youngestAgeGroup } from "./age-groups"

describe("youngestAgeGroup", () => {
    it("returns the only recognized value", () => {
        expect(youngestAgeGroup(["17-16"])).toBe("17-16")
    })

    it("picks the youngest across multiple registrations", () => {
        expect(youngestAgeGroup(["20+", "15-14", "19-18"])).toBe("15-14")
    })

    it("ignores unknown and null values", () => {
        expect(youngestAgeGroup([null, "bogus", "19-18"])).toBe("19-18")
    })

    it("defaults to the adult group when nothing is recognized", () => {
        expect(youngestAgeGroup([null, undefined, "??"])).toBe(
            DEFAULT_AGE_GROUP
        )
    })

    it("defaults to the adult group for empty input", () => {
        expect(youngestAgeGroup([])).toBe("20+")
    })
})
