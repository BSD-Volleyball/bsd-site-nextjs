import { db } from "@/database/db"
import {
    individual_divisions,
    matches,
    playoffMatchesMeta,
    teams
} from "@/database/schema"
import { and, eq, isNotNull, or } from "drizzle-orm"
import { rankDivision } from "@/lib/team-ranking"
import {
    FOUR_TEAM_PLAYOFF,
    SIX_TEAM_PLAYOFF
} from "@/app/dashboard/create-schedule/schedule-constants"

export interface SeedPlayoffsResult {
    status: boolean
    message: string
    divisionsSeeded?: number
}

const SEED_SOURCE_PATTERN = /^S(\d+)$/

export async function seedPlayoffs(
    seasonId: number
): Promise<SeedPlayoffsResult> {
    if (!Number.isInteger(seasonId) || seasonId <= 0) {
        return { status: false, message: "Invalid season ID." }
    }

    // Refuse to re-seed if any playoff match already has scores entered.
    const playedRows = await db
        .select({ id: matches.id })
        .from(matches)
        .where(
            and(
                eq(matches.season, seasonId),
                eq(matches.playoff, true),
                or(
                    isNotNull(matches.home_score),
                    isNotNull(matches.home_set1_score)
                )
            )
        )
        .limit(1)

    if (playedRows.length > 0) {
        return {
            status: false,
            message:
                "Cannot re-seed playoffs: at least one playoff match already has scores entered. Clear those scores or revert the affected match before re-seeding."
        }
    }

    const indivDivs = await db
        .select({
            divisionId: individual_divisions.division,
            teamCount: individual_divisions.teams
        })
        .from(individual_divisions)
        .where(eq(individual_divisions.season, seasonId))

    if (indivDivs.length === 0) {
        return {
            status: false,
            message: "No divisions configured for this season."
        }
    }

    let divisionsSeeded = 0

    for (const div of indivDivs) {
        const divisionTeams = await db
            .select({
                id: teams.id,
                number: teams.number,
                name: teams.name
            })
            .from(teams)
            .where(
                and(
                    eq(teams.season, seasonId),
                    eq(teams.division, div.divisionId)
                )
            )

        if (divisionTeams.length === 0) continue

        const regularMatches = await db
            .select({
                week: matches.week,
                homeTeamId: matches.home_team,
                awayTeamId: matches.away_team,
                homeScore: matches.home_score,
                awayScore: matches.away_score,
                home_set1_score: matches.home_set1_score,
                away_set1_score: matches.away_set1_score,
                home_set2_score: matches.home_set2_score,
                away_set2_score: matches.away_set2_score,
                home_set3_score: matches.home_set3_score,
                away_set3_score: matches.away_set3_score
            })
            .from(matches)
            .where(
                and(
                    eq(matches.season, seasonId),
                    eq(matches.division, div.divisionId),
                    eq(matches.playoff, false)
                )
            )

        const ranked = rankDivision(
            divisionTeams,
            regularMatches,
            div.teamCount
        )

        // Persist ordinal rank (1..N) on each team.
        for (let i = 0; i < ranked.length; i++) {
            const ordinal = i + 1
            await db
                .update(teams)
                .set({ rank: ordinal })
                .where(eq(teams.id, ranked[i].id))
        }

        // Backfill work_source from the template for legacy rows that predate
        // the work_source column, so existing seasons can advance to playoffs
        // and have work assignments populate without re-running schedule
        // generation.
        const template =
            div.teamCount === 4 ? FOUR_TEAM_PLAYOFF : SIX_TEAM_PLAYOFF
        const workSourceByMatchNum = new Map(
            template.map((t) => [t.matchNum, t.workTeam])
        )

        const metaRows = await db
            .select({
                id: playoffMatchesMeta.id,
                matchId: playoffMatchesMeta.match_id,
                matchNum: playoffMatchesMeta.match_num,
                homeSource: playoffMatchesMeta.home_source,
                awaySource: playoffMatchesMeta.away_source,
                workSource: playoffMatchesMeta.work_source
            })
            .from(playoffMatchesMeta)
            .where(
                and(
                    eq(playoffMatchesMeta.season, seasonId),
                    eq(playoffMatchesMeta.division, div.divisionId)
                )
            )

        for (const meta of metaRows) {
            const effectiveWorkSource =
                meta.workSource ??
                workSourceByMatchNum.get(meta.matchNum) ??
                null

            if (
                effectiveWorkSource !== null &&
                effectiveWorkSource !== meta.workSource
            ) {
                await db
                    .update(playoffMatchesMeta)
                    .set({ work_source: effectiveWorkSource })
                    .where(eq(playoffMatchesMeta.id, meta.id))
            }

            // Resolve direct-seed work team to the work_team integer column.
            const workSeedMatch = effectiveWorkSource
                ? SEED_SOURCE_PATTERN.exec(effectiveWorkSource)
                : null
            if (workSeedMatch) {
                const seedIdx = Number.parseInt(workSeedMatch[1], 10) - 1
                const team = ranked[seedIdx]
                if (team) {
                    await db
                        .update(playoffMatchesMeta)
                        .set({ work_team: team.id })
                        .where(eq(playoffMatchesMeta.id, meta.id))
                }
            }

            if (!meta.matchId) continue

            const homeMatch = SEED_SOURCE_PATTERN.exec(meta.homeSource)
            const awayMatch = SEED_SOURCE_PATTERN.exec(meta.awaySource)

            const update: { home_team?: number; away_team?: number } = {}
            if (homeMatch) {
                const seedIdx = Number.parseInt(homeMatch[1], 10) - 1
                const team = ranked[seedIdx]
                if (team) update.home_team = team.id
            }
            if (awayMatch) {
                const seedIdx = Number.parseInt(awayMatch[1], 10) - 1
                const team = ranked[seedIdx]
                if (team) update.away_team = team.id
            }

            if (Object.keys(update).length > 0) {
                await db
                    .update(matches)
                    .set(update)
                    .where(eq(matches.id, meta.matchId))
            }
        }

        divisionsSeeded++
    }

    return {
        status: true,
        message: `Seeded ${divisionsSeeded} division${divisionsSeeded === 1 ? "" : "s"}.`,
        divisionsSeeded
    }
}
