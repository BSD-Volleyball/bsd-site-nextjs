import { describe, expect, it } from "vitest"

import { mapRostersToSlots } from "@/lib/tryout-volunteer-conflicts"
import type { SeasonEvent } from "@/lib/season-types"

function tryoutNight(id: number, slotIds: number[]): SeasonEvent {
    return {
        id,
        eventType: "tryout",
        eventDate: "2026-09-10",
        sortOrder: id,
        label: null,
        timeSlots: slotIds.map((slotId, index) => ({
            id: slotId,
            startTime: `${18 + index}:00:00`,
            slotLabel: null,
            sortOrder: index
        }))
    }
}

const NIGHTS = [
    tryoutNight(1, [101, 102]),
    tryoutNight(2, [201, 202, 203]),
    tryoutNight(3, [301, 302, 303])
]

describe("mapRostersToSlots", () => {
    it("maps a week-1 session number onto that night's matching slot", () => {
        const result = mapRostersToSlots(NIGHTS, [
            [
                { user: "a", sessionNumber: 1 },
                { user: "b", sessionNumber: 2 }
            ],
            [],
            []
        ])

        expect([...(result.get("a") ?? [])]).toEqual([101])
        expect([...(result.get("b") ?? [])]).toEqual([102])
    })

    it("maps week 2/3 team numbers to slots in pairs", () => {
        // Teams 1-2 → slot 1, teams 3-4 → slot 2, teams 5-6 → slot 3.
        const result = mapRostersToSlots(NIGHTS, [
            [],
            [
                { user: "a", sessionNumber: 1 },
                { user: "b", sessionNumber: 2 },
                { user: "c", sessionNumber: 3 }
            ],
            []
        ])

        expect([...(result.get("a") ?? [])]).toEqual([201])
        expect([...(result.get("b") ?? [])]).toEqual([202])
        expect([...(result.get("c") ?? [])]).toEqual([203])
    })

    it("collects every slot a player is scheduled across all three nights", () => {
        const result = mapRostersToSlots(NIGHTS, [
            [{ user: "a", sessionNumber: 2 }],
            [{ user: "a", sessionNumber: 1 }],
            [{ user: "a", sessionNumber: 3 }]
        ])

        expect([...(result.get("a") ?? [])].sort()).toEqual([102, 201, 303])
    })

    it("ignores a session number with no matching slot", () => {
        // Night 1 only has two slots; a session_number of 3 has nowhere to go.
        const result = mapRostersToSlots(NIGHTS, [
            [{ user: "a", sessionNumber: 3 }],
            [],
            []
        ])

        expect(result.has("a")).toBe(false)
    })

    it("ignores rosters for nights that aren't configured", () => {
        const result = mapRostersToSlots(
            [tryoutNight(1, [101, 102])],
            [[], [{ user: "a", sessionNumber: 1 }], []]
        )

        expect(result.size).toBe(0)
    })

    it("orders slots by sortOrder, not insertion order", () => {
        const scrambled: SeasonEvent = {
            ...tryoutNight(1, []),
            timeSlots: [
                {
                    id: 999,
                    startTime: "20:00:00",
                    slotLabel: null,
                    sortOrder: 1
                },
                {
                    id: 111,
                    startTime: "18:00:00",
                    slotLabel: null,
                    sortOrder: 0
                }
            ]
        }

        const result = mapRostersToSlots(
            [scrambled],
            [[{ user: "a", sessionNumber: 1 }], [], []]
        )

        expect([...(result.get("a") ?? [])]).toEqual([111])
    })
})
