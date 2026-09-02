import { describe, expect, it } from "vitest"
import { GHOST_CAPTAIN_ID } from "@/lib/ghost-captain"
import { computeDraftSetupStatus } from "./draft-setup"

const lockedAt = new Date("2026-09-01T00:00:00Z")

const teams = [
    { captain: "cap-a", captainName: "Ann Alpha" },
    { captain: "cap-b", captainName: "Bob Beta" }
]

describe("computeDraftSetupStatus", () => {
    it("is unlocked with nothing configured", () => {
        const status = computeDraftSetupStatus({
            teams,
            captainsWithRounds: [],
            roundsLockedAt: null,
            orderLockedAt: null
        })
        expect(status.rounds.state).toBe("unlocked")
        expect(status.order.state).toBe("unlocked")
        expect(status.ready).toBe(false)
    })

    it("rounds stay unlocked even when every captain has a row but nobody locked", () => {
        const status = computeDraftSetupStatus({
            teams,
            captainsWithRounds: ["cap-a", "cap-b"],
            roundsLockedAt: null,
            orderLockedAt: lockedAt
        })
        expect(status.rounds.state).toBe("unlocked")
        expect(status.ready).toBe(false)
    })

    it("is ready when both steps are locked and every captain is seated", () => {
        const status = computeDraftSetupStatus({
            teams,
            captainsWithRounds: ["cap-a", "cap-b"],
            roundsLockedAt: lockedAt,
            orderLockedAt: lockedAt
        })
        expect(status.rounds).toEqual({
            state: "locked",
            lockedAt,
            missingCaptains: []
        })
        expect(status.order).toEqual({ state: "locked", lockedAt })
        expect(status.ready).toBe(true)
    })

    it("marks rounds stale when a locked division has a captain without a round", () => {
        const status = computeDraftSetupStatus({
            teams,
            captainsWithRounds: ["cap-a"],
            roundsLockedAt: lockedAt,
            orderLockedAt: lockedAt
        })
        expect(status.rounds.state).toBe("stale")
        expect(status.rounds.missingCaptains).toEqual(["Bob Beta"])
        expect(status.ready).toBe(false)
    })

    it("ignores ghost captains when checking seats", () => {
        const status = computeDraftSetupStatus({
            teams: [
                ...teams,
                { captain: GHOST_CAPTAIN_ID, captainName: "Ghost" }
            ],
            captainsWithRounds: ["cap-a", "cap-b"],
            roundsLockedAt: lockedAt,
            orderLockedAt: lockedAt
        })
        expect(status.rounds.state).toBe("locked")
        expect(status.ready).toBe(true)
    })

    it("is not ready when order is unlocked", () => {
        const status = computeDraftSetupStatus({
            teams,
            captainsWithRounds: ["cap-a", "cap-b"],
            roundsLockedAt: lockedAt,
            orderLockedAt: null
        })
        expect(status.rounds.state).toBe("locked")
        expect(status.order.state).toBe("unlocked")
        expect(status.ready).toBe(false)
    })
})
