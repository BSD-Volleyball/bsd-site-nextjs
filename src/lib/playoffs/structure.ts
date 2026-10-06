// Bracket shape for one division's playoff: which section (winners, losers,
// championship) each match belongs to and which round within it. Pure.
//
// Inputs are the division's playoff matches merged with their
// playoff_matches_meta rows. Forward references ("W3", "L7") are what tie
// the graph together; meta rows can be missing a bracket value (legacy
// imports), so the section is inferred from the reference graph when the
// stored value is absent.

import { parseTimeForSort } from "@/lib/season-utils"
import { isWinnerLoserReset, type ParsedSource } from "@/lib/playoff-sources"
import type { PlayoffMatchScores } from "./match-results"

export type SectionKey = "winners" | "losers" | "championship"

export const SECTION_ORDER: SectionKey[] = ["winners", "losers", "championship"]

export const SECTION_LABELS: Record<SectionKey, string> = {
    winners: "Winners Bracket",
    losers: "Losers Bracket",
    championship: "Championship"
}

/**
 * One playoff match as the page sees it: a scheduled `matches` row with its
 * meta (key `match-<id>`), or a meta-only row with nothing scheduled yet
 * (key `meta-<id>`). `section` and `round` are filled in by
 * classifySections() and assignRounds().
 */
export interface CombinedMatch extends PlayoffMatchScores {
    key: string
    id: number | null
    week: number
    date: string | null
    time: string | null
    court: number | null
    matchNum: number | null
    homeSource: ParsedSource
    awaySource: ParsedSource
    workTeamId: number | null
    workSource: ParsedSource
    metaBracket: string | null
    section: SectionKey | null
    round: number
    nextMatchNum: number | null
    nextLoserMatchNum: number | null
}

type Chronological = {
    week: number
    time: string | null
    court: number | null
    matchNum: number | null
}

/** Week, then start time, then court, then match number; nulls sort last. */
export function compareChronological(
    a: Chronological,
    b: Chronological
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

/** Match number first (unnumbered last), then chronological. */
export function compareByMatchNum(a: Chronological, b: Chronological): number {
    const matchNumA = a.matchNum ?? Number.MAX_SAFE_INTEGER
    const matchNumB = b.matchNum ?? Number.MAX_SAFE_INTEGER
    if (matchNumA !== matchNumB) {
        return matchNumA - matchNumB
    }
    return compareChronological(a, b)
}

/** First match carrying each match number; later duplicates are ignored. */
export function indexByMatchNum<T extends { matchNum: number | null }>(
    matches: T[]
): Map<number, T> {
    const matchByNum = new Map<number, T>()
    for (const match of matches) {
        if (match.matchNum !== null && !matchByNum.has(match.matchNum)) {
            matchByNum.set(match.matchNum, match)
        }
    }
    return matchByNum
}

/**
 * Assigns `section` on every match, in place.
 *
 * 1. Direct evidence: a W<n>/L<n> pair of the same match is the reset final
 *    (championship); otherwise the stored bracket ("winners"/"losers"); a
 *    loser reference means losers; a seed or team source means winners.
 * 2. Up to eight passes propagating along forward references: a match fed
 *    by both brackets is championship, one fed only by one section joins it.
 * 3. Anything still unset falls back to championship/losers/winners.
 */
export function classifySections(matches: CombinedMatch[]): void {
    const matchByNum = indexByMatchNum(matches)

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

/**
 * Assigns `round` on every match, in place: one more than the deepest
 * same-section match it references, or 1 when it references none (a
 * reference into another section does not count). Cycles resolve to 1.
 */
export function assignRounds(matches: CombinedMatch[]): void {
    const matchByNum = indexByMatchNum(matches)

    for (const section of SECTION_ORDER) {
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

/** The match number a W<n>/L<n> source points at, else null. */
export function sourceRefMatch(source: ParsedSource): number | null {
    return source.kind === "winner" || source.kind === "loser"
        ? source.value
        : null
}

/** true for a winner reference, false for a loser reference, else null. */
export function sourceRefIsWin(source: ParsedSource): boolean | null {
    return source.kind === "winner"
        ? true
        : source.kind === "loser"
          ? false
          : null
}
