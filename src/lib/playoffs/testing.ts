// Fixture builders for the playoffs unit tests.

import { parseSourceToken } from "@/lib/playoff-sources"
import type { CombinedMatch } from "./structure"

type CombinedOverrides = Partial<
    Omit<CombinedMatch, "homeSource" | "awaySource" | "workSource">
> & {
    home?: string | null
    away?: string | null
    work?: string | null
}

/** A CombinedMatch with every score empty; sources given as raw tokens. */
export function combined(overrides: CombinedOverrides = {}): CombinedMatch {
    const { home = null, away = null, work = null, ...rest } = overrides
    const matchNum = rest.matchNum === undefined ? null : rest.matchNum
    return {
        key: `meta-${matchNum ?? "x"}`,
        id: null,
        week: 1,
        date: null,
        time: null,
        court: null,
        matchNum,
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
        workTeamId: null,
        metaBracket: null,
        section: null,
        round: 1,
        nextMatchNum: null,
        nextLoserMatchNum: null,
        ...rest,
        homeSource: parseSourceToken(home),
        awaySource: parseSourceToken(away),
        workSource: parseSourceToken(work)
    }
}
