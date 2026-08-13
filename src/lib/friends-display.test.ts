import { describe, expect, it } from "vitest"
import { friendScheduleLine, isFriendScheduled } from "@/lib/friends-display"
import type { NextMatch } from "@/lib/next-match"
import type { PreseasonAssignment } from "@/lib/preseason-assignment"

const nextMatch: NextMatch = {
    date: "2026-10-01",
    time: "7:00 PM",
    court: 3,
    opponentName: "Spike Force",
    divisionName: "BB",
    week: 5,
    isUnavailable: false,
    sortKey: "2026-10-01T19:00:00"
}

const preseason: PreseasonAssignment = {
    week: 1,
    sessionLabel: "Session 2",
    courtNumber: 5,
    divisionName: null,
    date: "2026-09-03",
    time: "8:00 PM",
    sortKey: "2026-09-03T20:00:00"
}

describe("isFriendScheduled", () => {
    it("counts a match or a tryout slot as scheduled", () => {
        expect(isFriendScheduled({ nextMatch, signedUpForSeason: true })).toBe(
            true
        )
        expect(
            isFriendScheduled({
                nextMatch: null,
                preseason,
                signedUpForSeason: true
            })
        ).toBe(true)
    })

    it("does not count a signup on its own", () => {
        expect(
            isFriendScheduled({
                nextMatch: null,
                preseason: null,
                signedUpForSeason: true
            })
        ).toBe(false)
    })
})

describe("friendScheduleLine", () => {
    it("omits the opponent unless asked", () => {
        const friend = { nextMatch, signedUpForSeason: true }
        expect(friendScheduleLine(friend)).toBe(
            "Week 5 · Thu, Oct 1 7:00 PM · Court 3"
        )
        expect(friendScheduleLine(friend, { includeOpponent: true })).toBe(
            "Week 5 · Thu, Oct 1 7:00 PM · Court 3 · vs Spike Force (BB)"
        )
    })

    it("describes a tryout slot when there is no match", () => {
        expect(
            friendScheduleLine({
                nextMatch: null,
                preseason,
                signedUpForSeason: true
            })
        ).toBe("Tryout Week 1 · Thu, Sep 3 · Session 2 · 8:00 PM · Court 5")
    })

    it("prefers a match over a tryout slot", () => {
        expect(
            friendScheduleLine({
                nextMatch,
                preseason,
                signedUpForSeason: true
            })
        ).toContain("Week 5")
    })

    it("separates signed up from not in the season", () => {
        expect(
            friendScheduleLine({
                nextMatch: null,
                preseason: null,
                signedUpForSeason: true
            })
        ).toBe("Signed up — not scheduled yet")
        expect(
            friendScheduleLine({
                nextMatch: null,
                preseason: null,
                signedUpForSeason: false
            })
        ).toBe("Not playing this season")
    })
})
