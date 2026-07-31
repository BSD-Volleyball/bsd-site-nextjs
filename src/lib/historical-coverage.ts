import { sql } from "drizzle-orm"
import { db } from "@/database/db"
import { HISTORICAL_ROUND } from "@/lib/wayback/historical-pick"

/**
 * What historical data the database holds, season by season.
 *
 * Coverage is measured PER DIVISION rather than per season, because "the
 * season has some matches" hides the common case: a season where three of five
 * divisions imported and two did not. Every attribute is therefore a fraction,
 * and a season is only complete when every division it ran is covered.
 *
 * The denominator comes from `champions`, which is populated for all 68 played
 * seasons and so is the only complete record of which divisions each season
 * actually ran. Teams and matches are exactly the things that may be missing,
 * so they cannot define the denominator.
 *
 * REAL VS SYNTHETIC ROSTERS
 * Pre-2012 rosters were reconstructed from archived web pages, which recorded
 * who was on each team but never the draft order. Those players were given a
 * uniform synthetic pick -- round 4, first pick -- so a synthetic division is
 * one where every player shares one round and one `overall`. A real snake draft
 * cannot look like that: it varies position by team across rounds 1..N. The
 * test is structural rather than a season cutoff, which is what lets it report
 * Spring 2012 correctly as mixed -- AA, A and BBB were really drafted, while B
 * and BB were filled in from the archive.
 *
 * See src/lib/wayback/historical-pick.ts for the synthetic pick itself.
 */

export type CoverageStatus = "full" | "partial" | "none"

export interface SeasonCoverage {
    id: number
    code: string
    year: number
    season: string
    /** Divisions the season ran, per `champions`. 0 for a season not yet played. */
    divisions: number
    champions: CoverageStatus
    regularMatches: CoverageStatus
    playoffMatches: CoverageStatus
    rosters: CoverageStatus
    /** Whether roster divisions carry a real draft order. */
    realDraft: CoverageStatus
    counts: {
        championDivisions: number
        teams: number
        regular: number
        playoff: number
        regularDivisions: number
        playoffDivisions: number
        rosterDivisions: number
        realDivisions: number
        syntheticDivisions: number
        players: number
    }
}

export interface HistoricalCoverage {
    seasons: SeasonCoverage[]
    totals: {
        seasons: number
        withChampions: number
        withRegular: number
        withPlayoff: number
        withRosters: number
        withRealDraft: number
        withSynthetic: number
        champions: number
        regular: number
        playoff: number
        players: number
    }
}

// Index signature required by db.execute<T>'s Record<string, unknown> bound.
interface Raw {
    [key: string]: unknown
    id: number
    code: string
    year: number
    season: string
    champion_divisions: number
    champion_rows: number
    teams: number
    regular: number
    playoff: number
    regular_divisions: number
    playoff_divisions: number
    roster_divisions: number
    real_divisions: number
    synthetic_divisions: number
    players: number
}

/**
 * `covered` of `total` divisions -> full / partial / none.
 *
 * A season with no divisions on record (F26, scheduled but unplayed) reports
 * "none" rather than a misleading "full" from 0 of 0.
 */
function statusOf(covered: number, total: number): CoverageStatus {
    if (total === 0 || covered === 0) {
        return "none"
    }
    return covered >= total ? "full" : "partial"
}

export async function fetchHistoricalCoverage(): Promise<HistoricalCoverage> {
    const result = await db.execute<Raw>(sql`
        with roster_slice as (
            select t.season, t.division,
                   count(*)::int players,
                   (count(distinct dr.round) = 1
                    and count(distinct dr.overall) = 1
                    and min(dr.round) = ${HISTORICAL_ROUND}) as synthetic
            from drafts dr
            join teams t on t.id = dr.team
            group by 1, 2
        )
        select s.id, s.code, s.year, s.season,
            (select count(distinct ch.division)::int from champions ch
                where ch.season = s.id) champion_divisions,
            (select count(*)::int from champions ch
                where ch.season = s.id) champion_rows,
            (select count(*)::int from teams t where t.season = s.id) teams,
            (select count(*)::int from matches m
                where m.season = s.id and not m.playoff) regular,
            (select count(*)::int from matches m
                where m.season = s.id and m.playoff) playoff,
            (select count(distinct m.division)::int from matches m
                where m.season = s.id and not m.playoff) regular_divisions,
            (select count(distinct m.division)::int from matches m
                where m.season = s.id and m.playoff) playoff_divisions,
            (select count(*)::int from roster_slice r
                where r.season = s.id) roster_divisions,
            (select count(*)::int from roster_slice r
                where r.season = s.id and not r.synthetic) real_divisions,
            (select count(*)::int from roster_slice r
                where r.season = s.id and r.synthetic) synthetic_divisions,
            (select coalesce(sum(r.players), 0)::int from roster_slice r
                where r.season = s.id) players
        from seasons s
        order by s.id
    `)

    const rows = (result.rows ?? []) as unknown as Raw[]

    const seasons: SeasonCoverage[] = rows.map((r) => {
        const divisions = Number(r.champion_divisions)
        const rosterDivisions = Number(r.roster_divisions)
        const realDivisions = Number(r.real_divisions)

        return {
            id: Number(r.id),
            code: r.code,
            year: Number(r.year),
            season: r.season,
            divisions,
            // Champions is its own denominator, so it is present or absent.
            champions: divisions > 0 ? "full" : "none",
            regularMatches: statusOf(Number(r.regular_divisions), divisions),
            playoffMatches: statusOf(Number(r.playoff_divisions), divisions),
            rosters: statusOf(rosterDivisions, divisions),
            // Measured against the divisions that HAVE a roster, not against
            // the season: the question is whether the rosters we hold carry a
            // real draft order, not whether we hold all of them.
            realDraft: statusOf(realDivisions, rosterDivisions),
            counts: {
                championDivisions: divisions,
                teams: Number(r.teams),
                regular: Number(r.regular),
                playoff: Number(r.playoff),
                regularDivisions: Number(r.regular_divisions),
                playoffDivisions: Number(r.playoff_divisions),
                rosterDivisions,
                realDivisions,
                syntheticDivisions: Number(r.synthetic_divisions),
                players: Number(r.players)
            }
        }
    })

    const count = (f: (s: SeasonCoverage) => boolean) =>
        seasons.filter(f).length
    const sum = (f: (s: SeasonCoverage) => number) =>
        seasons.reduce((a, s) => a + f(s), 0)

    return {
        seasons,
        totals: {
            seasons: seasons.length,
            withChampions: count((s) => s.champions !== "none"),
            withRegular: count((s) => s.regularMatches !== "none"),
            withPlayoff: count((s) => s.playoffMatches !== "none"),
            withRosters: count((s) => s.rosters !== "none"),
            withRealDraft: count((s) => s.counts.realDivisions > 0),
            withSynthetic: count((s) => s.counts.syntheticDivisions > 0),
            champions: sum((s) => s.counts.championDivisions),
            regular: sum((s) => s.counts.regular),
            playoff: sum((s) => s.counts.playoff),
            players: sum((s) => s.counts.players)
        }
    }
}
