"use server"

import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import { auth } from "@/lib/auth"
import {
    divisions,
    matchs,
    playoffMatchesMeta,
    seasons,
    teams
} from "@/database/schema"
import { headers } from "next/headers"

type SectionKey = "winners" | "losers" | "championship"
type SourceKind = "none" | "seed" | "winner" | "loser" | "team" | "unknown"

interface ParsedSource {
    raw: string | null
    normalized: string | null
    kind: SourceKind
    value: number | null
}

interface CombinedMatch {
    key: string
    id: number | null
    week: number
    date: string | null
    time: string | null
    court: number | null
    matchNum: number | null
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
    homeSource: ParsedSource
    awaySource: ParsedSource
    workTeamId: number | null
    metaBracket: string | null
    section: SectionKey | null
    round: number
    nextMatchNum: number | null
    nextLoserMatchNum: number | null
}

interface TeamLookup {
    id: number
    divisionId: number
    number: number | null
    name: string
}

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
    homeSourceLabel: string | null
    awaySourceLabel: string | null
    workAssignmentLabel: string | null
    round: number
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
}

export interface BracketParticipant {
    id: string
    name: string
    resultText: string | null
    isWinner: boolean
    status: "PLAYED" | "NO_SHOW" | "WALK_OVER" | "NO_PARTY" | null
}

export interface BracketMatch {
    id: number
    name: string
    nextMatchId: number | null
    nextLooserMatchId: number | null
    tournamentRoundText: string
    startTime: string
    state: string
    participants: BracketParticipant[]
    matchNum: number
    week: number
    date: string | null
    time: string | null
    court: number | null
    scoresDisplay: string
    homeSourceLabel: string | null
    awaySourceLabel: string | null
    workTeamLabel: string | null
}

export interface PlayoffDivision {
    id: number
    name: string
    level: number
    champion: string | null
    seeds: PlayoffSeed[]
    sections: PlayoffSection[]
    scheduleMatches: PlayoffMatchLine[]
    resultsMatches: PlayoffMatchLine[]
    bracketMatches: { upper: BracketMatch[]; lower: BracketMatch[] } | null
}

interface PlayoffData {
    status: boolean
    message?: string
    seasonLabel: string
    divisions: PlayoffDivision[]
}

function parseTimeForSort(time: string | null): number {
    if (!time) {
        return Number.MAX_SAFE_INTEGER
    }

    const match = time.match(/^(\d{1,2}):(\d{2})$/)
    if (!match) {
        return Number.MAX_SAFE_INTEGER
    }

    const hour = Number.parseInt(match[1], 10)
    const minute = Number.parseInt(match[2], 10)
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
        return Number.MAX_SAFE_INTEGER
    }

    return hour * 60 + minute
}

function compareChronological(
    a: Pick<CombinedMatch, "week" | "time" | "court" | "matchNum">,
    b: Pick<CombinedMatch, "week" | "time" | "court" | "matchNum">
): number {
    if (a.week !== b.week) {
        return a.week - b.week
    }

    const timeCmp = parseTimeForSort(a.time) - parseTimeForSort(b.time)
    if (timeCmp !== 0) {
        return timeCmp
    }

    const courtA = a.court ?? Number.MAX_SAFE_INTEGER
    const courtB = b.court ?? Number.MAX_SAFE_INTEGER
    if (courtA !== courtB) {
        return courtA - courtB
    }

    const matchNumA = a.matchNum ?? Number.MAX_SAFE_INTEGER
    const matchNumB = b.matchNum ?? Number.MAX_SAFE_INTEGER
    return matchNumA - matchNumB
}

function compareLineChronological(a: PlayoffMatchLine, b: PlayoffMatchLine) {
    if (a.week !== b.week) {
        return a.week - b.week
    }

    const timeCmp = parseTimeForSort(a.time) - parseTimeForSort(b.time)
    if (timeCmp !== 0) {
        return timeCmp
    }

    const courtA = a.court ?? Number.MAX_SAFE_INTEGER
    const courtB = b.court ?? Number.MAX_SAFE_INTEGER
    if (courtA !== courtB) {
        return courtA - courtB
    }

    const matchNumA = a.matchNum ?? Number.MAX_SAFE_INTEGER
    const matchNumB = b.matchNum ?? Number.MAX_SAFE_INTEGER
    return matchNumA - matchNumB
}

function parseSourceToken(source: string | null): ParsedSource {
    if (!source) {
        return {
            raw: null,
            normalized: null,
            kind: "none",
            value: null
        }
    }

    const normalized = source.trim().replace(/^"|"$/g, "").toUpperCase()
    if (!normalized) {
        return {
            raw: source,
            normalized: null,
            kind: "none",
            value: null
        }
    }

    const seedMatch = normalized.match(/^S(?:EED)?(\d+)$/)
    if (seedMatch) {
        return {
            raw: source,
            normalized,
            kind: "seed",
            value: Number.parseInt(seedMatch[1], 10)
        }
    }

    const winnerMatch = normalized.match(/^W(?:INNER)?(\d+)$/)
    if (winnerMatch) {
        return {
            raw: source,
            normalized,
            kind: "winner",
            value: Number.parseInt(winnerMatch[1], 10)
        }
    }

    const loserMatch = normalized.match(/^L(?:OSER)?(\d+)$/)
    if (loserMatch) {
        return {
            raw: source,
            normalized,
            kind: "loser",
            value: Number.parseInt(loserMatch[1], 10)
        }
    }

    const directTeamNum = Number.parseInt(normalized, 10)
    if (!Number.isNaN(directTeamNum)) {
        return {
            raw: source,
            normalized,
            kind: "team",
            value: directTeamNum
        }
    }

    return {
        raw: source,
        normalized,
        kind: "unknown",
        value: null
    }
}

function formatSourceLabel(source: ParsedSource): string | null {
    if (source.kind === "none") {
        return null
    }

    if (source.kind === "seed" && source.value !== null) {
        return `S${source.value}`
    }

    if (source.kind === "winner" && source.value !== null) {
        return `W${source.value}`
    }

    if (source.kind === "loser" && source.value !== null) {
        return `L${source.value}`
    }

    if (source.kind === "team" && source.value !== null) {
        return `#${source.value}`
    }

    return source.normalized || source.raw || null
}

function isWinnerLoserReset(home: ParsedSource, away: ParsedSource): boolean {
    if (home.value === null || away.value === null) {
        return false
    }

    const isWinnerLoserPair =
        (home.kind === "winner" && away.kind === "loser") ||
        (home.kind === "loser" && away.kind === "winner")

    return isWinnerLoserPair && home.value === away.value
}

function getSetScores(
    match: CombinedMatch
): Array<{ home: number; away: number }> {
    const sets: Array<{ home: number; away: number }> = []

    if (match.homeSet1Score !== null && match.awaySet1Score !== null) {
        sets.push({
            home: match.homeSet1Score,
            away: match.awaySet1Score
        })
    }

    if (match.homeSet2Score !== null && match.awaySet2Score !== null) {
        sets.push({
            home: match.homeSet2Score,
            away: match.awaySet2Score
        })
    }

    if (match.homeSet3Score !== null && match.awaySet3Score !== null) {
        sets.push({
            home: match.homeSet3Score,
            away: match.awaySet3Score
        })
    }

    return sets
}

function getGameWins(match: CombinedMatch): {
    homeWins: number | null
    awayWins: number | null
} {
    if (match.homeScore !== null && match.awayScore !== null) {
        return {
            homeWins: match.homeScore,
            awayWins: match.awayScore
        }
    }

    const sets = getSetScores(match)
    if (sets.length === 0) {
        return {
            homeWins: null,
            awayWins: null
        }
    }

    let homeWins = 0
    let awayWins = 0
    for (const set of sets) {
        if (set.home > set.away) {
            homeWins++
        } else if (set.away > set.home) {
            awayWins++
        }
    }

    return {
        homeWins,
        awayWins
    }
}

function getWinnerTeamId(match: CombinedMatch): number | null {
    if (match.winnerTeamId !== null) {
        return match.winnerTeamId
    }

    if (match.homeTeamId === null || match.awayTeamId === null) {
        return null
    }

    const wins = getGameWins(match)
    if (wins.homeWins === null || wins.awayWins === null) {
        return null
    }

    if (wins.homeWins > wins.awayWins) {
        return match.homeTeamId
    }

    if (wins.awayWins > wins.homeWins) {
        return match.awayTeamId
    }

    return null
}

function getLoserTeamId(
    match: CombinedMatch,
    winnerTeamId: number | null
): number | null {
    if (
        winnerTeamId === null ||
        match.homeTeamId === null ||
        match.awayTeamId === null
    ) {
        return null
    }

    return winnerTeamId === match.homeTeamId
        ? match.awayTeamId
        : match.homeTeamId
}

function formatSetScoreDisplay(
    match: CombinedMatch,
    homeIsWinner: boolean | null
): string {
    const sets = getSetScores(match)
    if (sets.length === 0) {
        return "—"
    }

    return sets
        .map((set) => {
            if (homeIsWinner === true) {
                return `${set.home}-${set.away}`
            }

            if (homeIsWinner === false) {
                return `${set.away}-${set.home}`
            }

            return `${set.home}-${set.away}`
        })
        .join("  ")
}

function classifySections(matches: CombinedMatch[]) {
    const matchByNum = new Map<number, CombinedMatch>()
    for (const match of matches) {
        if (match.matchNum !== null && !matchByNum.has(match.matchNum)) {
            matchByNum.set(match.matchNum, match)
        }
    }

    for (const match of matches) {
        const bracket = (match.metaBracket || "").toLowerCase()

        if (isWinnerLoserReset(match.homeSource, match.awaySource)) {
            match.section = "championship"
            continue
        }

        if (bracket === "winners") {
            match.section = "winners"
            continue
        }

        if (bracket === "losers") {
            match.section = "losers"
            continue
        }

        if (
            match.homeSource.kind === "loser" ||
            match.awaySource.kind === "loser"
        ) {
            match.section = "losers"
            continue
        }

        if (
            match.homeSource.kind === "seed" ||
            match.awaySource.kind === "seed" ||
            match.homeSource.kind === "team" ||
            match.awaySource.kind === "team"
        ) {
            match.section = "winners"
        }
    }

    for (let i = 0; i < 8; i++) {
        let changed = false

        for (const match of matches) {
            const refs = [match.homeSource, match.awaySource]
            const referencedSections: SectionKey[] = refs
                .filter(
                    (ref) =>
                        (ref.kind === "winner" || ref.kind === "loser") &&
                        ref.value !== null
                )
                .map((ref) => {
                    const referencedMatch =
                        ref.value !== null ? matchByNum.get(ref.value) : null
                    return referencedMatch?.section || null
                })
                .filter((section): section is SectionKey => section !== null)

            let nextSection = match.section

            if (isWinnerLoserReset(match.homeSource, match.awaySource)) {
                nextSection = "championship"
            } else if (refs.some((ref) => ref.kind === "loser")) {
                nextSection = "losers"
            } else if (
                referencedSections.includes("winners") &&
                referencedSections.includes("losers")
            ) {
                nextSection = "championship"
            } else if (referencedSections.length > 0) {
                const first = referencedSections[0]
                if (referencedSections.every((section) => section === first)) {
                    nextSection = first
                }
            } else if (
                refs.some((ref) => ref.kind === "seed" || ref.kind === "team")
            ) {
                nextSection = "winners"
            }

            if (nextSection && nextSection !== match.section) {
                match.section = nextSection
                changed = true
            }
        }

        if (!changed) {
            break
        }
    }

    for (const match of matches) {
        if (match.section) {
            continue
        }

        if (isWinnerLoserReset(match.homeSource, match.awaySource)) {
            match.section = "championship"
            continue
        }

        if (
            match.homeSource.kind === "loser" ||
            match.awaySource.kind === "loser"
        ) {
            match.section = "losers"
            continue
        }

        match.section = "winners"
    }
}

function assignRounds(matches: CombinedMatch[]) {
    const matchByNum = new Map<number, CombinedMatch>()
    for (const match of matches) {
        if (match.matchNum !== null && !matchByNum.has(match.matchNum)) {
            matchByNum.set(match.matchNum, match)
        }
    }

    const sections: SectionKey[] = ["winners", "losers", "championship"]

    for (const section of sections) {
        const sectionMatches = matches.filter(
            (match) => match.section === section
        )
        const roundCache = new Map<string, number>()
        const visiting = new Set<string>()

        const getRound = (match: CombinedMatch): number => {
            const cached = roundCache.get(match.key)
            if (cached !== undefined) {
                return cached
            }

            if (visiting.has(match.key)) {
                return 1
            }

            visiting.add(match.key)

            const refs = [match.homeSource, match.awaySource]
            const parentRounds: number[] = []

            for (const ref of refs) {
                if (
                    (ref.kind !== "winner" && ref.kind !== "loser") ||
                    ref.value === null
                ) {
                    continue
                }

                const referenced = matchByNum.get(ref.value)
                if (!referenced || referenced.section !== section) {
                    continue
                }

                parentRounds.push(getRound(referenced))
            }

            const round =
                parentRounds.length > 0 ? Math.max(...parentRounds) + 1 : 1
            roundCache.set(match.key, round)
            visiting.delete(match.key)
            return round
        }

        for (const match of sectionMatches) {
            match.round = getRound(match)
        }
    }
}

interface LabelContext {
    teamLabelById: Map<number, string>
    teamLabelByNumber: Map<number, string>
    seedLabelBySeed: Map<number, string>
    matchByNum: Map<number, CombinedMatch>
}

function getTeamLabelById(teamId: number, context: LabelContext): string {
    return context.teamLabelById.get(teamId) || `Team ${teamId}`
}

function resolveReferenceLabel(
    source: ParsedSource,
    context: LabelContext
): string | null {
    if (source.kind === "none") {
        return null
    }

    if (source.kind === "seed" && source.value !== null) {
        return (
            context.seedLabelBySeed.get(source.value) || `Seed ${source.value}`
        )
    }

    if (source.kind === "team" && source.value !== null) {
        return (
            context.teamLabelByNumber.get(source.value) ||
            `Team #${source.value}`
        )
    }

    if (
        (source.kind === "winner" || source.kind === "loser") &&
        source.value !== null
    ) {
        const referenced = context.matchByNum.get(source.value)
        if (!referenced) {
            return `${source.kind === "winner" ? "Winner" : "Loser"} #${source.value}`
        }

        const winnerTeamId = getWinnerTeamId(referenced)
        if (source.kind === "winner") {
            if (winnerTeamId !== null) {
                return getTeamLabelById(winnerTeamId, context)
            }
            return `Winner #${source.value}`
        }

        const loserTeamId = getLoserTeamId(referenced, winnerTeamId)
        if (loserTeamId !== null) {
            return getTeamLabelById(loserTeamId, context)
        }
        return `Loser #${source.value}`
    }

    return source.normalized || source.raw || null
}

function resolveSideLabel(
    teamId: number | null,
    source: ParsedSource,
    context: LabelContext
): string {
    if (teamId !== null) {
        return getTeamLabelById(teamId, context)
    }

    return resolveReferenceLabel(source, context) || "TBD"
}

function buildBracketData(
    combinedMatches: CombinedMatch[],
    labelContext: LabelContext
): { upper: BracketMatch[]; lower: BracketMatch[] } | null {
    const numbered = combinedMatches.filter(
        (m): m is CombinedMatch & { matchNum: number } => m.matchNum !== null
    )
    if (numbered.length === 0) return null

    const bracketMatches: BracketMatch[] = numbered.map((m) => {
        const winnerTeamId = getWinnerTeamId(m)
        const wins = getGameWins(m)

        const homeLabel = resolveSideLabel(
            m.homeTeamId,
            m.homeSource,
            labelContext
        )
        const awayLabel = resolveSideLabel(
            m.awayTeamId,
            m.awaySource,
            labelContext
        )

        const homeIsWinner =
            winnerTeamId !== null && m.homeTeamId !== null
                ? winnerTeamId === m.homeTeamId
                : false

        const awayIsWinner =
            winnerTeamId !== null && m.awayTeamId !== null
                ? winnerTeamId === m.awayTeamId
                : false

        const hasResult = winnerTeamId !== null
        const state = hasResult ? "SCORE_DONE" : "NO_PARTY"

        const participants: BracketParticipant[] = [
            {
                id: m.homeTeamId?.toString() ?? `home-${m.matchNum}`,
                name: homeLabel,
                resultText:
                    wins.homeWins !== null ? wins.homeWins.toString() : null,
                isWinner: homeIsWinner,
                status: hasResult ? "PLAYED" : null
            },
            {
                id: m.awayTeamId?.toString() ?? `away-${m.matchNum}`,
                name: awayLabel,
                resultText:
                    wins.awayWins !== null ? wins.awayWins.toString() : null,
                isWinner: awayIsWinner,
                status: hasResult ? "PLAYED" : null
            }
        ]

        return {
            id: m.matchNum,
            name: `Match #${m.matchNum}`,
            nextMatchId: m.nextMatchNum,
            nextLooserMatchId: m.nextLoserMatchNum,
            tournamentRoundText: `R${m.round}`,
            startTime: m.date ?? "",
            state,
            participants,
            matchNum: m.matchNum,
            week: m.week,
            date: m.date,
            time: m.time,
            court: m.court,
            scoresDisplay: formatSetScoreDisplay(
                m,
                homeIsWinner ? true : awayIsWinner ? false : null
            ),
            homeSourceLabel: formatSourceLabel(m.homeSource),
            awaySourceLabel: formatSourceLabel(m.awaySource),
            workTeamLabel:
                m.workTeamId !== null
                    ? getTeamLabelById(m.workTeamId, labelContext)
                    : null
        }
    })

    // Upper = winners bracket + championship; Lower = losers bracket
    const upper = bracketMatches.filter((m) => {
        const cm = numbered.find((n) => n.matchNum === m.id)
        return cm?.section === "winners" || cm?.section === "championship"
    })
    const lower = bracketMatches.filter((m) => {
        const cm = numbered.find((n) => n.matchNum === m.id)
        return cm?.section === "losers"
    })

    if (upper.length === 0 && lower.length === 0) return null

    // Add BYE placeholder matches for teams with first-round byes.
    // The library uses an exponential spacing formula that assumes balanced
    // power-of-2 trees (each column has half the matches of the previous).
    // In 6-team brackets, seeds 1 and 2 have first-round byes, creating
    // equal-sized columns (2-2-1) that cause overlap. Adding BYE matches
    // makes it 4-2-1 which the layout algorithm handles correctly.
    let byeCounter = -1
    for (const cm of numbered) {
        if (cm.section !== "winners") continue

        const homeIsDirect =
            cm.homeSource.kind === "seed" || cm.homeSource.kind === "team"
        const awayIsDirect =
            cm.awaySource.kind === "seed" || cm.awaySource.kind === "team"
        const homeIsWinRef = cm.homeSource.kind === "winner"
        const awayIsWinRef = cm.awaySource.kind === "winner"

        // Only matches with one direct source (bye team) and one winner
        // reference need a BYE predecessor to balance the tree.
        if (!(homeIsDirect && awayIsWinRef) && !(awayIsDirect && homeIsWinRef))
            continue

        const byeSide = homeIsDirect ? "home" : "away"
        const byeTeamId = byeSide === "home" ? cm.homeTeamId : cm.awayTeamId
        const byeTeamLabel = resolveSideLabel(
            byeTeamId,
            byeSide === "home" ? cm.homeSource : cm.awaySource,
            labelContext
        )

        const byeId = byeCounter--
        upper.push({
            id: byeId,
            name: "BYE",
            nextMatchId: cm.matchNum,
            nextLooserMatchId: null,
            tournamentRoundText: "BYE",
            startTime: "",
            state: "WALK_OVER",
            participants: [
                {
                    id: byeTeamId?.toString() ?? `bye-team-${byeId}`,
                    name: byeTeamLabel,
                    resultText: null,
                    isWinner: true,
                    status: "WALK_OVER"
                },
                {
                    id: `bye-${byeId}`,
                    name: "BYE",
                    resultText: null,
                    isWinner: false,
                    status: "NO_SHOW"
                }
            ],
            matchNum: byeId,
            week: 0,
            date: null,
            time: null,
            court: null,
            scoresDisplay: "\u2014",
            homeSourceLabel: null,
            awaySourceLabel: null,
            workTeamLabel: null
        })
    }

    // Null out nextMatchId/nextLooserMatchId that reference matches not in the
    // bracket (e.g. an "if necessary" championship game that was never played).
    const allIds = new Set([...upper, ...lower].map((m) => m.id))
    for (const m of upper) {
        if (m.nextMatchId !== null && !allIds.has(m.nextMatchId))
            m.nextMatchId = null
        if (m.nextLooserMatchId !== null && !allIds.has(m.nextLooserMatchId))
            m.nextLooserMatchId = null
    }
    for (const m of lower) {
        if (m.nextMatchId !== null && !allIds.has(m.nextMatchId))
            m.nextMatchId = null
        if (m.nextLooserMatchId !== null && !allIds.has(m.nextLooserMatchId))
            m.nextLooserMatchId = null
    }

    return { upper, lower }
}

export async function getPlayoffData(seasonId: number): Promise<PlayoffData> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return {
            status: false,
            message: "Not authenticated.",
            seasonLabel: "",
            divisions: []
        }
    }

    if (!Number.isInteger(seasonId) || seasonId <= 0) {
        return {
            status: false,
            message: "Invalid season.",
            seasonLabel: "",
            divisions: []
        }
    }

    try {
        const [seasonRow] = await db
            .select({
                year: seasons.year,
                season: seasons.season
            })
            .from(seasons)
            .where(eq(seasons.id, seasonId))
            .limit(1)

        if (!seasonRow) {
            return {
                status: false,
                message: "Season not found.",
                seasonLabel: "",
                divisions: []
            }
        }

        const seasonLabel = `${seasonRow.season.charAt(0).toUpperCase() + seasonRow.season.slice(1)} ${seasonRow.year}`

        const [playoffMatchRows, metaRows] = await Promise.all([
            db
                .select({
                    id: matchs.id,
                    divisionId: matchs.division,
                    week: matchs.week,
                    date: matchs.date,
                    time: matchs.time,
                    court: matchs.court,
                    homeTeamId: matchs.home_team,
                    awayTeamId: matchs.away_team,
                    homeScore: matchs.home_score,
                    awayScore: matchs.away_score,
                    homeSet1Score: matchs.home_set1_score,
                    awaySet1Score: matchs.away_set1_score,
                    homeSet2Score: matchs.home_set2_score,
                    awaySet2Score: matchs.away_set2_score,
                    homeSet3Score: matchs.home_set3_score,
                    awaySet3Score: matchs.away_set3_score,
                    winnerTeamId: matchs.winner
                })
                .from(matchs)
                .where(
                    and(eq(matchs.season, seasonId), eq(matchs.playoff, true))
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
                    workTeamId: playoffMatchesMeta.work_team
                })
                .from(playoffMatchesMeta)
                .where(eq(playoffMatchesMeta.season, seasonId))
        ])

        const divisionIds = [
            ...new Set([
                ...playoffMatchRows.map((row) => row.divisionId),
                ...metaRows.map((row) => row.divisionId)
            ])
        ]

        if (divisionIds.length === 0) {
            return {
                status: true,
                seasonLabel,
                divisions: []
            }
        }

        const [teamRows, divisionRowsFromDb] = await Promise.all([
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
                .orderBy(divisions.level)
        ])

        const divisionRows = [...divisionRowsFromDb]
        const existingDivisionIds = new Set(
            divisionRows.map((division) => division.id)
        )
        for (const divisionId of divisionIds) {
            if (existingDivisionIds.has(divisionId)) {
                continue
            }
            divisionRows.push({
                id: divisionId,
                name: `Division ${divisionId}`,
                level: 999 + divisionId
            })
        }

        divisionRows.sort((a, b) => a.level - b.level)

        const allDivisions: PlayoffDivision[] = []
        const sectionLabels: Record<SectionKey, string> = {
            winners: "Winners Bracket",
            losers: "Losers Bracket",
            championship: "Championship"
        }

        for (const division of divisionRows) {
            const divisionTeams: TeamLookup[] = teamRows.filter(
                (team) => team.divisionId === division.id
            )
            const divisionMatches = playoffMatchRows.filter(
                (match) => match.divisionId === division.id
            )
            const divisionMeta = metaRows.filter(
                (meta) => meta.divisionId === division.id
            )

            const teamLabelById = new Map<number, string>()
            const teamLabelByNumber = new Map<number, string>()
            for (const team of divisionTeams) {
                const teamLabel =
                    team.number !== null
                        ? `#${team.number} ${team.name}`
                        : team.name

                teamLabelById.set(team.id, teamLabel)
                if (team.number !== null) {
                    teamLabelByNumber.set(team.number, teamLabel)
                }
            }

            const metaByMatchId = new Map<
                number,
                (typeof divisionMeta)[number]
            >()

            for (const meta of divisionMeta) {
                if (meta.matchId !== null && !metaByMatchId.has(meta.matchId)) {
                    metaByMatchId.set(meta.matchId, meta)
                }
            }

            const usedMetaIds = new Set<number>()
            const combinedMatches: CombinedMatch[] = []

            for (const match of divisionMatches) {
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
                    metaBracket: meta?.bracket || null,
                    section: null,
                    round: 1,
                    nextMatchNum: meta?.nextMatchNum ?? null,
                    nextLoserMatchNum: meta?.nextLoserMatchNum ?? null
                })
            }

            for (const meta of divisionMeta) {
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
                    metaBracket: meta.bracket || null,
                    section: null,
                    round: 1,
                    nextMatchNum: meta.nextMatchNum ?? null,
                    nextLoserMatchNum: meta.nextLoserMatchNum ?? null
                })
            }

            combinedMatches.sort((a, b) => {
                const matchNumA = a.matchNum ?? Number.MAX_SAFE_INTEGER
                const matchNumB = b.matchNum ?? Number.MAX_SAFE_INTEGER
                if (matchNumA !== matchNumB) {
                    return matchNumA - matchNumB
                }
                return compareChronological(a, b)
            })

            classifySections(combinedMatches)
            assignRounds(combinedMatches)

            const matchByNum = new Map<number, CombinedMatch>()
            for (const match of combinedMatches) {
                if (
                    match.matchNum !== null &&
                    !matchByNum.has(match.matchNum)
                ) {
                    matchByNum.set(match.matchNum, match)
                }
            }

            const seedNumbers = new Set<number>()
            const seedLabelBySeed = new Map<number, string>()
            for (const match of combinedMatches) {
                if (
                    match.homeSource.kind === "seed" &&
                    match.homeSource.value !== null
                ) {
                    seedNumbers.add(match.homeSource.value)
                    if (match.homeTeamId !== null) {
                        seedLabelBySeed.set(
                            match.homeSource.value,
                            teamLabelById.get(match.homeTeamId) ||
                                `Team ${match.homeTeamId}`
                        )
                    }
                }

                if (
                    match.awaySource.kind === "seed" &&
                    match.awaySource.value !== null
                ) {
                    seedNumbers.add(match.awaySource.value)
                    if (match.awayTeamId !== null) {
                        seedLabelBySeed.set(
                            match.awaySource.value,
                            teamLabelById.get(match.awayTeamId) ||
                                `Team ${match.awayTeamId}`
                        )
                    }
                }
            }

            const labelContext: LabelContext = {
                teamLabelById,
                teamLabelByNumber,
                seedLabelBySeed,
                matchByNum
            }

            const lineByKey = new Map<string, PlayoffMatchLine>()
            for (const match of combinedMatches) {
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

                lineByKey.set(match.key, {
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
                    homeSourceLabel: formatSourceLabel(match.homeSource),
                    awaySourceLabel: formatSourceLabel(match.awaySource),
                    workAssignmentLabel:
                        match.workTeamId !== null
                            ? getTeamLabelById(match.workTeamId, labelContext)
                            : null,
                    round: match.round
                })
            }

            const sections: PlayoffSection[] = []
            const sectionOrder: SectionKey[] = [
                "winners",
                "losers",
                "championship"
            ]

            for (const sectionKey of sectionOrder) {
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
                        matches: [...roundMatches].sort(
                            compareLineChronological
                        )
                    }))

                sections.push({
                    key: sectionKey,
                    label: sectionLabels[sectionKey],
                    rounds
                })
            }

            const scheduleMatches = [...lineByKey.values()].sort(
                compareLineChronological
            )
            const resultsMatches = scheduleMatches.filter(
                (match) =>
                    match.winnerLabel !== null ||
                    match.winnerGames !== null ||
                    match.loserGames !== null ||
                    match.scoresDisplay !== "—"
            )

            const championshipWinnerId = [...combinedMatches]
                .filter((match) => match.section === "championship")
                .sort((a, b) => {
                    if (a.round !== b.round) {
                        return b.round - a.round
                    }

                    const matchNumA = a.matchNum ?? -1
                    const matchNumB = b.matchNum ?? -1
                    return matchNumB - matchNumA
                })
                .map((match) => getWinnerTeamId(match))
                .find((teamId): teamId is number => teamId !== null)

            const fallbackChampionId =
                championshipWinnerId ||
                [...combinedMatches]
                    .sort((a, b) => {
                        const matchNumA = a.matchNum ?? -1
                        const matchNumB = b.matchNum ?? -1
                        return matchNumB - matchNumA
                    })
                    .map((match) => getWinnerTeamId(match))
                    .find((teamId): teamId is number => teamId !== null) ||
                null

            const champion =
                fallbackChampionId !== null
                    ? getTeamLabelById(fallbackChampionId, labelContext)
                    : null

            const seeds: PlayoffSeed[] = [...seedNumbers]
                .sort((a, b) => a - b)
                .map((seedNum) => ({
                    seed: seedNum,
                    teamLabel: seedLabelBySeed.get(seedNum) || `Seed ${seedNum}`
                }))

            const bracketMatches = buildBracketData(
                combinedMatches,
                labelContext
            )

            allDivisions.push({
                id: division.id,
                name: division.name,
                level: division.level,
                champion,
                seeds,
                sections,
                scheduleMatches,
                resultsMatches,
                bracketMatches
            })
        }

        return {
            status: true,
            seasonLabel,
            divisions: allDivisions
        }
    } catch (error) {
        console.error("Error fetching playoff data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            seasonLabel: "",
            divisions: []
        }
    }
}
