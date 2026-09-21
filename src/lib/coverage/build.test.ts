import { describe, expect, it } from "vitest"
import type { SchedulePerson, ScheduleItem } from "@/lib/schedule-item-types"
import { type BuildCoverageInput, buildCoverage } from "./build"

const ADMIN: SchedulePerson = {
    userId: "a1",
    firstName: "Alex",
    lastName: "Admin",
    preferredName: null
}
const ADMIN2: SchedulePerson = {
    userId: "a2",
    firstName: "Bea",
    lastName: "Boss",
    preferredName: "B"
}
const LEAD: SchedulePerson = {
    userId: "l1",
    firstName: "Lee",
    lastName: "Leader",
    preferredName: null
}

function playItem(
    userId: string,
    date: string,
    startTime: string | null,
    extra: Partial<Extract<ScheduleItem, { kind: "match" }>> = {}
): ScheduleItem {
    return {
        kind: "match",
        userId,
        date,
        startTime,
        endTime: null,
        court: 1,
        matchId: 1,
        role: "play",
        playoff: false,
        week: 1,
        divisionId: 1,
        divisionName: "A",
        teamId: 1,
        homeTeamId: 1,
        awayTeamId: 2,
        homeName: "H",
        awayName: "A",
        subbingFor: null,
        ...extra
    }
}

function refItem(
    userId: string,
    date: string,
    startTime: string
): ScheduleItem {
    return {
        kind: "ref",
        userId,
        date,
        startTime,
        endTime: null,
        court: 1,
        matchId: 2,
        playoff: false,
        divisionName: "A",
        homeName: "H",
        awayName: "A"
    }
}

function baseInput(over: Partial<BuildCoverageInput> = {}): BuildCoverageInput {
    return {
        events: [
            {
                eventId: 10,
                date: "2026-10-06",
                eventType: "regular_season",
                label: null
            }
        ],
        matches: [
            { matchId: 1, date: "2026-10-06", startTime: "19:00:00" },
            { matchId: 2, date: "2026-10-06", startTime: "20:00:00" },
            { matchId: 3, date: "2026-10-06", startTime: "21:00:00" }
        ],
        items: [],
        presence: [],
        coaching: [],
        unavailable: new Set(),
        people: new Map([
            ["a1", ADMIN],
            ["a2", ADMIN2],
            ["l1", LEAD]
        ]),
        adminIds: new Set(["a1", "a2"]),
        leadershipIds: new Set(["l1"]),
        ...over
    }
}

describe("buildCoverage", () => {
    it("builds one slot per distinct match time, sorted, with match counts", () => {
        const [d] = buildCoverage(
            baseInput({
                matches: [
                    { matchId: 1, date: "2026-10-06", startTime: "21:00:00" },
                    { matchId: 2, date: "2026-10-06", startTime: "19:00:00" },
                    { matchId: 3, date: "2026-10-06", startTime: "19:00:00" }
                ]
            })
        )
        expect(d.slots.map((s) => s.startTime)).toEqual([
            "19:00:00",
            "21:00:00"
        ])
        expect(d.slots.map((s) => s.matchCount)).toEqual([2, 1])
        expect(d.slots[0].label).toBe("7:00 PM")
        expect(d.matchCount).toBe(3)
    })

    it("omits an event date with neither matches nor presence", () => {
        const out = buildCoverage(baseInput({ matches: [], presence: [] }))
        expect(out).toEqual([])
    })

    it("surfaces presence rows on an event date with no matches as orphans", () => {
        const out = buildCoverage(
            baseInput({
                matches: [],
                presence: [
                    {
                        id: 42,
                        userId: "a1",
                        date: "2026-10-06",
                        slotTime: "19:00:00",
                        note: null
                    }
                ]
            })
        )
        expect(out).toHaveLength(1)
        const [d] = out
        expect(d.matchCount).toBe(0)
        expect(d.slots).toEqual([])
        expect(d.status).toBe("red")
        expect(d.orphanedPresence).toEqual([
            {
                presenceId: 42,
                userId: "a1",
                name: "Alex Admin",
                slotTime: "19:00:00",
                note: null
            }
        ])
    })

    it("a match-less week still consumes its ordinal", () => {
        const out = buildCoverage(
            baseInput({
                events: [
                    {
                        eventId: 10,
                        date: "2026-10-06",
                        eventType: "regular_season",
                        label: null
                    },
                    {
                        eventId: 11,
                        date: "2026-10-13",
                        eventType: "regular_season",
                        label: null
                    }
                ],
                matches: [
                    { matchId: 1, date: "2026-10-13", startTime: "19:00:00" }
                ],
                presence: []
            })
        )
        expect(out).toHaveLength(1)
        expect(out[0].date).toBe("2026-10-13")
        expect(out[0].ordinal).toBe(2)
    })

    it("an admin playing counts, with source play", () => {
        const [d] = buildCoverage(
            baseInput({ items: [playItem("a1", "2026-10-06", "19:00")] })
        )
        const p = d.slots[0].people[0]
        expect(p.userId).toBe("a1")
        expect(p.name).toBe("Alex Admin")
        expect(p.counts).toBe(true)
        expect(p.sources).toEqual(["play"])
    })

    it("uses the preferred name when set", () => {
        const [d] = buildCoverage(
            baseInput({ items: [playItem("a2", "2026-10-06", "19:00:00")] })
        )
        expect(d.slots[0].people[0].name).toBe("B Boss")
    })

    it("maps ref and playoff work items to their sources", () => {
        const [d] = buildCoverage(
            baseInput({
                items: [
                    refItem("a1", "2026-10-06", "20:00:00"),
                    playItem("a2", "2026-10-06", "21:00:00", {
                        role: "work",
                        playoff: true
                    })
                ]
            })
        )
        expect(d.slots[1].people[0].sources).toEqual(["ref"])
        expect(d.slots[2].people[0].sources).toEqual(["work"])
    })

    it("leadership members are listed but do not count", () => {
        const [d] = buildCoverage(
            baseInput({ items: [playItem("l1", "2026-10-06", "19:00:00")] })
        )
        const p = d.slots[0].people[0]
        expect(p.isLeadership).toBe(true)
        expect(p.counts).toBe(false)
        expect(d.status).toBe("red")
    })

    it("a leadership member with a manual presence row counts", () => {
        const [d] = buildCoverage(
            baseInput({
                presence: [
                    {
                        id: 1,
                        userId: "l1",
                        date: "2026-10-06",
                        slotTime: "19:00:00",
                        note: null
                    },
                    {
                        id: 2,
                        userId: "l1",
                        date: "2026-10-06",
                        slotTime: "20:00:00",
                        note: null
                    },
                    {
                        id: 3,
                        userId: "l1",
                        date: "2026-10-06",
                        slotTime: "21:00:00",
                        note: null
                    }
                ]
            })
        )
        const p = d.slots[0].people[0]
        expect(p.userId).toBe("l1")
        expect(p.counts).toBe(true)
        expect(p.isLeadership).toBe(true)
        expect(p.sources).toEqual(["present"])
        expect(d.status).toBe("green")
    })

    it("an unavailable admin with a manual presence row counts (override)", () => {
        const [d] = buildCoverage(
            baseInput({
                items: [playItem("a1", "2026-10-06", "19:00:00")],
                presence: [
                    {
                        id: 2,
                        userId: "a1",
                        date: "2026-10-06",
                        slotTime: "19:00:00",
                        note: "can't play, will cover"
                    }
                ],
                unavailable: new Set(["a1|10"])
            })
        )
        const p = d.slots[0].people[0]
        expect(p.counts).toBe(true)
        expect(p.unavailable).toBe(true)
        expect(p.sources).toEqual(["play", "present"])
    })

    it("an unavailable leadership member with presence counts (override)", () => {
        const [d] = buildCoverage(
            baseInput({
                presence: [
                    {
                        id: 1,
                        userId: "l1",
                        date: "2026-10-06",
                        slotTime: "19:00:00",
                        note: null
                    }
                ],
                unavailable: new Set(["l1|10"])
            })
        )
        const p = d.slots[0].people[0]
        expect(p.counts).toBe(true)
        expect(p.unavailable).toBe(true)
    })

    it("unavailable admins are flagged and do not count", () => {
        const [d] = buildCoverage(
            baseInput({
                items: [playItem("a1", "2026-10-06", "19:00:00")],
                unavailable: new Set(["a1|10"])
            })
        )
        const p = d.slots[0].people[0]
        expect(p.unavailable).toBe(true)
        expect(p.counts).toBe(false)
        expect(p.sources).toEqual(["play"])
    })

    it("merges a manual presence row into the same person", () => {
        const [d] = buildCoverage(
            baseInput({
                items: [playItem("a1", "2026-10-06", "19:00:00")],
                presence: [
                    {
                        id: 77,
                        userId: "a1",
                        date: "2026-10-06",
                        slotTime: "19:00:00",
                        note: "setup"
                    }
                ]
            })
        )
        expect(d.slots[0].people).toHaveLength(1)
        const p = d.slots[0].people[0]
        expect(p.sources).toEqual(["play", "present"])
        expect(p.presenceId).toBe(77)
        expect(p.note).toBe("setup")
    })

    it("a presence-only admin counts", () => {
        const [d] = buildCoverage(
            baseInput({
                presence: [
                    {
                        id: 5,
                        userId: "a2",
                        date: "2026-10-06",
                        slotTime: "21:00:00",
                        note: null
                    }
                ]
            })
        )
        expect(d.slots[2].people[0].counts).toBe(true)
        expect(d.slots[2].people[0].sources).toEqual(["present"])
    })

    it("surfaces presence rows that match no slot as orphans", () => {
        const [d] = buildCoverage(
            baseInput({
                presence: [
                    {
                        id: 9,
                        userId: "a1",
                        date: "2026-10-06",
                        slotTime: "18:30:00",
                        note: null
                    }
                ]
            })
        )
        expect(d.orphanedPresence).toEqual([
            {
                presenceId: 9,
                userId: "a1",
                name: "Alex Admin",
                slotTime: "18:30:00",
                note: null
            }
        ])
        expect(d.slots.flatMap((s) => s.people)).toHaveLength(0)
    })

    it("puts null-time matches in a TBD slot sorted last", () => {
        const [d] = buildCoverage(
            baseInput({
                matches: [
                    { matchId: 1, date: "2026-10-06", startTime: null },
                    { matchId: 2, date: "2026-10-06", startTime: "19:00:00" }
                ],
                items: [
                    playItem("a1", "2026-10-06", "19:00:00"),
                    playItem("a2", "2026-10-06", null)
                ]
            })
        )
        expect(d.slots.map((s) => s.startTime)).toEqual(["19:00:00", null])
        expect(d.slots[1].label).toBe("TBD")
        expect(d.slots[1].people[0].userId).toBe("a2")
        expect(d.status).toBe("green")
    })

    it("ignores tryout and volunteer items and other dates", () => {
        const [d] = buildCoverage(
            baseInput({
                items: [
                    playItem("a1", "2026-10-13", "19:00:00"),
                    {
                        kind: "tryout",
                        userId: "a1",
                        date: "2026-10-06",
                        startTime: "19:00:00",
                        endTime: null,
                        court: null,
                        eventId: 10,
                        tryoutNumber: 1,
                        session: 1,
                        sublabel: null
                    }
                ]
            })
        )
        expect(d.slots.flatMap((s) => s.people)).toHaveLength(0)
    })

    it("numbers ordinals per event type in date order", () => {
        const out = buildCoverage(
            baseInput({
                events: [
                    {
                        eventId: 11,
                        date: "2026-10-13",
                        eventType: "regular_season",
                        label: null
                    },
                    {
                        eventId: 10,
                        date: "2026-10-06",
                        eventType: "regular_season",
                        label: null
                    },
                    {
                        eventId: 12,
                        date: "2026-11-03",
                        eventType: "playoff",
                        label: null
                    }
                ],
                matches: [
                    { matchId: 1, date: "2026-10-06", startTime: "19:00:00" },
                    { matchId: 2, date: "2026-10-13", startTime: "19:00:00" },
                    { matchId: 3, date: "2026-11-03", startTime: "19:00:00" }
                ]
            })
        )
        expect(out.map((d) => [d.date, d.eventType, d.ordinal])).toEqual([
            ["2026-10-06", "regular_season", 1],
            ["2026-10-13", "regular_season", 2],
            ["2026-11-03", "playoff", 1]
        ])
    })

    it("records the type of the following night, null for the last", () => {
        const out = buildCoverage(
            baseInput({
                events: [
                    {
                        eventId: 10,
                        date: "2026-10-06",
                        eventType: "regular_season",
                        label: null
                    },
                    {
                        eventId: 11,
                        date: "2026-10-13",
                        eventType: "regular_season",
                        label: null
                    },
                    {
                        eventId: 12,
                        date: "2026-11-03",
                        eventType: "playoff",
                        label: null
                    }
                ],
                matches: [
                    { matchId: 1, date: "2026-10-06", startTime: "19:00:00" },
                    { matchId: 2, date: "2026-10-13", startTime: "19:00:00" },
                    { matchId: 3, date: "2026-11-03", startTime: "19:00:00" }
                ]
            })
        )
        expect(out.map((d) => d.nextEventType)).toEqual([
            "regular_season",
            "playoff",
            null
        ])
    })

    it("an admin coaching counts with source coach", () => {
        const [d] = buildCoverage(
            baseInput({
                coaching: [
                    { userId: "a1", date: "2026-10-06", startTime: "19:00:00" }
                ]
            })
        )
        const p = d.slots[0].people[0]
        expect(p.userId).toBe("a1")
        expect(p.counts).toBe(true)
        expect(p.sources).toEqual(["coach"])
    })

    it("a leadership member coaching is informational", () => {
        const [d] = buildCoverage(
            baseInput({
                coaching: [
                    { userId: "l1", date: "2026-10-06", startTime: "19:00:00" }
                ]
            })
        )
        const p = d.slots[0].people[0]
        expect(p.userId).toBe("l1")
        expect(p.counts).toBe(false)
        expect(p.isLeadership).toBe(true)
        expect(p.sources).toEqual(["coach"])
    })

    it("play and coach merge in source order", () => {
        const [d] = buildCoverage(
            baseInput({
                items: [playItem("a1", "2026-10-06", "19:00:00")],
                coaching: [
                    { userId: "a1", date: "2026-10-06", startTime: "19:00:00" }
                ]
            })
        )
        const p = d.slots[0].people[0]
        expect(p.sources).toEqual(["play", "coach"])
    })

    it("ignores a coaching row at a non-slot time", () => {
        const [d] = buildCoverage(
            baseInput({
                coaching: [
                    { userId: "a1", date: "2026-10-06", startTime: "18:30:00" }
                ]
            })
        )
        expect(d.slots.flatMap((s) => s.people)).toHaveLength(0)
    })

    it("sorts people: counting admins, then unavailable admins, then leadership", () => {
        const [d] = buildCoverage(
            baseInput({
                items: [
                    playItem("l1", "2026-10-06", "19:00:00"),
                    playItem("a1", "2026-10-06", "19:00:00"),
                    playItem("a2", "2026-10-06", "19:00:00")
                ],
                unavailable: new Set(["a1|10"])
            })
        )
        expect(d.slots[0].people.map((p) => p.userId)).toEqual([
            "a2",
            "a1",
            "l1"
        ])
    })
})
