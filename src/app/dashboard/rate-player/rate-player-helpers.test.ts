import { describe, expect, it } from "vitest"

import { resolveDefaultLookupType } from "./rate-player-helpers"

const tryoutDates = ["2026-09-12", "2026-09-19", "2026-09-26"]

const base = {
    phase: "prep_tryout_week_1" as const,
    tryoutDates,
    today: "2026-09-01",
    draftStarted: false,
    byTeamAvailable: true
}

describe("resolveDefaultLookupType", () => {
    it("is direct in the off-season and once the season is complete", () => {
        expect(
            resolveDefaultLookupType({
                ...base,
                phase: "off_season",
                today: "2026-09-20",
                draftStarted: true
            })
        ).toBe("direct")
        expect(
            resolveDefaultLookupType({
                ...base,
                phase: "complete",
                today: "2026-12-01",
                draftStarted: true
            })
        ).toBe("direct")
    })

    it("is direct before the first tryout", () => {
        expect(resolveDefaultLookupType({ ...base, today: "2026-09-11" })).toBe(
            "direct"
        )
    })

    it("switches to each tryout on its date and holds until the next one", () => {
        expect(resolveDefaultLookupType({ ...base, today: "2026-09-12" })).toBe(
            "tryout1"
        )
        expect(resolveDefaultLookupType({ ...base, today: "2026-09-18" })).toBe(
            "tryout1"
        )
        expect(resolveDefaultLookupType({ ...base, today: "2026-09-19" })).toBe(
            "tryout2"
        )
        expect(resolveDefaultLookupType({ ...base, today: "2026-09-25" })).toBe(
            "tryout2"
        )
        expect(resolveDefaultLookupType({ ...base, today: "2026-09-26" })).toBe(
            "tryout3"
        )
        expect(
            resolveDefaultLookupType({
                ...base,
                phase: "draft",
                today: "2026-10-05"
            })
        ).toBe("tryout3")
    })

    it("switches to By Team once drafting has started", () => {
        expect(
            resolveDefaultLookupType({
                ...base,
                phase: "draft",
                today: "2026-10-05",
                draftStarted: true
            })
        ).toBe("byTeam")
        expect(
            resolveDefaultLookupType({
                ...base,
                phase: "regular_season",
                today: "2026-10-20",
                draftStarted: true
            })
        ).toBe("byTeam")
    })

    it("falls back to the tryout rule when By Team is not offered", () => {
        expect(
            resolveDefaultLookupType({
                ...base,
                phase: "draft",
                today: "2026-10-05",
                draftStarted: true,
                byTeamAvailable: false
            })
        ).toBe("tryout3")
    })

    it("handles seasons with fewer than three tryout dates", () => {
        expect(
            resolveDefaultLookupType({
                ...base,
                tryoutDates: ["2026-09-12"],
                today: "2026-10-01"
            })
        ).toBe("tryout1")
        expect(
            resolveDefaultLookupType({
                ...base,
                tryoutDates: [],
                today: "2026-10-01"
            })
        ).toBe("direct")
    })
})

import { buildTryoutTimeSlotGroups } from "./rate-player-helpers"
import type { RatePlayerEntry } from "./actions"

function makePlayer(
    id: string,
    overrides: Partial<RatePlayerEntry> = {}
): RatePlayerEntry {
    return {
        id,
        oldId: null,
        firstName: id,
        lastName: id,
        preferredName: null,
        male: true,
        height: null,
        lastDivisionName: null,
        picture: null,
        ...overrides
    }
}

describe("buildTryoutTimeSlotGroups", () => {
    const players = new Map(
        ["p1", "p2", "p3", "p4", "p5", "p6"].map((id) => [id, makePlayer(id)])
    )
    const noHistory = new Map<string, string>()

    it("buckets teams into sessions by team number with courts per division", () => {
        const rows = [
            {
                userId: "p1",
                divisionName: "A",
                divisionLevel: 2,
                teamNumber: 1
            },
            {
                userId: "p2",
                divisionName: "A",
                divisionLevel: 2,
                teamNumber: 2
            },
            {
                userId: "p3",
                divisionName: "AA",
                divisionLevel: 1,
                teamNumber: 3
            },
            {
                userId: "p4",
                divisionName: "A",
                divisionLevel: 2,
                teamNumber: 4
            },
            {
                userId: "p5",
                divisionName: "BB",
                divisionLevel: 6,
                teamNumber: 6
            }
        ]

        const groups = buildTryoutTimeSlotGroups(rows, players, noHistory, [
            "6:30 PM",
            "7:35 PM",
            "8:40 PM"
        ])

        expect(groups.map((g) => g.sessionNumber)).toEqual([1, 2, 3])
        expect(groups.map((g) => g.timeLabel)).toEqual([
            "6:30 PM",
            "7:35 PM",
            "8:40 PM"
        ])

        // Session 1: division A (court 2), teams 1 and 2
        expect(groups[0].divisions).toHaveLength(1)
        expect(groups[0].divisions[0].divisionName).toBe("A")
        expect(groups[0].divisions[0].courtNumber).toBe(2)
        expect(groups[0].divisions[0].teams.map((t) => t.teamNumber)).toEqual([
            1, 2
        ])

        // Session 2: divisions ordered by level — AA (court 1) before A (court 2)
        expect(
            groups[1].divisions.map((d) => [d.divisionName, d.courtNumber])
        ).toEqual([
            ["AA", 1],
            ["A", 2]
        ])

        // Session 3: BB on court 7
        expect(groups[2].divisions[0].courtNumber).toBe(7)
    })

    it("falls back to a session label when no time slot is configured", () => {
        const rows = [
            {
                userId: "p5",
                divisionName: "BB",
                divisionLevel: 6,
                teamNumber: 5
            }
        ]

        const groups = buildTryoutTimeSlotGroups(rows, players, noHistory, [])

        expect(groups).toHaveLength(1)
        expect(groups[0].sessionNumber).toBe(3)
        expect(groups[0].timeLabel).toBe("Session 3")
    })

    it("skips roster rows for unknown players and omits empty sessions", () => {
        const rows = [
            {
                userId: "ghost",
                divisionName: "A",
                divisionLevel: 2,
                teamNumber: 1
            },
            { userId: "p1", divisionName: "A", divisionLevel: 2, teamNumber: 3 }
        ]

        const groups = buildTryoutTimeSlotGroups(rows, players, noHistory, [])

        expect(groups.map((g) => g.sessionNumber)).toEqual([2])
    })

    it("sorts players within a team: new first, then male, then last name", () => {
        const roster = new Map([
            ["new-z", makePlayer("new-z", { lastName: "Zed" })],
            ["ret-a", makePlayer("ret-a", { lastName: "Abel" })],
            ["new-f", makePlayer("new-f", { lastName: "Fox", male: false })]
        ])
        const history = new Map([["ret-a", "A"]])
        const rows = ["ret-a", "new-z", "new-f"].map((userId) => ({
            userId,
            divisionName: "A",
            divisionLevel: 2,
            teamNumber: 1
        }))

        const groups = buildTryoutTimeSlotGroups(rows, roster, history, [])

        expect(
            groups[0].divisions[0].teams[0].players.map((p) => p.id)
        ).toEqual(["new-z", "new-f", "ret-a"])
    })
})
