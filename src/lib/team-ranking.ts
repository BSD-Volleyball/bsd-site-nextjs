export interface RankableTeam {
    id: number
    number: number | null
    name: string
}

export interface RankableMatch {
    week: number
    homeTeamId: number | null
    awayTeamId: number | null
    homeScore: number | null
    awayScore: number | null
    home_set1_score: number | null
    away_set1_score: number | null
    home_set2_score: number | null
    away_set2_score: number | null
    home_set3_score: number | null
    away_set3_score: number | null
}

export interface StandingTeam {
    id: number
    number: number | null
    name: string
    wins: number
    losses: number
    pointDiff: number
    pointsFor: number
}

interface HeadToHeadStats {
    aWins: number
    bWins: number
    aPoints: number
    bPoints: number
}

export interface RankingOptions {
    excludeWeeks?: number[]
}

export function getSetScores(row: {
    home_set1_score: number | null
    away_set1_score: number | null
    home_set2_score: number | null
    away_set2_score: number | null
    home_set3_score: number | null
    away_set3_score: number | null
}): Array<{ home: number; away: number }> {
    const sets: Array<{ home: number; away: number }> = []
    if (row.home_set1_score !== null && row.away_set1_score !== null) {
        sets.push({ home: row.home_set1_score, away: row.away_set1_score })
    }
    if (row.home_set2_score !== null && row.away_set2_score !== null) {
        sets.push({ home: row.home_set2_score, away: row.away_set2_score })
    }
    if (row.home_set3_score !== null && row.away_set3_score !== null) {
        sets.push({ home: row.home_set3_score, away: row.away_set3_score })
    }
    return sets
}

function getHeadToHeadStats(
    divisionMatches: RankableMatch[],
    teamAId: number,
    teamBId: number,
    excludeWeeks?: Set<number>
): HeadToHeadStats {
    let aWins = 0
    let bWins = 0
    let aPoints = 0
    let bPoints = 0

    for (const match of divisionMatches) {
        if (excludeWeeks?.has(match.week)) continue

        const involvesBothTeams =
            (match.homeTeamId === teamAId && match.awayTeamId === teamBId) ||
            (match.homeTeamId === teamBId && match.awayTeamId === teamAId)

        if (!involvesBothTeams) continue

        const setScores = getSetScores(match)
        const aIsHome = match.homeTeamId === teamAId

        if (setScores.length > 0) {
            for (const set of setScores) {
                const aScore = aIsHome ? set.home : set.away
                const bScore = aIsHome ? set.away : set.home

                aPoints += aScore
                bPoints += bScore

                if (aScore > bScore) {
                    aWins++
                } else if (bScore > aScore) {
                    bWins++
                }
            }
        } else if (match.homeScore !== null && match.awayScore !== null) {
            const aGameWins = aIsHome ? match.homeScore : match.awayScore
            const bGameWins = aIsHome ? match.awayScore : match.homeScore
            aWins += aGameWins
            bWins += bGameWins
        }
    }

    return { aWins, bWins, aPoints, bPoints }
}

export function computeStandings(
    divisionTeams: RankableTeam[],
    divisionMatches: RankableMatch[],
    options?: RankingOptions
): StandingTeam[] {
    const excludeWeeks = options?.excludeWeeks
        ? new Set(options.excludeWeeks)
        : undefined

    const standingsByTeamId = new Map<number, StandingTeam>(
        divisionTeams.map((t) => [
            t.id,
            {
                id: t.id,
                number: t.number,
                name: t.name,
                wins: 0,
                losses: 0,
                pointDiff: 0,
                pointsFor: 0
            }
        ])
    )

    for (const match of divisionMatches) {
        if (excludeWeeks?.has(match.week)) continue
        if (match.homeTeamId === null || match.awayTeamId === null) continue

        const homeStanding = standingsByTeamId.get(match.homeTeamId)
        const awayStanding = standingsByTeamId.get(match.awayTeamId)
        if (!homeStanding || !awayStanding) continue

        const setScores = getSetScores(match)

        if (setScores.length > 0) {
            for (const set of setScores) {
                homeStanding.pointsFor += set.home
                awayStanding.pointsFor += set.away
                homeStanding.pointDiff += set.home - set.away
                awayStanding.pointDiff += set.away - set.home

                if (set.home > set.away) {
                    homeStanding.wins++
                    awayStanding.losses++
                } else if (set.away > set.home) {
                    awayStanding.wins++
                    homeStanding.losses++
                }
            }
        } else if (match.homeScore !== null && match.awayScore !== null) {
            homeStanding.wins += match.homeScore
            homeStanding.losses += match.awayScore
            awayStanding.wins += match.awayScore
            awayStanding.losses += match.homeScore
        }
    }

    return [...standingsByTeamId.values()].sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins

        const h2h = getHeadToHeadStats(
            divisionMatches,
            a.id,
            b.id,
            excludeWeeks
        )
        if (h2h.aWins !== h2h.bWins) return h2h.bWins - h2h.aWins
        if (h2h.aPoints !== h2h.bPoints) return h2h.bPoints - h2h.aPoints

        if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff
        if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor

        if ((a.number ?? 999) !== (b.number ?? 999)) {
            return (a.number ?? 999) - (b.number ?? 999)
        }
        return a.name.localeCompare(b.name)
    })
}

export function rankDivision(
    divisionTeams: RankableTeam[],
    divisionMatches: RankableMatch[],
    _teamCount: number
): StandingTeam[] {
    return computeStandings(divisionTeams, divisionMatches)
}
