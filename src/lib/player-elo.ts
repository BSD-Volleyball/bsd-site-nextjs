import { getSetScores } from "@/lib/team-ranking"

/**
 * Player-carried ELO computed from team match results.
 *
 * Teams re-draft every season, so ratings attach to players: each match is a
 * contest between two rosters, team strength is the mean of the participants'
 * current ratings, and the rating delta is applied to every participant.
 *
 * Divisions only play within themselves, so newcomers are seeded from the
 * division of their first rated match. Lower `divisions.level` means a
 * stronger division, so the seed is ELO_BASE + (lowestLevel - level) * step:
 * the lowest division starts at ELO_BASE and AA seeds highest. After seeding,
 * ratings carry across divisions within a season — player movement between
 * divisions is what links the otherwise-isolated rating pools.
 *
 * At a player's first non-sub match of each new season the carried rating is
 * blended toward the seed of the division they return in: 90% carried / 10%
 * seed across contiguous seasons, shifting another 10% toward the seed per
 * fully missed season (measured by ordinal position among seasons that have
 * matches), so a nine-season gap reseeds entirely. Per-match sub appearances
 * never anchor — the carried rating enters unadjusted — but they count as
 * staying active for gap measurement. Permanent subs take over a drafted
 * roster slot, so they anchor like draftees.
 *
 * Total rating is only exactly conserved when both rosters are the same size
 * and no season boundary intervenes.
 */

export const ELO_BASE = 1000
export const ELO_DIVISION_STEP = 150
export const ELO_K_FACTOR = 32
/** divisions.level ascends as skill descends: 1 = AA (best), 6 = BB (lowest). */
export const ELO_LOWEST_DIVISION_LEVEL = 6
/** Weight kept on a player's carried rating at a contiguous season boundary. */
export const ELO_CARRYOVER_RETENTION = 0.9
/** Extra weight shifted to the division seed per fully missed season. */
export const ELO_CARRYOVER_GAP_DECAY = 0.1

export interface EloMatchInput {
    id: number
    seasonId: number
    week: number
    date: string | null
    playoff: boolean
    divisionLevel: number
    homeTeamId: number | null
    awayTeamId: number | null
    winner: number | null
    homeScore: number | null
    awayScore: number | null
    home_set1_score: number | null
    away_set1_score: number | null
    home_set2_score: number | null
    away_set2_score: number | null
    home_set3_score: number | null
    away_set3_score: number | null
}

export interface DraftRosterRow {
    draftId: number
    teamId: number
    userId: string
}

export interface PermanentSubRow {
    id: number
    originalDraft: number
    subUser: string
    effectiveAt: Date
}

export interface MatchSubRow {
    matchId: number
    teamId: number
    originalUser: string
    subUser: string
}

export interface EloOptions {
    base?: number
    divisionStep?: number
    kFactor?: number
    lowestDivisionLevel?: number
    carryoverRetention?: number
    carryoverGapDecay?: number
}

export interface EloHistoryPoint {
    matchId: number
    seasonId: number
    week: number
    date: string | null
    playoff: boolean
    ratingBefore: number
    ratingAfter: number
    delta: number
    actualScore: number
}

export interface PlayerEloResult {
    ratings: Map<string, number>
    histories: Map<string, EloHistoryPoint[]>
    matchCounts: Map<string, number>
}

export function rosterKey(matchId: number, teamId: number): string {
    return `${matchId}:${teamId}`
}

export function subAppearanceKey(matchId: number, userId: string): string {
    return `${matchId}:${userId}`
}

export function orderMatches(matches: EloMatchInput[]): EloMatchInput[] {
    return [...matches].sort((a, b) => {
        if (a.seasonId !== b.seasonId) return a.seasonId - b.seasonId
        if (a.week !== b.week) return a.week - b.week
        if (a.date !== b.date) {
            if (a.date === null) return 1
            if (b.date === null) return -1
            return a.date < b.date ? -1 : 1
        }
        return a.id - b.id
    })
}

export function expectedScore(ratingA: number, ratingB: number): number {
    return 1 / (1 + 10 ** ((ratingB - ratingA) / 400))
}

/**
 * Home side's result as a fraction of sets won (1, 0.67, 0.5, 0.33, 0).
 * Falls back to legacy match-level game counts, then to the winner flag.
 * Returns null when the match carries no usable result.
 */
export function actualScore(match: EloMatchInput): number | null {
    let homeSets = 0
    let awaySets = 0
    for (const set of getSetScores(match)) {
        if (set.home > set.away) homeSets++
        else if (set.away > set.home) awaySets++
    }
    if (homeSets + awaySets > 0) return homeSets / (homeSets + awaySets)

    const home = match.homeScore ?? 0
    const away = match.awayScore ?? 0
    if (home + away > 0) return home / (home + away)

    if (match.winner !== null) {
        if (match.winner === match.homeTeamId) return 1
        if (match.winner === match.awayTeamId) return 0
    }
    return null
}

/**
 * Derive who actually played each match: drafted roster, with permanent sub
 * chains applied up to the match date (end of day, so same-day subs count),
 * then per-match subs swapped in for that match only.
 */
export function buildMatchRosters(
    matches: EloMatchInput[],
    draftRows: DraftRosterRow[],
    permanentSubs: PermanentSubRow[],
    matchSubs: MatchSubRow[]
): Map<string, string[]> {
    const slotsByTeam = new Map<number, DraftRosterRow[]>()
    for (const row of draftRows) {
        const slots = slotsByTeam.get(row.teamId) ?? []
        slots.push(row)
        slotsByTeam.set(row.teamId, slots)
    }

    const chainsByDraft = new Map<number, PermanentSubRow[]>()
    for (const sub of permanentSubs) {
        const chain = chainsByDraft.get(sub.originalDraft) ?? []
        chain.push(sub)
        chainsByDraft.set(sub.originalDraft, chain)
    }
    for (const chain of chainsByDraft.values()) {
        chain.sort(
            (a, b) =>
                a.effectiveAt.getTime() - b.effectiveAt.getTime() || a.id - b.id
        )
    }

    const matchSubsByKey = new Map<string, MatchSubRow[]>()
    for (const sub of matchSubs) {
        const key = rosterKey(sub.matchId, sub.teamId)
        const subs = matchSubsByKey.get(key) ?? []
        subs.push(sub)
        matchSubsByKey.set(key, subs)
    }

    const result = new Map<string, string[]>()
    for (const match of matches) {
        const cutoff = match.date
            ? new Date(`${match.date}T23:59:59.999Z`).getTime()
            : null
        for (const teamId of [match.homeTeamId, match.awayTeamId]) {
            if (teamId === null) continue
            const slots = slotsByTeam.get(teamId)
            if (!slots) continue

            const active = new Set<string>()
            for (const slot of slots) {
                let player = slot.userId
                const chain = chainsByDraft.get(slot.draftId)
                if (chain) {
                    for (const link of chain) {
                        if (
                            cutoff === null ||
                            link.effectiveAt.getTime() <= cutoff
                        ) {
                            player = link.subUser
                        }
                    }
                }
                active.add(player)
            }

            const key = rosterKey(match.id, teamId)
            for (const sub of matchSubsByKey.get(key) ?? []) {
                active.delete(sub.originalUser)
                active.add(sub.subUser)
            }
            result.set(key, [...active])
        }
    }
    return result
}

export function computePlayerElo(
    matches: EloMatchInput[],
    rosters: Map<string, string[]>,
    options: EloOptions = {},
    subAppearances: ReadonlySet<string> = new Set()
): PlayerEloResult {
    const base = options.base ?? ELO_BASE
    const divisionStep = options.divisionStep ?? ELO_DIVISION_STEP
    const kFactor = options.kFactor ?? ELO_K_FACTOR
    const lowestDivisionLevel =
        options.lowestDivisionLevel ?? ELO_LOWEST_DIVISION_LEVEL
    const carryoverRetention =
        options.carryoverRetention ?? ELO_CARRYOVER_RETENTION
    const carryoverGapDecay =
        options.carryoverGapDecay ?? ELO_CARRYOVER_GAP_DECAY

    // Season gaps are measured by ordinal position among the seasons present,
    // not seasonId arithmetic, so non-contiguous ids can't fake a gap.
    const ordered = orderMatches(matches)
    const seasonOrdinals = new Map<number, number>()
    for (const match of ordered) {
        if (!seasonOrdinals.has(match.seasonId)) {
            seasonOrdinals.set(match.seasonId, seasonOrdinals.size)
        }
    }

    const ratings = new Map<string, number>()
    const histories = new Map<string, EloHistoryPoint[]>()
    const matchCounts = new Map<string, number>()
    const lastPlayedOrdinal = new Map<string, number>()
    const anchoredOrdinal = new Map<string, number>()

    for (const match of ordered) {
        const score = actualScore(match)
        if (score === null) continue
        if (match.homeTeamId === null || match.awayTeamId === null) continue

        const homeRoster = rosters.get(rosterKey(match.id, match.homeTeamId))
        const awayRoster = rosters.get(rosterKey(match.id, match.awayTeamId))
        if (!homeRoster?.length || !awayRoster?.length) continue

        const seasonOrdinal = seasonOrdinals.get(match.seasonId) ?? 0
        const seed =
            base + (lowestDivisionLevel - match.divisionLevel) * divisionStep
        const ratingOf = (userId: string): number => {
            const existing = ratings.get(userId)
            if (existing === undefined) {
                const isSub = subAppearances.has(
                    subAppearanceKey(match.id, userId)
                )
                ratings.set(userId, seed)
                lastPlayedOrdinal.set(userId, seasonOrdinal)
                if (!isSub) anchoredOrdinal.set(userId, seasonOrdinal)
                return seed
            }
            if (
                anchoredOrdinal.get(userId) === seasonOrdinal ||
                subAppearances.has(subAppearanceKey(match.id, userId))
            ) {
                lastPlayedOrdinal.set(userId, seasonOrdinal)
                return existing
            }
            const previous = lastPlayedOrdinal.get(userId) ?? seasonOrdinal
            const gap = Math.max(0, seasonOrdinal - previous - 1)
            const retention = Math.max(
                0,
                carryoverRetention - gap * carryoverGapDecay
            )
            const blended = retention * existing + (1 - retention) * seed
            ratings.set(userId, blended)
            lastPlayedOrdinal.set(userId, seasonOrdinal)
            anchoredOrdinal.set(userId, seasonOrdinal)
            return blended
        }

        const mean = (roster: string[]) =>
            roster.reduce((sum, id) => sum + ratingOf(id), 0) / roster.length
        const homeMean = mean(homeRoster)
        const awayMean = mean(awayRoster)
        const delta = kFactor * (score - expectedScore(homeMean, awayMean))

        const apply = (roster: string[], sign: 1 | -1) => {
            for (const userId of roster) {
                const before = ratingOf(userId)
                const after = before + sign * delta
                ratings.set(userId, after)
                matchCounts.set(userId, (matchCounts.get(userId) ?? 0) + 1)
                const history = histories.get(userId) ?? []
                history.push({
                    matchId: match.id,
                    seasonId: match.seasonId,
                    week: match.week,
                    date: match.date,
                    playoff: match.playoff,
                    ratingBefore: before,
                    ratingAfter: after,
                    delta: sign * delta,
                    actualScore: sign === 1 ? score : 1 - score
                })
                histories.set(userId, history)
            }
        }
        apply(homeRoster, 1)
        apply(awayRoster, -1)
    }

    return { ratings, histories, matchCounts }
}
