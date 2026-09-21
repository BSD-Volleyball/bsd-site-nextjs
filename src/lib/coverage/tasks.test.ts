import { describe, expect, it } from "vitest"
import { slotAssigneeNames, slotTaskGroups } from "./tasks"
import type { CoverageDate, CoverageSlot } from "./types"

function slot(startTime: string | null): CoverageSlot {
    return { startTime, label: startTime ?? "TBD", matchCount: 1, people: [] }
}

function day(
    overrides: Partial<Pick<CoverageDate, "eventType" | "nextEventType">> = {},
    slots: CoverageSlot[] = [
        slot("19:00:00"),
        slot("20:00:00"),
        slot("21:00:00")
    ]
) {
    return {
        eventType: "regular_season" as const,
        nextEventType: "regular_season" as const,
        ...overrides,
        slots
    }
}

const keys = (groups: ReturnType<typeof slotTaskGroups>) =>
    groups.map((g) => g.key)
const text = (groups: ReturnType<typeof slotTaskGroups>) =>
    groups.flatMap((g) => g.items).join("\n")

describe("slotTaskGroups", () => {
    it("gives setup to the first slot, mid-way and cleanup to the last", () => {
        const d = day()
        expect(keys(slotTaskGroups(d, d.slots[0]))).toEqual(["setup"])
        expect(keys(slotTaskGroups(d, d.slots[1]))).toEqual([])
        expect(keys(slotTaskGroups(d, d.slots[2]))).toEqual([
            "midway",
            "cleanup"
        ])
    })

    it("a single-slot night carries all three groups", () => {
        const d = day({}, [slot("19:00:00")])
        expect(keys(slotTaskGroups(d, d.slots[0]))).toEqual([
            "setup",
            "midway",
            "cleanup"
        ])
    })

    it("the TBD slot never carries tasks and never shifts the ends", () => {
        const d = day({}, [slot("19:00:00"), slot("20:00:00"), slot(null)])
        expect(slotTaskGroups(d, d.slots[2])).toEqual([])
        expect(keys(slotTaskGroups(d, d.slots[1]))).toEqual([
            "midway",
            "cleanup"
        ])
    })

    it("regular season puts the clipboard on the ref stand", () => {
        const d = day()
        const t = text(slotTaskGroups(d, d.slots[0]))
        expect(t).toContain("on the ref stand")
        expect(t).not.toContain("line judges")
    })

    it("playoffs put the clipboard on the work team's table with flags", () => {
        const d = day({ eventType: "playoff", nextEventType: "playoff" })
        const setup = text(slotTaskGroups(d, d.slots[0]))
        expect(setup).toContain("line judges")
        expect(setup).not.toContain("on the ref stand")
        const end = text(slotTaskGroups(d, d.slots[2]))
        expect(end).toContain("clipboards and flags")
        expect(end).toContain("volleyballs and two flags")
        expect(end).toContain("Playoff scoresheets")
        expect(end).not.toContain("Last week of the regular season")
    })

    it("the last regular-season week places flags and pulls playoff scoresheets", () => {
        const d = day({ nextEventType: "playoff" })
        const end = text(slotTaskGroups(d, d.slots[2]))
        expect(end).toContain("Last week of the regular season")
        expect(end).toContain("Playoff scoresheets")
        expect(end).not.toContain("Pull out new scoresheets")
    })

    it("a mid-season week pulls regular scoresheets only", () => {
        const d = day()
        const end = text(slotTaskGroups(d, d.slots[2]))
        expect(end).toContain("Pull out new scoresheets")
        expect(end).not.toContain("Playoff scoresheets")
        expect(end).not.toContain("Last week of the regular season")
        expect(end).toContain("load the next scoresheets")
    })

    it("the final night of the season pulls and loads no scoresheets", () => {
        const d = day({ eventType: "playoff", nextEventType: null })
        const end = text(slotTaskGroups(d, d.slots[2]))
        expect(end).not.toContain("scoresheets from the supply bin")
        expect(end).not.toContain("load the next scoresheets")
        expect(end).toContain("BRING THE SCORESHEETS WITH YOU")
    })
})

describe("slotAssigneeNames", () => {
    it("names only the people who count", () => {
        const s: CoverageSlot = {
            ...slot("19:00:00"),
            people: [
                {
                    userId: "a",
                    name: "Ada",
                    counts: true,
                    isLeadership: false,
                    unavailable: false,
                    sources: ["play"],
                    presenceId: null,
                    note: null
                },
                {
                    userId: "l",
                    name: "Lee",
                    counts: false,
                    isLeadership: true,
                    unavailable: false,
                    sources: ["play"],
                    presenceId: null,
                    note: null
                }
            ]
        }
        expect(slotAssigneeNames(s)).toEqual(["Ada"])
    })
})
