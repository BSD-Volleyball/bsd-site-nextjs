import type { MatchScoreData } from "./actions"

export interface MatchFormState {
    homeScore: string
    awayScore: string
    homeSet1Score: string
    awaySet1Score: string
    homeSet2Score: string
    awaySet2Score: string
    homeSet3Score: string
    awaySet3Score: string
    winner: number | null
}

export function initFormState(match: MatchScoreData): MatchFormState {
    return {
        homeScore: match.homeScore?.toString() ?? "",
        awayScore: match.awayScore?.toString() ?? "",
        homeSet1Score: match.homeSet1Score?.toString() ?? "",
        awaySet1Score: match.awaySet1Score?.toString() ?? "",
        homeSet2Score: match.homeSet2Score?.toString() ?? "",
        awaySet2Score: match.awaySet2Score?.toString() ?? "",
        homeSet3Score: match.homeSet3Score?.toString() ?? "",
        awaySet3Score: match.awaySet3Score?.toString() ?? "",
        winner: match.winner
    }
}

export function parseIntOrNull(value: string): number | null {
    const trimmed = value.trim()
    if (trimmed === "") return null
    const num = parseInt(trimmed, 10)
    return Number.isNaN(num) ? null : num
}

export function isMatchEmpty(form: MatchFormState): boolean {
    return (
        form.winner === null &&
        form.homeScore === "" &&
        form.awayScore === "" &&
        form.homeSet1Score === "" &&
        form.awaySet1Score === "" &&
        form.homeSet2Score === "" &&
        form.awaySet2Score === "" &&
        form.homeSet3Score === "" &&
        form.awaySet3Score === ""
    )
}
