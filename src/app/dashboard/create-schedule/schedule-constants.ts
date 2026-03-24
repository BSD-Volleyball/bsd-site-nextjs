/**
 * Static schedule patterns extracted from historical BSD season data.
 * These patterns are consistent across seasons and don't need to be computed dynamically.
 */

// 5 unique round-robin rounds for 6 teams (team numbers 1-6)
// Each round has 3 matches: [home, away]
export const SIX_TEAM_ROUNDS: [number, number][][] = [
    [
        [2, 6],
        [3, 5],
        [1, 4]
    ], // Round A
    [
        [4, 5],
        [1, 2],
        [3, 6]
    ], // Round B
    [
        [1, 3],
        [2, 4],
        [5, 6]
    ], // Round C
    [
        [1, 5],
        [4, 6],
        [2, 3]
    ], // Round D
    [
        [3, 4],
        [1, 6],
        [2, 5]
    ] // Round E
]

// Each division uses a different round rotation so matchup times are staggered.
// Index = division position (0-based, by level), values = round indices for weeks 1-6.
// Week 6 always repeats round A (index 0).
export const SIX_TEAM_ROTATIONS: number[][] = [
    [0, 1, 2, 3, 4, 0], // Division position 0 (Court 1)
    [0, 1, 3, 4, 2, 0], // Division position 1 (Court 2)
    [2, 3, 0, 1, 4, 0], // Division position 2 (Court 3)
    [0, 2, 3, 4, 1, 0], // Division position 3 (Court 4)
    [3, 4, 0, 1, 2, 0], // Division position 4 (Court 5)
    [1, 0, 3, 4, 2, 0] // Division position 5 (Court 6)
]

export const SIX_TEAM_TIMES = ["7:00", "8:10", "9:20"]

// 4-team schedule: 6 weeks, 2 matches per week at 8:10, 9:20
// Each pair of teams plays twice across the 6 weeks.
export const FOUR_TEAM_WEEKS: [number, number][][] = [
    [
        [2, 4],
        [1, 3]
    ], // Week 1
    [
        [3, 4],
        [1, 2]
    ], // Week 2
    [
        [1, 4],
        [2, 3]
    ], // Week 3
    [
        [1, 3],
        [2, 4]
    ], // Week 4
    [
        [1, 2],
        [3, 4]
    ], // Week 5
    [
        [2, 3],
        [1, 4]
    ] // Week 6
]

export const FOUR_TEAM_TIMES = ["8:10", "9:20"]

// 6-team playoff bracket: double-elimination, 10 scheduled matches + optional 11th
export interface PlayoffMatchTemplate {
    matchNum: number
    week: number // 1-3
    time: string
    homeSeed: string // e.g. "S4", "W1", "L2"
    awaySeed: string
    workTeam: string | null
    bracket: "winners" | "losers" | "championship"
    nextMatchNum: number | null
    nextLoserMatchNum: number | null
    useSecondCourt: boolean
}

export const SIX_TEAM_PLAYOFF: PlayoffMatchTemplate[] = [
    // Week 1
    {
        matchNum: 1,
        week: 1,
        time: "7:00",
        homeSeed: "S4",
        awaySeed: "S5",
        workTeam: "S1",
        bracket: "winners",
        nextMatchNum: 2,
        nextLoserMatchNum: 6,
        useSecondCourt: false
    },
    {
        matchNum: 2,
        week: 1,
        time: "7:50",
        homeSeed: "S1",
        awaySeed: "W1",
        workTeam: "L1",
        bracket: "winners",
        nextMatchNum: 7,
        nextLoserMatchNum: 5,
        useSecondCourt: false
    },
    {
        matchNum: 3,
        week: 1,
        time: "8:40",
        homeSeed: "S3",
        awaySeed: "S6",
        workTeam: "S2",
        bracket: "winners",
        nextMatchNum: 4,
        nextLoserMatchNum: 5,
        useSecondCourt: false
    },
    {
        matchNum: 4,
        week: 1,
        time: "9:30",
        homeSeed: "S2",
        awaySeed: "W3",
        workTeam: "L3",
        bracket: "winners",
        nextMatchNum: 7,
        nextLoserMatchNum: 6,
        useSecondCourt: false
    },
    // Week 2
    {
        matchNum: 5,
        week: 2,
        time: "8:40",
        homeSeed: "L2",
        awaySeed: "L3",
        workTeam: "W2",
        bracket: "losers",
        nextMatchNum: 8,
        nextLoserMatchNum: null,
        useSecondCourt: false
    },
    {
        matchNum: 6,
        week: 2,
        time: "8:40",
        homeSeed: "L1",
        awaySeed: "L4",
        workTeam: "W4",
        bracket: "losers",
        nextMatchNum: 8,
        nextLoserMatchNum: null,
        useSecondCourt: true
    },
    {
        matchNum: 7,
        week: 2,
        time: "9:30",
        homeSeed: "W2",
        awaySeed: "W4",
        workTeam: "L5",
        bracket: "winners",
        nextMatchNum: 10,
        nextLoserMatchNum: 9,
        useSecondCourt: false
    },
    {
        matchNum: 8,
        week: 2,
        time: "9:30",
        homeSeed: "W5",
        awaySeed: "W6",
        workTeam: "L6",
        bracket: "losers",
        nextMatchNum: 9,
        nextLoserMatchNum: null,
        useSecondCourt: true
    },
    // Week 3
    {
        matchNum: 9,
        week: 3,
        time: "7:00",
        homeSeed: "L7",
        awaySeed: "W8",
        workTeam: "W7",
        bracket: "losers",
        nextMatchNum: 10,
        nextLoserMatchNum: null,
        useSecondCourt: false
    },
    {
        matchNum: 10,
        week: 3,
        time: "7:50",
        homeSeed: "W7",
        awaySeed: "W9",
        workTeam: "L9",
        bracket: "championship",
        nextMatchNum: 11,
        nextLoserMatchNum: 11,
        useSecondCourt: false
    },
    {
        matchNum: 11,
        week: 3,
        time: "8:40",
        homeSeed: "W10",
        awaySeed: "L10",
        workTeam: "L9",
        bracket: "championship",
        nextMatchNum: null,
        nextLoserMatchNum: null,
        useSecondCourt: false
    }
]

// 4-team playoff bracket: double-elimination, 6 scheduled matches + optional 7th
export const FOUR_TEAM_PLAYOFF: PlayoffMatchTemplate[] = [
    // Week 1
    {
        matchNum: 1,
        week: 1,
        time: "7:00",
        homeSeed: "S1",
        awaySeed: "S4",
        workTeam: "S3",
        bracket: "winners",
        nextMatchNum: 3,
        nextLoserMatchNum: 4,
        useSecondCourt: false
    },
    {
        matchNum: 2,
        week: 1,
        time: "7:50",
        homeSeed: "S2",
        awaySeed: "S3",
        workTeam: "S4",
        bracket: "winners",
        nextMatchNum: 3,
        nextLoserMatchNum: 4,
        useSecondCourt: false
    },
    // Week 2
    {
        matchNum: 3,
        week: 2,
        time: "7:00",
        homeSeed: "W1",
        awaySeed: "W2",
        workTeam: "L1",
        bracket: "winners",
        nextMatchNum: 6,
        nextLoserMatchNum: 5,
        useSecondCourt: false
    },
    {
        matchNum: 4,
        week: 2,
        time: "7:50",
        homeSeed: "L1",
        awaySeed: "L2",
        workTeam: "L3",
        bracket: "losers",
        nextMatchNum: 5,
        nextLoserMatchNum: null,
        useSecondCourt: false
    },
    // Week 3
    {
        matchNum: 5,
        week: 3,
        time: "7:00",
        homeSeed: "L3",
        awaySeed: "W4",
        workTeam: "W3",
        bracket: "losers",
        nextMatchNum: 6,
        nextLoserMatchNum: null,
        useSecondCourt: false
    },
    {
        matchNum: 6,
        week: 3,
        time: "7:50",
        homeSeed: "W3",
        awaySeed: "W5",
        workTeam: "L5",
        bracket: "championship",
        nextMatchNum: 7,
        nextLoserMatchNum: 7,
        useSecondCourt: false
    },
    {
        matchNum: 7,
        week: 3,
        time: "8:40",
        homeSeed: "W6",
        awaySeed: "L6",
        workTeam: "L5",
        bracket: "championship",
        nextMatchNum: null,
        nextLoserMatchNum: null,
        useSecondCourt: false
    }
]

export const REGULAR_SEASON_WEEKS = 6
export const PLAYOFF_WEEKS = 3
