/**
 * Shared, DB-free shaping for a tournament's read-only schedule: round-robin pools
 * plus the playoff bracket, grouped per division. Consumed by the live
 * tournament-schedule-view (active tournament) and by the historical results view
 * (any tournament by id).
 */

export interface ScheduleTeam {
    id: number
    name: string
}

export interface ScheduleMatch {
    id: number
    court: number | null
    startTime: string | null
    home: ScheduleTeam | null
    away: ScheduleTeam | null
    workTeamName: string | null
    sets: { home: (number | null)[]; away: (number | null)[] }
    winnerTeamId: number | null
    played: boolean
}

export interface SchedulePool {
    id: number
    name: string
    matches: ScheduleMatch[]
}

export interface ScheduleBracketGroup {
    // 'winners' | 'losers' | 'final'
    bracket: string
    round: number
    matches: ScheduleMatch[]
}

export interface ScheduleDivision {
    id: number
    name: string
    pools: SchedulePool[]
    bracketGroups: ScheduleBracketGroup[]
}

export interface TournamentScheduleView {
    tournamentName: string
    eliminationFormat: "single" | "double"
    myTeamId: number | null
    divisions: ScheduleDivision[]
    hasPoolMatches: boolean
    hasBracketMatches: boolean
}

/** Raw match row fields needed to build a schedule view. */
export interface ScheduleSourceMatch {
    id: number
    division_id: number
    pool_id: number | null
    bracket: string
    bracket_round: number | null
    court: number | null
    start_time: string | null
    home_team_id: number | null
    away_team_id: number | null
    work_team_id: number | null
    home_set1_score: number | null
    home_set2_score: number | null
    home_set3_score: number | null
    away_set1_score: number | null
    away_set2_score: number | null
    away_set3_score: number | null
    winner_team_id: number | null
}

export interface ScheduleSourceDivision {
    id: number
    divisionName: string
    sortOrder: number
}

export interface BuildScheduleViewInput {
    tournamentName: string
    eliminationFormat: "single" | "double"
    myTeamId: number | null
    divisions: ScheduleSourceDivision[]
    matches: ScheduleSourceMatch[]
    teams: ScheduleTeam[]
    pools: Array<{ id: number; name: string }>
}

const BRACKET_ORDER: Record<string, number> = {
    winners: 0,
    losers: 1,
    final: 2
}

export function buildTournamentScheduleView(
    input: BuildScheduleViewInput
): TournamentScheduleView {
    const { matches, teams, pools } = input
    const teamName = new Map(teams.map((t) => [t.id, t.name]))

    const toTeam = (id: number | null): ScheduleTeam | null =>
        id !== null ? { id, name: teamName.get(id) ?? `Team ${id}` } : null

    const toMatch = (m: ScheduleSourceMatch): ScheduleMatch => {
        const sets = {
            home: [m.home_set1_score, m.home_set2_score, m.home_set3_score],
            away: [m.away_set1_score, m.away_set2_score, m.away_set3_score]
        }
        const played =
            m.winner_team_id !== null ||
            sets.home.some((s) => s !== null) ||
            sets.away.some((s) => s !== null)
        return {
            id: m.id,
            court: m.court,
            startTime: m.start_time,
            home: toTeam(m.home_team_id),
            away: toTeam(m.away_team_id),
            workTeamName:
                m.work_team_id !== null
                    ? (teamName.get(m.work_team_id) ?? null)
                    : null,
            sets,
            winnerTeamId: m.winner_team_id,
            played
        }
    }

    // Match play order: earliest start time first, then court. Null times
    // (unscheduled) sort last so a partially-scheduled pool still reads.
    const byStartThenCourt = (a: ScheduleMatch, b: ScheduleMatch) => {
        const at = a.startTime ?? "99:99:99"
        const bt = b.startTime ?? "99:99:99"
        if (at !== bt) return at < bt ? -1 : 1
        return (
            (a.court ?? Number.MAX_SAFE_INTEGER) -
            (b.court ?? Number.MAX_SAFE_INTEGER)
        )
    }

    const poolMap = new Map(pools.map((p) => [p.id, p]))
    let hasPoolMatches = false
    let hasBracketMatches = false

    const divisions: ScheduleDivision[] = input.divisions
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((div) => {
            const divMatches = matches.filter((m) => m.division_id === div.id)

            // Round-robin pools
            const poolBuckets = new Map<number, ScheduleMatch[]>()
            for (const m of divMatches) {
                if (m.bracket !== "pool" || m.pool_id === null) continue
                const arr = poolBuckets.get(m.pool_id) ?? []
                arr.push(toMatch(m))
                poolBuckets.set(m.pool_id, arr)
            }
            const divPools: SchedulePool[] = [...poolBuckets.entries()]
                .map(([poolId, ms]) => ({
                    id: poolId,
                    name: poolMap.get(poolId)?.name ?? `Pool ${poolId}`,
                    matches: ms.sort(byStartThenCourt)
                }))
                .sort((a, b) => a.name.localeCompare(b.name))
            if (divPools.length > 0) hasPoolMatches = true

            // Playoff bracket, grouped by bracket then round
            const bracketBuckets = new Map<string, ScheduleMatch[]>()
            for (const m of divMatches) {
                if (m.bracket === "pool") continue
                const key = `${m.bracket}::${m.bracket_round ?? 0}`
                const arr = bracketBuckets.get(key) ?? []
                arr.push(toMatch(m))
                bracketBuckets.set(key, arr)
            }
            const divBracketGroups: ScheduleBracketGroup[] = [
                ...bracketBuckets.entries()
            ]
                .map(([key, ms]) => {
                    const [bracket, round] = key.split("::")
                    return {
                        bracket,
                        round: Number(round),
                        matches: ms.sort(byStartThenCourt)
                    }
                })
                .sort(
                    (a, b) =>
                        (BRACKET_ORDER[a.bracket] ?? 9) -
                            (BRACKET_ORDER[b.bracket] ?? 9) || a.round - b.round
                )
            if (divBracketGroups.length > 0) hasBracketMatches = true

            return {
                id: div.id,
                name: div.divisionName,
                pools: divPools,
                bracketGroups: divBracketGroups
            }
        })
        .filter((d) => d.pools.length > 0 || d.bracketGroups.length > 0)

    return {
        tournamentName: input.tournamentName,
        eliminationFormat: input.eliminationFormat,
        myTeamId: input.myTeamId,
        divisions,
        hasPoolMatches,
        hasBracketMatches
    }
}
