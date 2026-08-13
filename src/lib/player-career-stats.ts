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

/** A player's win/loss split for one season, playoffs kept separate. */
export interface SeasonRecord {
    regularWins: number
    regularLosses: number
    playoffWins: number
    playoffLosses: number
}

interface MatchOutcome {
    setsFor: number
    setsAgainst: number
    pointDiff: number
    /** null when the match has no result to attribute yet. */
    won: boolean | null
}

/**
 * Resolve one match from a player's point of view, or null when they weren't
 * on either roster. Set wins fall back to legacy match-level game counts when
 * per-set scores are missing — legacy counts carry no point information,
 * matching computeStandings semantics.
 */
function resolveMatchForPlayer(
    userId: string,
    match: EloMatchInput,
    rosters: Map<string, string[]>
): MatchOutcome | null {
    if (match.homeTeamId === null || match.awayTeamId === null) return null
    const onHome = rosters
        .get(rosterKey(match.id, match.homeTeamId))
        ?.includes(userId)
    const onAway = rosters
        .get(rosterKey(match.id, match.awayTeamId))
        ?.includes(userId)
    if (!onHome && !onAway) return null

    let setsFor = 0
    let setsAgainst = 0
    let pointDiff = 0
    const sets = getSetScores(match)
    if (sets.length > 0) {
        for (const set of sets) {
            const pointsFor = onHome ? set.home : set.away
            const pointsAgainst = onHome ? set.away : set.home
            pointDiff += pointsFor - pointsAgainst
            if (pointsFor > pointsAgainst) setsFor++
            else if (pointsAgainst > pointsFor) setsAgainst++
        }
    } else {
        setsFor = (onHome ? match.homeScore : match.awayScore) ?? 0
        setsAgainst = (onHome ? match.awayScore : match.homeScore) ?? 0
    }

    const playerTeam = onHome ? match.homeTeamId : match.awayTeamId
    let won: boolean | null = null
    if (match.winner !== null) {
        won = match.winner === playerTeam
    } else if (setsFor !== setsAgainst) {
        won = setsFor > setsAgainst
    }

    return { setsFor, setsAgainst, pointDiff, won }
}

/**
 * Aggregate a player's career record over every match whose derived roster
 * (see buildMatchRosters) includes them, on either side. Playoff results are
 * counted in the overall match record as well as the playoff split.
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
        const outcome = resolveMatchForPlayer(userId, match, rosters)
        if (!outcome) continue

        stats.pointDiff += outcome.pointDiff
        stats.setWins += outcome.setsFor
        stats.setLosses += outcome.setsAgainst

        if (outcome.won === null) continue
        if (outcome.won) {
            stats.matchWins++
            if (match.playoff) stats.playoffWins++
        } else {
            stats.matchLosses++
            if (match.playoff) stats.playoffLosses++
        }
    }

    return stats
}

/**
 * Match record per season, keyed by season id. Unlike computeCareerStats the
 * playoff results are held out of the regular-season counts, so the two read
 * as separate records.
 */
export function computeSeasonRecords(
    userId: string,
    matches: EloMatchInput[],
    rosters: Map<string, string[]>
): Map<number, SeasonRecord> {
    const bySeason = new Map<number, SeasonRecord>()

    for (const match of matches) {
        const outcome = resolveMatchForPlayer(userId, match, rosters)
        if (!outcome || outcome.won === null) continue

        let record = bySeason.get(match.seasonId)
        if (!record) {
            record = {
                regularWins: 0,
                regularLosses: 0,
                playoffWins: 0,
                playoffLosses: 0
            }
            bySeason.set(match.seasonId, record)
        }

        if (match.playoff) {
            if (outcome.won) record.playoffWins++
            else record.playoffLosses++
        } else {
            if (outcome.won) record.regularWins++
            else record.regularLosses++
        }
    }

    return bySeason
}
