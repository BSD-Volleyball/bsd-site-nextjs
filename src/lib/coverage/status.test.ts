import { describe, expect, it } from "vitest"
import { computeStatus } from "./status"
import type { CoveragePerson, CoverageSlot } from "./types"

function person(counts: boolean): CoveragePerson {
    return {
        userId: counts ? "admin" : "lead",
        name: counts ? "Admin A" : "Lead L",
        counts,
        isLeadership: !counts,
        unavailable: false,
        sources: ["play"],
        presenceId: null,
        note: null
    }
}

function slot(
    startTime: string | null,
    people: CoveragePerson[]
): CoverageSlot {
    return {
        startTime,
        label: startTime ?? "TBD",
        matchCount: 1,
        people
    }
}

describe("computeStatus", () => {
    it("green when every timed slot has a counting person", () => {
        const r = computeStatus([
            slot("19:00:00", [person(true)]),
            slot("20:00:00", [person(true)]),
            slot("21:00:00", [person(true)])
        ])
        expect(r.status).toBe("green")
        expect(r.reason).toBe("all 3 slots covered")
    })

    it("yellow when only a middle slot is empty", () => {
        const r = computeStatus([
            slot("19:00:00", [person(true)]),
            slot("20:00:00", []),
            slot("21:00:00", [person(true)])
        ])
        expect(r.status).toBe("yellow")
        expect(r.reason).toBe("8:00 PM slot uncovered")
    })

    it("lists every middle gap", () => {
        const r = computeStatus([
            slot("18:00:00", [person(true)]),
            slot("19:00:00", []),
            slot("20:00:00", []),
            slot("21:00:00", [person(true)])
        ])
        expect(r.status).toBe("yellow")
        expect(r.reason).toBe("7:00 PM and 8:00 PM slots uncovered")
    })

    it("red when the first slot is empty", () => {
        const r = computeStatus([
            slot("19:00:00", []),
            slot("20:00:00", [person(true)]),
            slot("21:00:00", [person(true)])
        ])
        expect(r.status).toBe("red")
        expect(r.reason).toBe("first slot (7:00 PM) uncovered")
    })

    it("red when the last slot is empty", () => {
        const r = computeStatus([
            slot("19:00:00", [person(true)]),
            slot("20:00:00", []),
            slot("21:00:00", [])
        ])
        expect(r.status).toBe("red")
        expect(r.reason).toBe("last slot (9:00 PM) uncovered")
    })

    it("a single slot is both first and last", () => {
        expect(computeStatus([slot("19:00:00", [person(true)])]).status).toBe(
            "green"
        )
        expect(computeStatus([slot("19:00:00", [])]).status).toBe("red")
        expect(computeStatus([slot("19:00:00", [])]).reason).toBe(
            "first slot (7:00 PM) uncovered"
        )
    })

    it("ignores the TBD slot when picking first and last", () => {
        const r = computeStatus([
            slot("19:00:00", [person(true)]),
            slot("20:00:00", [person(true)]),
            slot(null, [])
        ])
        expect(r.status).toBe("green")
    })

    it("non-counting people do not cover a slot", () => {
        const r = computeStatus([
            slot("19:00:00", [person(false)]),
            slot("20:00:00", [person(true)])
        ])
        expect(r.status).toBe("red")
    })

    it("red with no timed slots", () => {
        const r = computeStatus([slot(null, [person(true)])])
        expect(r.status).toBe("red")
        expect(r.reason).toBe("no timed slots")
    })
})
