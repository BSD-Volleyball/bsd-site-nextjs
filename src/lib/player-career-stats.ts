import { rosterKey, type EloMatchInput } from "@/lib/player-elo"
import { getSetScores } from "@/lib/team-ranking"

export interface CareerStats {
    matchWins: number
    matchLosses: number
    setWins: number
    setLosses: number
    playoffWins: number
    playoffLosses: number
    pointDiff: number
}

/**
 * Aggregate a player's career record over every match whose derived roster
 * (see buildMatchRosters) includes them, on either side. Set wins fall back
 * to legacy match-level game counts when per-set scores are missing — legacy
 * counts carry no point information, matching computeStandings semantics.
 */
export function computeCareerStats(
    userId: string,
    matches: EloMatchInput[],
    rosters: Map<string, string[]>
): CareerStats {
    const stats: CareerStats = {
        matchWins: 0,
        matchLosses: 0,
        setWins: 0,
        setLosses: 0,
        playoffWins: 0,
        playoffLosses: 0,
        pointDiff: 0
    }

    for (const match of matches) {
        if (match.homeTeamId === null || match.awayTeamId === null) continue
        const onHome = rosters
            .get(rosterKey(match.id, match.homeTeamId))
            ?.includes(userId)
        const onAway = rosters
            .get(rosterKey(match.id, match.awayTeamId))
            ?.includes(userId)
        if (!onHome && !onAway) continue

        let setsFor = 0
        let setsAgainst = 0
        const sets = getSetScores(match)
        if (sets.length > 0) {
            for (const set of sets) {
                const pointsFor = onHome ? set.home : set.away
                const pointsAgainst = onHome ? set.away : set.home
                stats.pointDiff += pointsFor - pointsAgainst
                if (pointsFor > pointsAgainst) setsFor++
                else if (pointsAgainst > pointsFor) setsAgainst++
            }
        } else {
            setsFor = (onHome ? match.homeScore : match.awayScore) ?? 0
            setsAgainst = (onHome ? match.awayScore : match.homeScore) ?? 0
        }
        stats.setWins += setsFor
        stats.setLosses += setsAgainst

        const playerTeam = onHome ? match.homeTeamId : match.awayTeamId
        let won: boolean | null = null
        if (match.winner !== null) {
            won = match.winner === playerTeam
        } else if (setsFor !== setsAgainst) {
            won = setsFor > setsAgainst
        }
        if (won === null) continue

        if (won) {
            stats.matchWins++
            if (match.playoff) stats.playoffWins++
        } else {
            stats.matchLosses++
            if (match.playoff) stats.playoffLosses++
        }
    }

    return stats
}
