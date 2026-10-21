import { describe, expect, it } from "vitest"
import { type BracketMatch, certainBracketAppearances } from "./bracket"

const W1 = "2026-10-22"
const W2 = "2026-10-29"

function match(
    matchNum: number,
    date: string | null,
    startTime: string,
    sources: [string, string, string | null],
    teams: Partial<
        Pick<
            BracketMatch,
            "homeTeamId" | "awayTeamId" | "workTeamId" | "winnerTeamId"
        >
    > = {}
): BracketMatch {
    return {
        matchNum,
        date,
        startTime,
        homeTeamId: null,
        awayTeamId: null,
        workTeamId: null,
        winnerTeamId: null,
        homeSource: sources[0],
        awaySource: sources[1],
        workSource: sources[2],
        ...teams
    }
}

// F26 AA playoffs week 1 as seeded: seeds 1..6 are teams 101..106.
const AA_WEEK1: BracketMatch[] = [
    match(1, W1, "19:00:00", ["S4", "S5", "S1"], {
        homeTeamId: 104,
        awayTeamId: 105,
        workTeamId: 101
    }),
    match(2, W1, "19:50:00", ["S1", "W1", "L1"], { homeTeamId: 101 }),
    match(3, W1, "20:40:00", ["S3", "S6", "S2"], {
        homeTeamId: 103,
        awayTeamId: 106,
        workTeamId: 102
    }),
    match(4, W1, "21:30:00", ["S2", "W3", "L3"], { homeTeamId: 102 })
]

const sortKey = (a: { teamId: number; date: string; startTime: unknown }) =>
    `${a.date}|${a.startTime}|${a.teamId}`

function sorted<T extends { teamId: number; date: string; startTime: unknown }>(
    xs: T[]
): T[] {
    return [...xs].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
}

describe("certainBracketAppearances", () => {
    it("credits both teams of a match at the next one fed by its winner and loser", () => {
        const out = certainBracketAppearances(AA_WEEK1)
        expect(sorted(out)).toEqual(
            sorted([
                // M2: seed 1 is set but its opponent is not, so the schedule
                // engine skips the match; both M1 teams play or work it.
                { teamId: 101, date: W1, startTime: "19:50:00", role: "play" },
                {
                    teamId: 104,
                    date: W1,
                    startTime: "19:50:00",
                    role: "play_or_work"
                },
                {
                    teamId: 105,
                    date: W1,
                    startTime: "19:50:00",
                    role: "play_or_work"
                },
                { teamId: 102, date: W1, startTime: "21:30:00", role: "play" },
                {
                    teamId: 103,
                    date: W1,
                    startTime: "21:30:00",
                    role: "play_or_work"
                },
                {
                    teamId: 106,
                    date: W1,
                    startTime: "21:30:00",
                    role: "play_or_work"
                }
            ])
        )
    })

    it("leaves out appearances the schedule engine already credits", () => {
        const out = certainBracketAppearances(AA_WEEK1)
        expect(out.some((a) => a.startTime === "19:00:00")).toBe(false)
        expect(out.some((a) => a.startTime === "20:40:00")).toBe(false)
    })

    it("uses a recorded winner instead of branching", () => {
        const decided = AA_WEEK1.map((m) =>
            m.matchNum === 1 ? { ...m, winnerTeamId: 104 } : m
        )
        const out = certainBracketAppearances(decided)
        const at750 = out.filter((a) => a.startTime === "19:50:00")
        expect(sorted(at750)).toEqual(
            sorted([
                { teamId: 101, date: W1, startTime: "19:50:00", role: "play" },
                { teamId: 104, date: W1, startTime: "19:50:00", role: "play" },
                { teamId: 105, date: W1, startTime: "19:50:00", role: "work" }
            ])
        )
    })

    it("follows a team across nights when every path lands in one slot", () => {
        // Week 2: L2 v L3 worked by W2 at 19:00 on one court, L1 v L4 worked
        // by W4 at 19:00 on another. Every week-1 team is somewhere at 19:00.
        const bracket = [
            ...AA_WEEK1,
            match(5, W2, "19:00:00", ["L2", "L3", "W2"]),
            match(6, W2, "19:00:00", ["L1", "L4", "W4"]),
            match(7, W2, "19:50:00", ["W2", "W4", "L5"])
        ]
        const week2 = certainBracketAppearances(bracket).filter(
            (a) => a.date === W2 && a.startTime === "19:00:00"
        )
        expect(week2.map((a) => a.teamId).sort()).toEqual([
            101, 102, 103, 104, 105, 106
        ])
        // Seed 2 is in M4 at worst and its loser (or winner) lands in M6.
        expect(week2.find((a) => a.teamId === 102)?.role).toBe("play_or_work")
    })

    it("credits nobody for a slot that only some outcomes reach", () => {
        // Winner of M1 goes to M2 at 19:50; the loser goes home.
        const bracket = [
            match(1, W1, "19:00:00", ["S1", "S2", null], {
                homeTeamId: 1,
                awayTeamId: 2
            }),
            match(2, W1, "19:50:00", ["S3", "W1", null], { homeTeamId: 3 })
        ]
        const out = certainBracketAppearances(bracket)
        expect(out).toEqual([
            { teamId: 3, date: W1, startTime: "19:50:00", role: "play" }
        ])
    })

    it("skips matches on a night that is not configured yet", () => {
        const bracket = [
            ...AA_WEEK1,
            match(5, null, "19:00:00", ["L2", "L3", "W2"])
        ]
        expect(
            certainBracketAppearances(bracket).every((a) => a.date === W1)
        ).toBe(true)
    })
})
