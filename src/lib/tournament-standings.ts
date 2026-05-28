import "server-only"

import { db } from "@/database/db"
import {
    tournamentMatches,
    tournamentPoolTeams,
    tournamentTeams
} from "@/database/schema"
import { and, asc, eq } from "drizzle-orm"

export interface PoolStandingRow {
    teamId: number
    teamName: string
    wins: number
    losses: number
    pointsFor: number
    pointsAgainst: number
    pointDifferential: number
}

interface ScoreCells {
    home_set1_score: number | null
    home_set2_score: number | null
    home_set3_score: number | null
    away_set1_score: number | null
    away_set2_score: number | null
    away_set3_score: number | null
}

function matchHasFinalScore(m: ScoreCells): boolean {
    return (
        m.home_set1_score !== null &&
        m.away_set1_score !== null &&
        m.home_set2_score !== null &&
        m.away_set2_score !== null
    )
}

function pointTotals(m: ScoreCells): { home: number; away: number } {
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

export async function getPoolStandings(
    poolId: number
): Promise<PoolStandingRow[]> {
    const teams = await db
        .select({
            id: tournamentPoolTeams.team_id,
            name: tournamentTeams.name
        })
        .from(tournamentPoolTeams)
        .innerJoin(
            tournamentTeams,
            eq(tournamentTeams.id, tournamentPoolTeams.team_id)
        )
        .where(eq(tournamentPoolTeams.pool_id, poolId))
        .orderBy(asc(tournamentTeams.name))

    const matches = await db
        .select()
        .from(tournamentMatches)
        .where(eq(tournamentMatches.pool_id, poolId))

    const rows = new Map<number, PoolStandingRow>()
    for (const t of teams) {
        rows.set(t.id, {
            teamId: t.id,
            teamName: t.name,
            wins: 0,
            losses: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            pointDifferential: 0
        })
    }

    for (const m of matches) {
        if (!matchHasFinalScore(m)) continue
        if (m.home_team_id === null || m.away_team_id === null) continue
        const home = rows.get(m.home_team_id)
        const away = rows.get(m.away_team_id)
        if (!home || !away) continue
        const totals = pointTotals(m)
        home.pointsFor += totals.home
        home.pointsAgainst += totals.away
        away.pointsFor += totals.away
        away.pointsAgainst += totals.home
        if (m.winner_team_id === m.home_team_id) {
            home.wins++
            away.losses++
        } else if (m.winner_team_id === m.away_team_id) {
            away.wins++
            home.losses++
        }
    }

    for (const r of rows.values()) {
        r.pointDifferential = r.pointsFor - r.pointsAgainst
    }

    return [...rows.values()].sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins
        if (b.pointDifferential !== a.pointDifferential)
            return b.pointDifferential - a.pointDifferential
        return b.pointsFor - a.pointsFor
    })
}

void and
