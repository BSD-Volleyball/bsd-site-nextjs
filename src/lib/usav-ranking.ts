import { getSetScores } from "@/lib/team-ranking"

/**
 * USA Volleyball pool-finish tie-break logic.
 *
 * Implements "Procedures for Breaking Ties to Determine Pool Finish"
 * (USAV Girls National Championship Manual):
 * https://usavolleyball.org/wp-content/uploads/2021/11/Tie-Breaker-Flow-Chart-NEW-FINAL.pdf
 *
 * Ranking is by match record first. Teams tied in match record are resolved by a
 * recursive tie-break: head-to-head, then set percentage, then point percentage.
 * A group that reduces to exactly two teams is ALWAYS decided head-to-head. A
 * group of three or more is resolved head-to-head only by peeling off a team that
 * beat all others in the tie (to the top) or lost to all others (to the bottom);
 * the still-tied middle drops to set percentage, then point percentage.
 *
 * Pure and DB-free so it can be unit-tested and reused by both pool standings and
 * whole-division "end tournament early" standings.
 */

export interface UsavTeam {
    id: number
    name: string
}

export interface UsavMatch {
    home_team_id: number | null
    away_team_id: number | null
    winner_team_id: number | null
    home_set1_score: number | null
    away_set1_score: number | null
    home_set2_score: number | null
    away_set2_score: number | null
    home_set3_score: number | null
    away_set3_score: number | null
}

export interface UsavTally {
    teamId: number
    name: string
    matchWins: number
    matchLosses: number
    setsWon: number
    setsLost: number
    setPct: number
    pointsFor: number
    pointsAgainst: number
    pointPct: number
}

export interface RankedTeam extends UsavTally {
    rank: number
}

/**
 * A match counts once both of the first two sets have scores on both sides
 * (2-of-3 sets played). Mirrors the existing tournament standings convention.
 */
export function matchHasFinalScore(m: UsavMatch): boolean {
    return (
        m.home_set1_score !== null &&
        m.away_set1_score !== null &&
        m.home_set2_score !== null &&
        m.away_set2_score !== null
    )
}

/** Total points across all played sets, per side. */
export function pointTotals(m: UsavMatch): { home: number; away: number } {
    const cols: Array<[number | null, number | null]> = [
        [m.home_set1_score, m.away_set1_score],
        [m.home_set2_score, m.away_set2_score],
        [m.home_set3_score, m.away_set3_score]
    ]
    let home = 0
    let away = 0
    for (const [h, a] of cols) {
        if (h !== null) home += h
        if (a !== null) away += a
    }
    return { home, away }
}

/**
 * Compare two ratios n/d exactly (avoiding float noise) via cross-multiplication.
 * A ratio with a zero denominator is treated as 0 (no games played).
 * Returns 1 if the first is larger, -1 if smaller, 0 if equal.
 */
function compareRatio(n1: number, d1: number, n2: number, d2: number): number {
    if (d1 === 0 && d2 === 0) return 0
    if (d1 === 0) return n2 > 0 ? -1 : 0
    if (d2 === 0) return n1 > 0 ? 1 : 0
    const lhs = n1 * d2
    const rhs = n2 * d1
    if (lhs > rhs) return 1
    if (lhs < rhs) return -1
    return 0
}

function pct(num: number, den: number): number {
    return den > 0 ? num / den : 0
}

export function computeUsavTallies(
    teams: UsavTeam[],
    matches: UsavMatch[]
): Map<number, UsavTally> {
    const tallies = new Map<number, UsavTally>()
    for (const t of teams) {
        tallies.set(t.id, {
            teamId: t.id,
            name: t.name,
            matchWins: 0,
            matchLosses: 0,
            setsWon: 0,
            setsLost: 0,
            setPct: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            pointPct: 0
        })
    }

    for (const m of matches) {
        if (!matchHasFinalScore(m)) continue
        if (m.home_team_id === null || m.away_team_id === null) continue
        // Each side is tallied independently so a team's record still counts a
        // match against an opponent that is not in `teams` (e.g. when ranking a
        // subset of a division against their full records).
        const home = tallies.get(m.home_team_id)
        const away = tallies.get(m.away_team_id)
        if (!home && !away) continue

        const totals = pointTotals(m)
        const sets = getSetScores(m)

        if (home) {
            home.pointsFor += totals.home
            home.pointsAgainst += totals.away
            for (const s of sets) {
                if (s.home > s.away) home.setsWon++
                else if (s.away > s.home) home.setsLost++
            }
            if (m.winner_team_id === m.home_team_id) home.matchWins++
            else if (m.winner_team_id === m.away_team_id) home.matchLosses++
        }

        if (away) {
            away.pointsFor += totals.away
            away.pointsAgainst += totals.home
            for (const s of sets) {
                if (s.away > s.home) away.setsWon++
                else if (s.home > s.away) away.setsLost++
            }
            if (m.winner_team_id === m.away_team_id) away.matchWins++
            else if (m.winner_team_id === m.home_team_id) away.matchLosses++
        }
    }

    for (const t of tallies.values()) {
        t.setPct = pct(t.setsWon, t.setsWon + t.setsLost)
        t.pointPct = pct(t.pointsFor, t.pointsFor + t.pointsAgainst)
    }

    return tallies
}

/**
 * Head-to-head match result between two teams over the given matches.
 * Returns 1 if team A won more of their mutual matches, -1 if team B did,
 * 0 if they split or never played.
 */
function headToHead(matches: UsavMatch[], aId: number, bId: number): number {
    let aWins = 0
    let bWins = 0
    for (const m of matches) {
        if (!matchHasFinalScore(m)) continue
        const involvesBoth =
            (m.home_team_id === aId && m.away_team_id === bId) ||
            (m.home_team_id === bId && m.away_team_id === aId)
        if (!involvesBoth) continue
        if (m.winner_team_id === aId) aWins++
        else if (m.winner_team_id === bId) bWins++
    }
    return Math.sign(aWins - bWins)
}

type Level = "h2h" | "set" | "point"

/** Resolve a group of teams already tied in match record. */
function resolveTied(
    group: UsavTally[],
    level: Level,
    matches: UsavMatch[]
): UsavTally[] {
    if (group.length <= 1) return [...group]
    if (group.length === 2) return resolvePair(group[0], group[1], matches)

    switch (level) {
        case "h2h":
            return resolveByHeadToHead(group, matches)
        case "set":
            return partition(
                group,
                (a, b) =>
                    compareRatio(
                        a.setsWon,
                        a.setsWon + a.setsLost,
                        b.setsWon,
                        b.setsWon + b.setsLost
                    ),
                "point",
                matches
            )
        case "point":
            return partition(
                group,
                (a, b) =>
                    compareRatio(
                        a.pointsFor,
                        a.pointsFor + a.pointsAgainst,
                        b.pointsFor,
                        b.pointsFor + b.pointsAgainst
                    ),
                null,
                matches
            )
    }
}

/**
 * Two teams tied in match record are always decided head-to-head. If they split
 * or never played, fall through to set percentage, point percentage, then name
 * (a deterministic stand-in for the real-life tie-breaker set).
 */
function resolvePair(
    a: UsavTally,
    b: UsavTally,
    matches: UsavMatch[]
): UsavTally[] {
    const h = headToHead(matches, a.teamId, b.teamId)
    if (h !== 0) return h > 0 ? [a, b] : [b, a]

    const bySet = compareRatio(
        a.setsWon,
        a.setsWon + a.setsLost,
        b.setsWon,
        b.setsWon + b.setsLost
    )
    if (bySet !== 0) return bySet > 0 ? [a, b] : [b, a]

    const byPoint = compareRatio(
        a.pointsFor,
        a.pointsFor + a.pointsAgainst,
        b.pointsFor,
        b.pointsFor + b.pointsAgainst
    )
    if (byPoint !== 0) return byPoint > 0 ? [a, b] : [b, a]

    return a.name.localeCompare(b.name) <= 0 ? [a, b] : [b, a]
}

/**
 * Three-or-more-team tie: peel a team that beat all others in the tie to the top
 * and a team that lost to all others to the bottom; the still-tied middle drops
 * to set percentage. (At most one team can beat all, and at most one can lose to
 * all.) A pure cycle leaves everyone in the middle and falls straight to set %.
 */
function resolveByHeadToHead(
    group: UsavTally[],
    matches: UsavMatch[]
): UsavTally[] {
    const top: UsavTally[] = []
    const bottom: UsavTally[] = []
    const middle: UsavTally[] = []

    for (const t of group) {
        const results = group
            .filter((o) => o.teamId !== t.teamId)
            .map((o) => headToHead(matches, t.teamId, o.teamId))
        if (results.every((r) => r > 0)) top.push(t)
        else if (results.every((r) => r < 0)) bottom.push(t)
        else middle.push(t)
    }

    return [...top, ...resolveTied(middle, "set", matches), ...bottom]
}

/**
 * Sort a tied group by a criterion, then recurse each equal-criterion subgroup at
 * the next level (or, at the final level, break remaining ties by name).
 */
function partition(
    group: UsavTally[],
    cmp: (a: UsavTally, b: UsavTally) => number,
    nextLevel: Level | null,
    matches: UsavMatch[]
): UsavTally[] {
    const sorted = [...group].sort((a, b) => cmp(b, a))
    const result: UsavTally[] = []
    let i = 0
    while (i < sorted.length) {
        let j = i + 1
        while (j < sorted.length && cmp(sorted[i], sorted[j]) === 0) j++
        const sub = sorted.slice(i, j)
        if (sub.length === 1) {
            result.push(sub[0])
        } else if (nextLevel) {
            result.push(...resolveTied(sub, nextLevel, matches))
        } else {
            // Final level: break any remaining ties deterministically by name.
            result.push(
                ...[...sub].sort((a, b) => a.name.localeCompare(b.name))
            )
        }
        i = j
    }
    return result
}

/**
 * Rank teams per the USAV tie-break flow chart. Teams are ordered by match record
 * first; teams tied in match record are resolved recursively (head-to-head → set
 * percentage → point percentage → name).
 */
export function usavRankTeams(
    teams: UsavTeam[],
    matches: UsavMatch[]
): RankedTeam[] {
    const tallyMap = computeUsavTallies(teams, matches)
    const all = [...tallyMap.values()]

    // Split by match wins (descending); equal-record teams form a tied group.
    const byWinsDesc = [...all].sort((a, b) => b.matchWins - a.matchWins)
    const ordered: UsavTally[] = []
    let i = 0
    while (i < byWinsDesc.length) {
        let j = i + 1
        while (
            j < byWinsDesc.length &&
            byWinsDesc[j].matchWins === byWinsDesc[i].matchWins
        ) {
            j++
        }
        ordered.push(...resolveTied(byWinsDesc.slice(i, j), "h2h", matches))
        i = j
    }

    return ordered.map((t, idx) => ({ ...t, rank: idx + 1 }))
}
