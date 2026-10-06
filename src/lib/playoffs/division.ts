// Builds one division's playoff view (seeds, sections/rounds, schedule
// lines, champion, bracket, the viewer's anchor match) from plain rows. Pure;
// the playoffs page loader does the queries and calls this per division.

import type { BracketMatch } from "@/lib/playoff-bracket-types"
import {
    formatSourceShortLabel,
    type ParsedSource,
    parseSourceToken
} from "@/lib/playoff-sources"
import {
    FOUR_TEAM_PLAYOFF,
    type PlayoffMatchTemplate,
    SIX_TEAM_PLAYOFF
} from "@/lib/schedule-constants"
import { buildBracketData, type EffectiveTeamResolver } from "./bracket-data"
import {
    buildTeamLabelMaps,
    getTeamLabelById,
    type LabelContext,
    type PlayoffTeam,
    resolveSideLabel,
    resolveWorkLabel
} from "./labels"
import {
    formatSetScoreDisplay,
    getGameWins,
    getLoserTeamId,
    getWinnerTeamId
} from "./match-results"
import {
    assignRounds,
    type CombinedMatch,
    classifySections,
    compareByMatchNum,
    compareChronological,
    indexByMatchNum,
    SECTION_LABELS,
    SECTION_ORDER,
    type SectionKey,
    sourceRefIsWin,
    sourceRefMatch
} from "./structure"

export interface PlayoffMatchLine {
    key: string
    id: number | null
    week: number
    matchNum: number | null
    date: string | null
    time: string | null
    court: number | null
    homeLabel: string
    awayLabel: string
    homeScore: number | null
    awayScore: number | null
    homeIsWinner: boolean | null
    winnerLabel: string | null
    winnerGames: number | null
    loserLabel: string | null
    loserGames: number | null
    scoresDisplay: string
    refName: string | null
    homeSourceLabel: string | null
    awaySourceLabel: string | null
    workAssignmentLabel: string | null
    round: number
    homeTeamId: number | null
    awayTeamId: number | null
    workTeamId: number | null
    winnerTeamId: number | null
    loserTeamId: number | null
    homeSourceRefMatch: number | null
    homeSourceRefIsWin: boolean | null
    awaySourceRefMatch: number | null
    awaySourceRefIsWin: boolean | null
    workSourceRefMatch: number | null
    workSourceRefIsWin: boolean | null
}

export interface PlayoffRound {
    round: number
    matches: PlayoffMatchLine[]
}

export interface PlayoffSection {
    key: SectionKey
    label: string
    rounds: PlayoffRound[]
}

export interface PlayoffSeed {
    seed: number
    teamLabel: string
    teamId: number | null
}

export interface PlayoffDivision {
    id: number
    name: string
    level: number
    champion: string | null
    seeds: PlayoffSeed[]
    sections: PlayoffSection[]
    scheduleMatches: PlayoffMatchLine[]
    bracketMatches: { upper: BracketMatch[]; lower: BracketMatch[] } | null
    userAnchorMatchNum: number | null
    userAnchorWeek: number | null
}

/** A playoff `matches` row, as the loader selects it. */
export interface PlayoffMatchRow {
    id: number
    week: number
    date: string | null
    time: string | null
    court: number | null
    homeTeamId: number | null
    awayTeamId: number | null
    homeScore: number | null
    awayScore: number | null
    homeSet1Score: number | null
    awaySet1Score: number | null
    homeSet2Score: number | null
    awaySet2Score: number | null
    homeSet3Score: number | null
    awaySet3Score: number | null
    winnerTeamId: number | null
}

/** A `playoff_matches_meta` row, as the loader selects it. */
export interface PlayoffMetaRow {
    id: number
    week: number
    matchNum: number
    matchId: number | null
    bracket: string | null
    homeSource: string
    awaySource: string
    nextMatchNum: number | null
    nextLoserMatchNum: number | null
    workTeamId: number | null
    workSource: string | null
}

export interface PlayoffDivisionRow {
    id: number
    name: string
    level: number
}

/**
 * Divisions referenced by playoff rows but missing from `divisions` get a
 * placeholder ("Division <id>", sorted after every real level). Result is
 * sorted by level.
 */
export function withPlaceholderDivisions(
    divisionRows: PlayoffDivisionRow[],
    divisionIds: number[]
): PlayoffDivisionRow[] {
    const rows = [...divisionRows]
    const existingDivisionIds = new Set(rows.map((division) => division.id))
    for (const divisionId of divisionIds) {
        if (existingDivisionIds.has(divisionId)) {
            continue
        }
        rows.push({
            id: divisionId,
            name: `Division ${divisionId}`,
            level: 999 + divisionId
        })
    }

    rows.sort((a, b) => a.level - b.level)
    return rows
}

/** The generator template for a division's team count, if there is one. */
export function playoffTemplateForTeamCount(
    teamCount: number | undefined
): PlayoffMatchTemplate[] | null {
    return teamCount === 4
        ? FOUR_TEAM_PLAYOFF
        : teamCount === 6
          ? SIX_TEAM_PLAYOFF
          : null
}

/**
 * Merges a division's playoff matches with their meta rows: each match takes
 * the first meta row pointing at it, and meta rows no match claimed become
 * meta-only entries. A null work_source (rows that predate the column) falls
 * back to the template's work team for that match number. Result is sorted
 * by match number, then chronologically; section and round are unset.
 */
export function combinePlayoffRows(
    matchRows: PlayoffMatchRow[],
    metaRows: PlayoffMetaRow[],
    template: PlayoffMatchTemplate[] | null
): CombinedMatch[] {
    const workSourceByMatchNum = new Map<number, string | null>(
        template?.map((t) => [t.matchNum, t.workTeam]) ?? []
    )
    const resolveWorkSource = (
        workSource: string | null,
        matchNum: number | null
    ): string | null => {
        if (workSource) return workSource
        if (matchNum === null) return null
        return workSourceByMatchNum.get(matchNum) ?? null
    }

    const metaByMatchId = new Map<number, PlayoffMetaRow>()
    for (const meta of metaRows) {
        if (meta.matchId !== null && !metaByMatchId.has(meta.matchId)) {
            metaByMatchId.set(meta.matchId, meta)
        }
    }

    const usedMetaIds = new Set<number>()
    const combinedMatches: CombinedMatch[] = []

    for (const match of matchRows) {
        const meta = metaByMatchId.get(match.id) ?? null

        if (meta) {
            usedMetaIds.add(meta.id)
        }

        combinedMatches.push({
            key: `match-${match.id}`,
            id: match.id,
            week: match.week,
            date: match.date,
            time: match.time,
            court: match.court,
            matchNum: meta?.matchNum ?? null,
            homeTeamId: match.homeTeamId,
            awayTeamId: match.awayTeamId,
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            homeSet1Score: match.homeSet1Score,
            awaySet1Score: match.awaySet1Score,
            homeSet2Score: match.homeSet2Score,
            awaySet2Score: match.awaySet2Score,
            homeSet3Score: match.homeSet3Score,
            awaySet3Score: match.awaySet3Score,
            winnerTeamId: match.winnerTeamId,
            homeSource: parseSourceToken(meta?.homeSource || null),
            awaySource: parseSourceToken(meta?.awaySource || null),
            workTeamId: meta?.workTeamId ?? null,
            workSource: parseSourceToken(
                resolveWorkSource(
                    meta?.workSource ?? null,
                    meta?.matchNum ?? null
                )
            ),
            metaBracket: meta?.bracket || null,
            section: null,
            round: 1,
            nextMatchNum: meta?.nextMatchNum ?? null,
            nextLoserMatchNum: meta?.nextLoserMatchNum ?? null
        })
    }

    for (const meta of metaRows) {
        if (usedMetaIds.has(meta.id)) {
            continue
        }

        combinedMatches.push({
            key: `meta-${meta.id}`,
            id: null,
            week: meta.week,
            date: null,
            time: null,
            court: null,
            matchNum: meta.matchNum,
            homeTeamId: null,
            awayTeamId: null,
            homeScore: null,
            awayScore: null,
            homeSet1Score: null,
            awaySet1Score: null,
            homeSet2Score: null,
            awaySet2Score: null,
            homeSet3Score: null,
            awaySet3Score: null,
            winnerTeamId: null,
            homeSource: parseSourceToken(meta.homeSource),
            awaySource: parseSourceToken(meta.awaySource),
            workTeamId: meta.workTeamId ?? null,
            workSource: parseSourceToken(
                resolveWorkSource(meta.workSource ?? null, meta.matchNum)
            ),
            metaBracket: meta.bracket || null,
            section: null,
            round: 1,
            nextMatchNum: meta.nextMatchNum ?? null,
            nextLoserMatchNum: meta.nextLoserMatchNum ?? null
        })
    }

    combinedMatches.sort(compareByMatchNum)
    return combinedMatches
}

/**
 * Seeds named by S<n> sources. A seed's team comes from whichever side the
 * seed source sits on when that side has a team; later matches overwrite
 * earlier ones.
 */
export function collectSeeds(
    combinedMatches: CombinedMatch[],
    teamLabelById: Map<number, string>
): {
    seedNumbers: Set<number>
    seedLabelBySeed: Map<number, string>
    seedTeamIdBySeed: Map<number, number>
} {
    const seedNumbers = new Set<number>()
    const seedLabelBySeed = new Map<number, string>()
    const seedTeamIdBySeed = new Map<number, number>()
    for (const match of combinedMatches) {
        const sides: Array<[ParsedSource, number | null]> = [
            [match.homeSource, match.homeTeamId],
            [match.awaySource, match.awayTeamId]
        ]
        for (const [source, teamId] of sides) {
            if (source.kind !== "seed" || source.value === null) continue
            seedNumbers.add(source.value)
            if (teamId !== null) {
                seedLabelBySeed.set(
                    source.value,
                    teamLabelById.get(teamId) || `Team ${teamId}`
                )
                seedTeamIdBySeed.set(source.value, teamId)
            }
        }
    }
    return { seedNumbers, seedLabelBySeed, seedTeamIdBySeed }
}

/**
 * Deterministic team-id resolver: if a side has a real team_id in the DB,
 * return it; else if its source is a decided seed/winner/loser, follow the
 * chain one level. Returns null when the upstream match is undecided (so we
 * never "promise" a team to a match it might not reach). Used to make the
 * "user is in this match" highlight work even when downstream rows haven't
 * been backfilled.
 */
export function makeEffectiveTeamResolver(
    seedTeamIdBySeed: Map<number, number>,
    matchByNum: Map<number, CombinedMatch>
): EffectiveTeamResolver {
    return (teamId, source) => {
        if (teamId !== null) return teamId
        if (source.kind === "seed" && source.value !== null) {
            return seedTeamIdBySeed.get(source.value) ?? null
        }
        if (
            (source.kind === "winner" || source.kind === "loser") &&
            source.value !== null
        ) {
            const ref = matchByNum.get(source.value)
            if (!ref) return null
            const winner = getWinnerTeamId(ref)
            if (winner === null) return null
            if (source.kind === "winner") return winner
            if (ref.homeTeamId === null || ref.awayTeamId === null) {
                return null
            }
            return winner === ref.homeTeamId ? ref.awayTeamId : ref.homeTeamId
        }
        return null
    }
}

export function buildMatchLine(
    match: CombinedMatch,
    labelContext: LabelContext,
    resolveEffective: EffectiveTeamResolver,
    refName: string | null
): PlayoffMatchLine {
    const winnerTeamId = getWinnerTeamId(match)
    const loserTeamId = getLoserTeamId(match, winnerTeamId)
    const wins = getGameWins(match)

    const homeIsWinner =
        winnerTeamId !== null && match.homeTeamId !== null
            ? winnerTeamId === match.homeTeamId
            : null

    const winnerGames =
        homeIsWinner === null
            ? null
            : homeIsWinner
              ? wins.homeWins
              : wins.awayWins
    const loserGames =
        homeIsWinner === null
            ? null
            : homeIsWinner
              ? wins.awayWins
              : wins.homeWins

    return {
        key: match.key,
        id: match.id,
        week: match.week,
        matchNum: match.matchNum,
        date: match.date,
        time: match.time,
        court: match.court,
        homeLabel: resolveSideLabel(
            match.homeTeamId,
            match.homeSource,
            labelContext
        ),
        awayLabel: resolveSideLabel(
            match.awayTeamId,
            match.awaySource,
            labelContext
        ),
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        homeIsWinner,
        winnerLabel:
            winnerTeamId !== null
                ? getTeamLabelById(winnerTeamId, labelContext)
                : null,
        winnerGames,
        loserLabel:
            loserTeamId !== null
                ? getTeamLabelById(loserTeamId, labelContext)
                : null,
        loserGames,
        scoresDisplay: formatSetScoreDisplay(match, homeIsWinner),
        refName,
        homeSourceLabel: formatSourceShortLabel(match.homeSource),
        awaySourceLabel: formatSourceShortLabel(match.awaySource),
        workAssignmentLabel: resolveWorkLabel(
            match.workTeamId,
            match.workSource,
            labelContext
        ),
        round: match.round,
        homeTeamId: resolveEffective(match.homeTeamId, match.homeSource),
        awayTeamId: resolveEffective(match.awayTeamId, match.awaySource),
        workTeamId: resolveEffective(match.workTeamId, match.workSource),
        winnerTeamId,
        loserTeamId,
        homeSourceRefMatch: sourceRefMatch(match.homeSource),
        homeSourceRefIsWin: sourceRefIsWin(match.homeSource),
        awaySourceRefMatch: sourceRefMatch(match.awaySource),
        awaySourceRefIsWin: sourceRefIsWin(match.awaySource),
        workSourceRefMatch: sourceRefMatch(match.workSource),
        workSourceRefIsWin: sourceRefIsWin(match.workSource)
    }
}

/** Sections in winners/losers/championship order, empty ones omitted. */
export function buildSections(
    combinedMatches: CombinedMatch[],
    lineByKey: Map<string, PlayoffMatchLine>
): PlayoffSection[] {
    const sections: PlayoffSection[] = []

    for (const sectionKey of SECTION_ORDER) {
        const sectionMatches = combinedMatches
            .filter((match) => match.section === sectionKey)
            .sort((a, b) => {
                if (a.round !== b.round) {
                    return a.round - b.round
                }
                return compareChronological(a, b)
            })

        if (sectionMatches.length === 0) {
            continue
        }

        const roundsMap = new Map<number, PlayoffMatchLine[]>()
        for (const match of sectionMatches) {
            const line = lineByKey.get(match.key)
            if (!line) {
                continue
            }

            const current = roundsMap.get(match.round) || []
            current.push(line)
            roundsMap.set(match.round, current)
        }

        const rounds: PlayoffRound[] = [...roundsMap.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([round, roundMatches]) => ({
                round,
                matches: [...roundMatches].sort(compareChronological)
            }))

        sections.push({
            key: sectionKey,
            label: SECTION_LABELS[sectionKey],
            rounds
        })
    }

    return sections
}

/**
 * The champion's team id. Uses the championship section, or the winners
 * section for a bracket without one (single elimination). Walks from the
 * deepest match (e.g. an "if necessary" reset) toward earlier rounds and
 * crowns the first match that has a recorded winner. Earlier rounds outside
 * the final section are intentionally ignored — winning a quarterfinal does
 * not make a team the champion.
 */
export function findChampionTeamId(
    combinedMatches: CombinedMatch[]
): number | null {
    const sortDeepestFirst = (a: CombinedMatch, b: CombinedMatch) => {
        if (a.round !== b.round) {
            return b.round - a.round
        }

        const matchNumA = a.matchNum ?? -1
        const matchNumB = b.matchNum ?? -1
        return matchNumB - matchNumA
    }

    const championshipMatches = combinedMatches.filter(
        (match) => match.section === "championship"
    )
    const finalSectionMatches =
        championshipMatches.length > 0
            ? championshipMatches
            : combinedMatches.filter((match) => match.section === "winners")

    return (
        [...finalSectionMatches]
            .sort(sortDeepestFirst)
            .map((match) => getWinnerTeamId(match))
            .find((teamId): teamId is number => teamId !== null) ?? null
    )
}

/**
 * The user's "anchor": their team's first undecided numbered match (as
 * home, away or work team, by effective team id), falling back to the last
 * decided one when every match they're in already has a winner. Drives the
 * green/red one-level-lookahead path tinting. `scheduleMatches` must be in
 * chronological order.
 */
export function findUserAnchor(
    scheduleMatches: PlayoffMatchLine[],
    userTeamId: number
): { matchNum: number | null; week: number | null } {
    let userAnchorMatchNum: number | null = null
    let userAnchorWeek: number | null = null
    let fallbackMatchNum: number | null = null
    let fallbackWeek: number | null = null
    for (const line of scheduleMatches) {
        if (line.matchNum === null) continue
        const involves =
            line.homeTeamId === userTeamId ||
            line.awayTeamId === userTeamId ||
            line.workTeamId === userTeamId
        if (!involves) continue
        if (line.winnerTeamId === null) {
            if (userAnchorMatchNum === null) {
                userAnchorMatchNum = line.matchNum
                userAnchorWeek = line.week
            }
        } else {
            fallbackMatchNum = line.matchNum
            fallbackWeek = line.week
        }
    }
    if (userAnchorMatchNum === null) {
        userAnchorMatchNum = fallbackMatchNum
        userAnchorWeek = fallbackWeek
    }
    return { matchNum: userAnchorMatchNum, week: userAnchorWeek }
}

export interface BuildPlayoffDivisionInput {
    division: PlayoffDivisionRow
    /** The division's teams this season. */
    teams: PlayoffTeam[]
    /** The division's playoff matches this season. */
    matchRows: PlayoffMatchRow[]
    /** The division's playoff_matches_meta rows this season. */
    metaRows: PlayoffMetaRow[]
    /** individual_divisions.teams for the division, if configured. */
    teamCount: number | undefined
    refByMatchId: Map<number, string | null>
    /** The viewer's team this season and its division (null if none). */
    userTeamId: number | null
    userDivisionId: number | null
}

export function buildPlayoffDivision(
    input: BuildPlayoffDivisionInput
): PlayoffDivision {
    const { division, refByMatchId, userTeamId, userDivisionId } = input

    const combinedMatches = combinePlayoffRows(
        input.matchRows,
        input.metaRows,
        playoffTemplateForTeamCount(input.teamCount)
    )
    classifySections(combinedMatches)
    assignRounds(combinedMatches)

    const matchByNum = indexByMatchNum(combinedMatches)
    const { teamLabelById, teamLabelByNumber } = buildTeamLabelMaps(input.teams)
    const { seedNumbers, seedLabelBySeed, seedTeamIdBySeed } = collectSeeds(
        combinedMatches,
        teamLabelById
    )

    const labelContext: LabelContext = {
        teamLabelById,
        teamLabelByNumber,
        seedLabelBySeed,
        matchByNum
    }
    const resolveEffective = makeEffectiveTeamResolver(
        seedTeamIdBySeed,
        matchByNum
    )

    const lineByKey = new Map<string, PlayoffMatchLine>()
    for (const match of combinedMatches) {
        lineByKey.set(
            match.key,
            buildMatchLine(
                match,
                labelContext,
                resolveEffective,
                match.id !== null ? (refByMatchId.get(match.id) ?? null) : null
            )
        )
    }

    const sections = buildSections(combinedMatches, lineByKey)
    const scheduleMatches = [...lineByKey.values()].sort(compareChronological)

    const championTeamId = findChampionTeamId(combinedMatches)
    const champion =
        championTeamId !== null
            ? getTeamLabelById(championTeamId, labelContext)
            : null

    const seeds: PlayoffSeed[] = [...seedNumbers]
        .sort((a, b) => a - b)
        .map((seedNum) => ({
            seed: seedNum,
            teamLabel: seedLabelBySeed.get(seedNum) || `Seed ${seedNum}`,
            teamId: seedTeamIdBySeed.get(seedNum) ?? null
        }))

    const bracketMatches = buildBracketData(
        combinedMatches,
        labelContext,
        resolveEffective
    )

    // scheduleMatches carries effective team IDs (resolved through decided
    // winner/loser/seed sources), so direct equality works for downstream
    // rows that the DB hasn't backfilled yet.
    const anchor =
        userTeamId !== null && division.id === userDivisionId
            ? findUserAnchor(scheduleMatches, userTeamId)
            : { matchNum: null, week: null }

    return {
        id: division.id,
        name: division.name,
        level: division.level,
        champion,
        seeds,
        sections,
        scheduleMatches,
        bracketMatches,
        userAnchorMatchNum: anchor.matchNum,
        userAnchorWeek: anchor.week
    }
}
