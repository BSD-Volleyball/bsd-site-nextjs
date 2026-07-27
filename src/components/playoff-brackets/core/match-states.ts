export const MATCH_STATES = {
    PLAYED: "PLAYED",
    NO_SHOW: "NO_SHOW",
    WALK_OVER: "WALK_OVER",
    NO_PARTY: "NO_PARTY",
    DONE: "DONE",
    SCORE_DONE: "SCORE_DONE"
} as const

export type MatchState = (typeof MATCH_STATES)[keyof typeof MATCH_STATES]
