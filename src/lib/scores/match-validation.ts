/**
 * The rules a saved match result must satisfy, shared by the score forms in
 * the browser and by the save action on the server, so a result cannot reach
 * the database through one page that the other would have refused.
 */

export interface MatchScoreValues {
    homeScore: number | null
    awayScore: number | null
    homeSet1Score: number | null
    awaySet1Score: number | null
    homeSet2Score: number | null
    awaySet2Score: number | null
    homeSet3Score: number | null
    awaySet3Score: number | null
}

export interface MatchSides {
    homeTeamId: number | null
    awayTeamId: number | null
    homeTeamName: string
    awayTeamName: string
}

export function isScoreEmpty(
    values: MatchScoreValues,
    winner: number | null
): boolean {
    return (
        winner === null &&
        values.homeScore === null &&
        values.awayScore === null &&
        values.homeSet1Score === null &&
        values.awaySet1Score === null &&
        values.homeSet2Score === null &&
        values.awaySet2Score === null &&
        values.homeSet3Score === null &&
        values.awaySet3Score === null
    )
}

/** Every reason the result is incomplete or contradicts itself; empty when fine. */
export function validateMatchScores(
    values: MatchScoreValues,
    winner: number | null,
    sides: MatchSides
): string[] {
    if (isScoreEmpty(values, winner)) return []

    const errors: string[] = []
    const {
        homeScore: homeGamesWon,
        awayScore: awayGamesWon,
        homeSet1Score: set1Home,
        awaySet1Score: set1Away,
        homeSet2Score: set2Home,
        awaySet2Score: set2Away,
        homeSet3Score: set3Home,
        awaySet3Score: set3Away
    } = values

    // Completeness checks
    if (winner === null) errors.push("Overall Winner must be selected")
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

    if (winner !== null) {
        const winnerIsHome = winner === sides.homeTeamId
        const winnerIsAway = winner === sides.awayTeamId
        if (winnerIsHome && impliedAwayWins > impliedHomeWins) {
            errors.push(
                `${sides.homeTeamName} is selected as winner but Away won more games from scores`
            )
        }
        if (winnerIsAway && impliedHomeWins > impliedAwayWins) {
            errors.push(
                `${sides.awayTeamName} is selected as winner but Home won more games from scores`
            )
        }
        if (winnerIsHome && awayGamesWon! > homeGamesWon!) {
            errors.push(
                `${sides.homeTeamName} is selected as winner but Away Total Games Won is higher`
            )
        }
        if (winnerIsAway && homeGamesWon! > awayGamesWon!) {
            errors.push(
                `${sides.awayTeamName} is selected as winner but Home Total Games Won is higher`
            )
        }
    }

    return errors
}
