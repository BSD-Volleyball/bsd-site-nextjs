import { describe, expect, it } from "vitest"
import {
    buildInsuranceGroups,
    type InsuranceGroup,
    seasonLabel
} from "./report-logic"

function group(groups: InsuranceGroup[], value: string): InsuranceGroup {
    const found = groups.find((g) => g.value === value)
    if (!found) throw new Error(`missing group ${value}`)
    return found
}

describe("seasonLabel", () => {
    it("capitalizes the season and appends the year", () => {
        expect(seasonLabel("spring", 2026)).toBe("Spring 2026")
    })
})

describe("buildInsuranceGroups", () => {
    it("counts a user once across multiple events and de-duplicates labels", () => {
        const groups = buildInsuranceGroups({
            ageEntries: [{ userId: "u1", age: "20+" }],
            participation: [
                { userId: "u1", name: "Alice A", label: "Spring 2026" },
                { userId: "u1", name: "Alice A", label: "Summer Slam 2026" },
                { userId: "u1", name: "Alice A", label: "Spring 2026" }
            ]
        })
        const adults = group(groups, "20+")
        expect(adults.total).toBe(1)
        expect(adults.users[0].events).toEqual([
            "Spring 2026",
            "Summer Slam 2026"
        ])
    })

    it("buckets a user into the youngest group they registered as", () => {
        const groups = buildInsuranceGroups({
            ageEntries: [
                { userId: "u1", age: "19-18" },
                { userId: "u1", age: "15-14" }
            ],
            participation: [{ userId: "u1", name: "Kid K", label: "Fall 2026" }]
        })
        expect(group(groups, "15-14").total).toBe(1)
        expect(group(groups, "19-18").total).toBe(0)
    })

    it("defaults tournament-only participants (no signup age) to adults", () => {
        const groups = buildInsuranceGroups({
            ageEntries: [],
            participation: [
                { userId: "t1", name: "Walk On", label: "Beach Bash 2026" }
            ]
        })
        expect(group(groups, "20+").total).toBe(1)
        expect(group(groups, "20+").users[0].name).toBe("Walk On")
    })

    it("includes both rostered players and permanent subs", () => {
        const groups = buildInsuranceGroups({
            ageEntries: [],
            participation: [
                { userId: "rostered", name: "Reg Roster", label: "Fall 2026" },
                { userId: "sub", name: "Perry Sub", label: "Fall 2026" }
            ]
        })
        expect(group(groups, "20+").total).toBe(2)
    })

    it("returns all four groups youngest-first, even when empty", () => {
        const groups = buildInsuranceGroups({
            ageEntries: [],
            participation: []
        })
        expect(groups.map((g) => g.value)).toEqual([
            "15-14",
            "17-16",
            "19-18",
            "20+"
        ])
        expect(groups.every((g) => g.total === 0)).toBe(true)
    })
})
