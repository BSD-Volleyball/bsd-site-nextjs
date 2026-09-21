import { describe, expect, it } from "vitest"
import {
    TASK_GROUPS,
    resolveTaskGroups,
    slotAssigneeNames,
    slotTaskGroups,
    slotTaskKeys
} from "./tasks"
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

const text = (groups: ReturnType<typeof slotTaskGroups>) =>
    groups.flatMap((g) => g.lines.map((l) => l.text)).join("\n")

describe("slotTaskKeys", () => {
    it("setup first, mid-way on the slot before last, cleanup last", () => {
        const d = day()
        expect(slotTaskKeys(d, d.slots[0])).toEqual(["setup"])
        expect(slotTaskKeys(d, d.slots[1])).toEqual(["midway"])
        expect(slotTaskKeys(d, d.slots[2])).toEqual(["cleanup"])
    })

    it("with four slots the second middle slot gets mid-way", () => {
        const d = day({}, [
            slot("18:00:00"),
            slot("19:00:00"),
            slot("20:00:00"),
            slot("21:00:00")
        ])
        expect(slotTaskKeys(d, d.slots[1])).toEqual([])
        expect(slotTaskKeys(d, d.slots[2])).toEqual(["midway"])
    })

    it("a two-slot night puts setup and mid-way on the first slot", () => {
        const d = day({}, [slot("19:00:00"), slot("20:00:00")])
        expect(slotTaskKeys(d, d.slots[0])).toEqual(["setup", "midway"])
        expect(slotTaskKeys(d, d.slots[1])).toEqual(["cleanup"])
    })

    it("a single-slot night carries all three groups", () => {
        const d = day({}, [slot("19:00:00")])
        expect(slotTaskKeys(d, d.slots[0])).toEqual([
            "setup",
            "midway",
            "cleanup"
        ])
    })

    it("the TBD slot never carries tasks and never shifts the ends", () => {
        const d = day({}, [slot("19:00:00"), slot("20:00:00"), slot(null)])
        expect(slotTaskKeys(d, d.slots[2])).toEqual([])
        expect(slotTaskKeys(d, d.slots[0])).toEqual(["setup", "midway"])
        expect(slotTaskKeys(d, d.slots[1])).toEqual(["cleanup"])
    })
})

describe("resolveTaskGroups / slotTaskGroups", () => {
    it("the reference list labels every conditional line", () => {
        const conditional = TASK_GROUPS.flatMap((g) => g.lines).filter(
            (l) => l.when !== null
        )
        expect(conditional.map((l) => l.when)).toEqual([
            "regular_season",
            "playoff",
            "last_regular_week",
            "playoffs_next_week"
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
        const mid = text(slotTaskGroups(d, d.slots[1]))
        expect(mid).toContain("Playoff scoresheets")
        expect(mid).not.toContain("Place two flags")
    })

    it("the last regular-season week places flags and pulls playoff scoresheets", () => {
        const d = day({ nextEventType: "playoff" })
        const mid = text(slotTaskGroups(d, d.slots[1]))
        expect(mid).toContain("Place two flags")
        expect(mid).toContain("Playoff scoresheets")
    })

    it("a mid-season week pulls regular scoresheets only", () => {
        const d = day()
        const mid = text(slotTaskGroups(d, d.slots[1]))
        expect(mid).toContain("Pull out new scoresheets")
        expect(mid).not.toContain("Playoff scoresheets")
        expect(mid).not.toContain("Place two flags")
    })

    it("keeps group order and hints when resolving", () => {
        const groups = resolveTaskGroups(day())
        expect(groups.map((g) => g.key)).toEqual(["setup", "midway", "cleanup"])
        expect(groups[0].hint).toBe("plan for ~10 minutes")
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
