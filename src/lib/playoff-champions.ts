import { and, eq } from "drizzle-orm"
import { db } from "@/database/db"
import {
    divisions,
    matches,
    playoffMatchesMeta,
    teams
} from "@/database/schema"
import { isWinnerLoserReset, parseSourceToken } from "@/lib/playoff-sources"

export interface DivisionChampion {
    divisionId: number
    divisionName: string
    teamId: number | null
}

type Section = "winners" | "losers" | "championship" | null

interface ChampionCandidate {
    matchNum: number | null
    section: Section
    winner: number | null
    homeTeamId: number | null
    awayTeamId: number | null
    homeSet1: number | null
    awaySet1: number | null
    homeSet2: number | null
    awaySet2: number | null
    homeSet3: number | null
    awaySet3: number | null
}

function decideWinner(c: ChampionCandidate): number | null {
    if (c.winner !== null) return c.winner
    if (c.homeTeamId === null || c.awayTeamId === null) return null

    const setPairs: Array<[number | null, number | null]> = [
        [c.homeSet1, c.awaySet1],
        [c.homeSet2, c.awaySet2],
        [c.homeSet3, c.awaySet3]
    ]

    let homeWins = 0
    let awayWins = 0
    for (const [hs, as_] of setPairs) {
        if (hs === null || as_ === null) continue
        if (hs > as_) homeWins++
        else if (as_ > hs) awayWins++
    }

    if (homeWins > awayWins) return c.homeTeamId
    if (awayWins > homeWins) return c.awayTeamId
    return null
}

export async function getDivisionChampions(
    seasonId: number
): Promise<DivisionChampion[]> {
    const divRows = await db
        .selectDistinct({
            id: divisions.id,
            name: divisions.name,
            level: divisions.level
        })
        .from(teams)
        .innerJoin(divisions, eq(teams.division, divisions.id))
        .where(eq(teams.season, seasonId))

    if (divRows.length === 0) return []

    divRows.sort((a, b) => a.level - b.level)

    const playoffRows = await db
        .select({
            division: matches.division,
            matchNum: playoffMatchesMeta.match_num,
            bracket: playoffMatchesMeta.bracket,
            homeSource: playoffMatchesMeta.home_source,
            awaySource: playoffMatchesMeta.away_source,
            homeTeam: matches.home_team,
            awayTeam: matches.away_team,
            winner: matches.winner,
            homeSet1: matches.home_set1_score,
            awaySet1: matches.away_set1_score,
            homeSet2: matches.home_set2_score,
            awaySet2: matches.away_set2_score,
            homeSet3: matches.home_set3_score,
            awaySet3: matches.away_set3_score
        })
        .from(matches)
        .innerJoin(
            playoffMatchesMeta,
            eq(playoffMatchesMeta.match_id, matches.id)
        )
        .where(and(eq(matches.season, seasonId), eq(matches.playoff, true)))

    const byDivision = new Map<number, ChampionCandidate[]>()
    for (const row of playoffRows) {
        const home = parseSourceToken(row.homeSource)
        const away = parseSourceToken(row.awaySource)
        const bracket = (row.bracket || "").toLowerCase()

        // Section priority mirrors the playoffs page logic: a winner/loser
        // reset always wins the "championship" classification, then explicit
        // bracket fields, then everything else falls through.
        let section: Section = null
        if (isWinnerLoserReset(home, away)) {
            section = "championship"
        } else if (bracket === "championship") {
            section = "championship"
        } else if (bracket === "winners") {
            section = "winners"
        } else if (bracket === "losers") {
            section = "losers"
        }

        const candidate: ChampionCandidate = {
            matchNum: row.matchNum,
            section,
            winner: row.winner,
            homeTeamId: row.homeTeam,
            awayTeamId: row.awayTeam,
            homeSet1: row.homeSet1,
            awaySet1: row.awaySet1,
            homeSet2: row.homeSet2,
            awaySet2: row.awaySet2,
            homeSet3: row.homeSet3,
            awaySet3: row.awaySet3
        }

        const arr = byDivision.get(row.division) ?? []
        arr.push(candidate)
        byDivision.set(row.division, arr)
    }

    return divRows.map((div) => {
        const all = byDivision.get(div.id) ?? []
        const championshipMatches = all.filter(
            (m) => m.section === "championship"
        )
        // Single-elim brackets have no explicit championship section — fall
        // back to the winners bracket and take its deepest match.
        const finalSection =
            championshipMatches.length > 0
                ? championshipMatches
                : all.filter((m) => m.section === "winners")

        // Highest match number wins as deepest. Bracket generators assign
        // match numbers monotonically, and any "if necessary" reset is the
        // last-numbered match by construction.
        const sorted = [...finalSection].sort((a, b) => {
            const an = a.matchNum ?? -1
            const bn = b.matchNum ?? -1
            return bn - an
        })

        const teamId =
            sorted.map(decideWinner).find((t): t is number => t !== null) ??
            null

        return {
            divisionId: div.id,
            divisionName: div.name,
            teamId
        }
    })
}
