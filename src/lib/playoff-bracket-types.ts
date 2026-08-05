/**
 * Bracket rendering contract shared by season playoffs and tournament
 * playoffs. BracketView consumes { upper, lower } of BracketMatch — the
 * shape is dictated by the playoff-brackets library plus the extra fields
 * our custom match card reads.
 */

export interface BracketParticipant {
    id: string
    name: string
    resultText: string | null
    isWinner: boolean
    status: "PLAYED" | "NO_SHOW" | "WALK_OVER" | "NO_PARTY" | null
}

export interface BracketMatch {
    id: number
    name: string
    nextMatchId: number | null
    nextLooserMatchId: number | null
    tournamentRoundText: string
    startTime: string
    state: string
    participants: BracketParticipant[]
    matchNum: number
    week: number
    date: string | null
    time: string | null
    court: number | null
    scoresDisplay: string
    homeSourceLabel: string | null
    awaySourceLabel: string | null
    workTeamLabel: string | null
    homeTeamId: number | null
    awayTeamId: number | null
    workTeamId: number | null
    homeSourceRefMatch: number | null
    homeSourceRefIsWin: boolean | null
    awaySourceRefMatch: number | null
    awaySourceRefIsWin: boolean | null
    workSourceRefMatch: number | null
    workSourceRefIsWin: boolean | null
}
