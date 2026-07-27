import {
    isMatchEmpty,
    type MatchFormState,
    parseIntOrNull
} from "./match-form-state"
import type { ResolvedMatchInfo } from "./match-resolution"

export interface ValidationWarning {
    matchId: number
    messages: string[]
}

export function validateMatch(
    form: MatchFormState,
    resolved: ResolvedMatchInfo
): string[] {
    if (isMatchEmpty(form)) return []

    const errors: string[] = []

    const homeGamesWon = parseIntOrNull(form.homeScore)
    const awayGamesWon = parseIntOrNull(form.awayScore)
    const set1Home = parseIntOrNull(form.homeSet1Score)
    const set1Away = parseIntOrNull(form.awaySet1Score)
    const set2Home = parseIntOrNull(form.homeSet2Score)
    const set2Away = parseIntOrNull(form.awaySet2Score)
    const set3Home = parseIntOrNull(form.homeSet3Score)
    const set3Away = parseIntOrNull(form.awaySet3Score)

    // Completeness checks
    if (form.winner === null) errors.push("Overall Winner must be selected")
    if (homeGamesWon === null) errors.push("Home Total Games Won is required")
    if (awayGamesWon === null) errors.push("Away Total Games Won is required")
    if (set1Home === null) errors.push("Game 1 Score (Home) is required")
    if (set1Away === null) errors.push("Game 1 Score (Away) is required")
    if (set2Home === null) errors.push("Game 2 Score (Home) is required")
    if (set2Away === null) errors.push("Game 2 Score (Away) is required")

    // Game 3 is required when total games played = 3
    const totalGames = (homeGamesWon ?? 0) + (awayGamesWon ?? 0)
    if (homeGamesWon !== null && awayGamesWon !== null && totalGames === 3) {
        if (set3Home === null)
            errors.push("Game 3 Score (Home) is required when total games is 3")
        if (set3Away === null)
            errors.push("Game 3 Score (Away) is required when total games is 3")
    }

    // Stop here if any fields are missing — logic checks need complete data
    if (errors.length > 0) return errors

    // Logic alignment checks (all fields guaranteed non-null at this point)
    const sets: { home: number; away: number }[] = [
        { home: set1Home!, away: set1Away! },
        { home: set2Home!, away: set2Away! }
    ]
    if (set3Home !== null && set3Away !== null) {
        sets.push({ home: set3Home, away: set3Away })
    }

    let impliedHomeWins = 0
    let impliedAwayWins = 0
    for (const set of sets) {
        if (set.home > set.away) impliedHomeWins++
        else if (set.away > set.home) impliedAwayWins++
    }

    if (homeGamesWon !== impliedHomeWins) {
        errors.push(
            `Home Total Games Won is ${homeGamesWon} but game scores show ${impliedHomeWins}`
        )
    }
    if (awayGamesWon !== impliedAwayWins) {
        errors.push(
            `Away Total Games Won is ${awayGamesWon} but game scores show ${impliedAwayWins}`
        )
    }

    if (form.winner !== null) {
        const winnerIsHome = form.winner === resolved.homeTeamId
        const winnerIsAway = form.winner === resolved.awayTeamId
        if (winnerIsHome && impliedAwayWins > impliedHomeWins) {
            errors.push(
                `${resolved.homeTeamName} is selected as winner but Away won more games from scores`
            )
        }
        if (winnerIsAway && impliedHomeWins > impliedAwayWins) {
            errors.push(
                `${resolved.awayTeamName} is selected as winner but Home won more games from scores`
            )
        }
        if (winnerIsHome && awayGamesWon! > homeGamesWon!) {
            errors.push(
                `${resolved.homeTeamName} is selected as winner but Away Total Games Won is higher`
            )
        }
        if (winnerIsAway && homeGamesWon! > awayGamesWon!) {
            errors.push(
                `${resolved.awayTeamName} is selected as winner but Home Total Games Won is higher`
            )
        }
    }

    return errors
}

export function isSupportedImageFile(file: File): boolean {
    return file.type.startsWith("image/")
}
