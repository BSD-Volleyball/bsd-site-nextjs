// Result arithmetic for a single playoff match: who won, by how many games,
// and how the set scores read. Pure; shared by the playoffs page loader.
//
// Precedence, deliberately: the stored winner column beats everything, then
// the home/away game counts, then the individual set scores. A match with a
// side still unknown (not backfilled) never yields a computed winner.

export interface PlayoffMatchScores {
    homeTeamId: number | null
    awayTeamId: number | null
    homeScore: number | null
    awayScore: number | null
    homeSet1Score: number | null
    awaySet1Score: number | null
    homeSet2Score: number | null
    awaySet2Score: number | null
    homeSet3Score: number | null
    awaySet3Score: number | null
    winnerTeamId: number | null
}

export interface SetScore {
    home: number
    away: number
}

/** Sets where both sides have a score, in play order. */
export function getSetScores(match: PlayoffMatchScores): SetScore[] {
    const sets: SetScore[] = []

    if (match.homeSet1Score !== null && match.awaySet1Score !== null) {
        sets.push({
            home: match.homeSet1Score,
            away: match.awaySet1Score
        })
    }

    if (match.homeSet2Score !== null && match.awaySet2Score !== null) {
        sets.push({
            home: match.homeSet2Score,
            away: match.awaySet2Score
        })
    }

    if (match.homeSet3Score !== null && match.awaySet3Score !== null) {
        sets.push({
            home: match.homeSet3Score,
            away: match.awaySet3Score
        })
    }

    return sets
}

/**
 * Games won per side: the stored home/away scores when both are present,
 * otherwise counted from the set scores (a tied set counts for neither),
 * otherwise null.
 */
export function getGameWins(match: PlayoffMatchScores): {
    homeWins: number | null
    awayWins: number | null
} {
    if (match.homeScore !== null && match.awayScore !== null) {
        return {
            homeWins: match.homeScore,
            awayWins: match.awayScore
        }
    }

    const sets = getSetScores(match)
    if (sets.length === 0) {
        return {
            homeWins: null,
            awayWins: null
        }
    }

    let homeWins = 0
    let awayWins = 0
    for (const set of sets) {
        if (set.home > set.away) {
            homeWins++
        } else if (set.away > set.home) {
            awayWins++
        }
    }

    return {
        homeWins,
        awayWins
    }
}

export function getWinnerTeamId(match: PlayoffMatchScores): number | null {
    if (match.winnerTeamId !== null) {
        return match.winnerTeamId
    }

    if (match.homeTeamId === null || match.awayTeamId === null) {
        return null
    }

    const wins = getGameWins(match)
    if (wins.homeWins === null || wins.awayWins === null) {
        return null
    }

    if (wins.homeWins > wins.awayWins) {
        return match.homeTeamId
    }

    if (wins.awayWins > wins.homeWins) {
        return match.awayTeamId
    }

    return null
}

/** The other side, once a winner is known and both sides are set. */
export function getLoserTeamId(
    match: Pick<PlayoffMatchScores, "homeTeamId" | "awayTeamId">,
    winnerTeamId: number | null
): number | null {
    if (
        winnerTeamId === null ||
        match.homeTeamId === null ||
        match.awayTeamId === null
    ) {
        return null
    }

    return winnerTeamId === match.homeTeamId
        ? match.awayTeamId
        : match.homeTeamId
}

/**
 * Set scores as "25-20  25-18", written from the winner's side when the
 * winner is known (homeIsWinner false flips each pair), or "—" when no set
 * has been scored.
 */
export function formatSetScoreDisplay(
    match: PlayoffMatchScores,
    homeIsWinner: boolean | null
): string {
    const sets = getSetScores(match)
    if (sets.length === 0) {
        return "—"
    }

    return sets
        .map((set) => {
            if (homeIsWinner === true) {
                return `${set.home}-${set.away}`
            }

            if (homeIsWinner === false) {
                return `${set.away}-${set.home}`
            }

            return `${set.home}-${set.away}`
        })
        .join("  ")
}
