import { describe, expect, it } from "vitest"
import {
    buildDivisionWeekSchedule,
    type DivisionWeekRosterRow,
    groupDivisionWeekRosters
} from "./division-week-rosters"

function row(
    overrides: Partial<DivisionWeekRosterRow> & { userId: string }
): DivisionWeekRosterRow {
    return {
        firstName: overrides.userId,
        lastName: overrides.userId,
        preferredName: null,
        divisionId: 1,
        divisionName: "AA",
        divisionLevel: 1,
        teamNumber: 1,
        isCaptain: false,
        ...overrides
    }
}

describe("groupDivisionWeekRosters", () => {
    it("orders divisions by level, teams by number and players by last name", () => {
        const groups = groupDivisionWeekRosters([
            row({
                userId: "z",
                divisionId: 2,
                divisionName: "BB",
                divisionLevel: 2
            }),
            row({ userId: "y", teamNumber: 2 }),
            row({ userId: "b", lastName: "Baker" }),
            row({ userId: "a", lastName: "Adams" })
        ])

        expect(groups.map((g) => g.divisionName)).toEqual(["AA", "BB"])
        expect(groups[0].teams.map((t) => t.teamNumber)).toEqual([1, 2])
        expect(groups[0].teams[0].players.map((p) => p.userId)).toEqual([
            "a",
            "b"
        ])
    })

    it("marks captains and flags players on two teams on both", () => {
        const groups = groupDivisionWeekRosters([
            row({
                userId: "cap",
                firstName: "Cara",
                lastName: "Cap",
                isCaptain: true
            }),
            row({ userId: "two", teamNumber: 1 }),
            row({ userId: "two", teamNumber: 3 })
        ])

        const [team1, team3] = groups[0].teams
        expect(team1.players.find((p) => p.userId === "cap")).toMatchObject({
            displayName: "Cara Cap (Capt)",
            hasAsterisk: false
        })
        expect(team1.players.find((p) => p.userId === "two")?.hasAsterisk).toBe(
            true
        )
        expect(team3.players[0].hasAsterisk).toBe(true)
    })

    it("returns nothing for no rows", () => {
        expect(groupDivisionWeekRosters([])).toEqual([])
    })
})

describe("buildDivisionWeekSchedule", () => {
    it("pairs 1v2, 3v4, 5v6 into the session times, dropping missing teams", () => {
        const schedule = buildDivisionWeekSchedule("Unlisted", 4, 2, [
            "6:00 PM",
            "7:00 PM",
            "8:00 PM"
        ])
        expect(schedule).toHaveLength(2)
        expect(schedule.map((m) => m.time)).toEqual(["6:00 PM", "7:00 PM"])
        // Divisions without a legacy court fall back to their position.
        expect(schedule[0].courtNumber).toBe(3)
    })

    it("falls back to Time TBD when the tryout has fewer time slots", () => {
        const schedule = buildDivisionWeekSchedule("Unlisted", 6, 0, [
            "6:00 PM"
        ])
        expect(schedule.map((m) => m.time)).toEqual([
            "6:00 PM",
            "Time TBD",
            "Time TBD"
        ])
    })
})
