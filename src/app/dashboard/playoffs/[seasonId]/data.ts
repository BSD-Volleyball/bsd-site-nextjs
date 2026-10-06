import "server-only"

import { formatSeasonRowLabel } from "@/lib/season-utils"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import {
    divisions,
    drafts,
    individual_divisions,
    matches,
    matchReferees,
    playoffMatchesMeta,
    seasons,
    teams,
    users
} from "@/database/schema"
import {
    type ActionResult,
    fail,
    ok,
    requirePositiveInt,
    requireSession,
    withAction
} from "@/next/action-helpers"
import {
    buildPlayoffDivision,
    type PlayoffDivision,
    withPlaceholderDivisions
} from "@/lib/playoffs/division"

// The bracket computation (sections, rounds, labels, seeds, champion, the
// bracket view's shape) lives in src/lib/playoffs/; this loader only queries.

export type {
    PlayoffDivision,
    PlayoffMatchLine,
    PlayoffRound,
    PlayoffSection,
    PlayoffSeed
} from "@/lib/playoffs/division"

export type {
    BracketMatch,
    BracketParticipant
} from "@/lib/playoff-bracket-types"

interface PlayoffData {
    seasonLabel: string
    divisions: PlayoffDivision[]
    userTeamId: number | null
    userDivisionId: number | null
}

export const getPlayoffData = withAction(
    async (seasonId: number): Promise<ActionResult<PlayoffData>> => {
        const session = await requireSession()

        requirePositiveInt(seasonId, "season")

        const [seasonRow] = await db
            .select({
                year: seasons.year,
                season: seasons.season
            })
            .from(seasons)
            .where(eq(seasons.id, seasonId))
            .limit(1)

        if (!seasonRow) {
            return fail("Season not found.")
        }

        const seasonLabel = formatSeasonRowLabel(seasonRow)

        const [playoffMatchRows, metaRows, refRows] = await Promise.all([
            db
                .select({
                    id: matches.id,
                    divisionId: matches.division,
                    week: matches.week,
                    date: matches.date,
                    time: matches.time,
                    court: matches.court,
                    homeTeamId: matches.home_team,
                    awayTeamId: matches.away_team,
                    homeScore: matches.home_score,
                    awayScore: matches.away_score,
                    homeSet1Score: matches.home_set1_score,
                    awaySet1Score: matches.away_set1_score,
                    homeSet2Score: matches.home_set2_score,
                    awaySet2Score: matches.away_set2_score,
                    homeSet3Score: matches.home_set3_score,
                    awaySet3Score: matches.away_set3_score,
                    winnerTeamId: matches.winner
                })
                .from(matches)
                .where(
                    and(eq(matches.season, seasonId), eq(matches.playoff, true))
                ),
            db
                .select({
                    id: playoffMatchesMeta.id,
                    divisionId: playoffMatchesMeta.division,
                    week: playoffMatchesMeta.week,
                    matchNum: playoffMatchesMeta.match_num,
                    matchId: playoffMatchesMeta.match_id,
                    bracket: playoffMatchesMeta.bracket,
                    homeSource: playoffMatchesMeta.home_source,
                    awaySource: playoffMatchesMeta.away_source,
                    nextMatchNum: playoffMatchesMeta.next_match_num,
                    nextLoserMatchNum: playoffMatchesMeta.next_loser_match_num,
                    workTeamId: playoffMatchesMeta.work_team,
                    workSource: playoffMatchesMeta.work_source
                })
                .from(playoffMatchesMeta)
                .where(eq(playoffMatchesMeta.season, seasonId)),
            db
                .select({
                    matchId: matchReferees.match_id,
                    refName: users.name
                })
                .from(matchReferees)
                .innerJoin(users, eq(matchReferees.referee_id, users.id))
                .where(eq(matchReferees.season_id, seasonId))
        ])

        // Referee assignments live in the match_referees join table keyed by
        // the real matches.id, so meta-only playoff rows (no scheduled match
        // yet) simply won't have an entry and fall back to null.
        const refByMatchId = new Map(
            refRows.map((row) => [row.matchId, row.refName])
        )

        const divisionIds = [
            ...new Set([
                ...playoffMatchRows.map((row) => row.divisionId),
                ...metaRows.map((row) => row.divisionId)
            ])
        ]

        // Resolve which team (if any) the current user plays for in this season.
        const [userDraft] = await db
            .select({ teamId: teams.id, divisionId: teams.division })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .where(
                and(
                    eq(drafts.user, session.user.id),
                    eq(teams.season, seasonId)
                )
            )
            .limit(1)
        const userTeamId = userDraft?.teamId ?? null
        const userDivisionId = userDraft?.divisionId ?? null

        if (divisionIds.length === 0) {
            return ok({
                seasonLabel,
                divisions: [],
                userTeamId,
                userDivisionId
            })
        }

        const [teamRows, divisionRowsFromDb, indivDivRows] = await Promise.all([
            db
                .select({
                    id: teams.id,
                    divisionId: teams.division,
                    number: teams.number,
                    name: teams.name
                })
                .from(teams)
                .where(
                    and(
                        eq(teams.season, seasonId),
                        inArray(teams.division, divisionIds)
                    )
                ),
            db
                .select({
                    id: divisions.id,
                    name: divisions.name,
                    level: divisions.level
                })
                .from(divisions)
                .where(inArray(divisions.id, divisionIds))
                .orderBy(divisions.level),
            db
                .select({
                    divisionId: individual_divisions.division,
                    teamCount: individual_divisions.teams
                })
                .from(individual_divisions)
                .where(eq(individual_divisions.season, seasonId))
        ])

        const divisionRows = withPlaceholderDivisions(
            divisionRowsFromDb,
            divisionIds
        )

        const teamCountByDivision = new Map(
            indivDivRows.map((d) => [d.divisionId, d.teamCount])
        )

        const allDivisions: PlayoffDivision[] = divisionRows.map((division) =>
            buildPlayoffDivision({
                division,
                teams: teamRows.filter(
                    (team) => team.divisionId === division.id
                ),
                matchRows: playoffMatchRows.filter(
                    (match) => match.divisionId === division.id
                ),
                metaRows: metaRows.filter(
                    (meta) => meta.divisionId === division.id
                ),
                teamCount: teamCountByDivision.get(division.id),
                refByMatchId,
                userTeamId,
                userDivisionId
            })
        )

        return ok({
            seasonLabel,
            divisions: allDivisions,
            userTeamId,
            userDivisionId
        })
    }
)
