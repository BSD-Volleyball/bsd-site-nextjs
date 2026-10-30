export type SourceKind =
    | "none"
    | "seed"
    | "winner"
    | "loser"
    | "team"
    | "unknown"

export interface ParsedSource {
    raw: string | null
    normalized: string | null
    kind: SourceKind
    value: number | null
}

export function parseSourceToken(source: string | null): ParsedSource {
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

export function formatSourceShortLabel(source: ParsedSource): string | null {
    if (source.kind === "none") return null
    if (source.kind === "seed" && source.value !== null)
        return `S${source.value}`
    if (source.kind === "winner" && source.value !== null)
        return `W${source.value}`
    if (source.kind === "loser" && source.value !== null)
        return `L${source.value}`
    if (source.kind === "team" && source.value !== null)
        return `#${source.value}`
    return source.normalized || source.raw || null
}

export function formatSourceHumanLabel(source: ParsedSource): string | null {
    if (source.kind === "none") return null
    if (source.kind === "seed" && source.value !== null)
        return `Seed ${source.value}`
    if (source.kind === "winner" && source.value !== null)
        return `Winner of M${source.value}`
    if (source.kind === "loser" && source.value !== null)
        return `Loser of M${source.value}`
    if (source.kind === "team" && source.value !== null)
        return `Team #${source.value}`
    return source.normalized || source.raw || null
}

export function isWinnerLoserReset(
    home: ParsedSource,
    away: ParsedSource
): boolean {
    if (home.value === null || away.value === null) {
        return false
    }

    const isPair =
        (home.kind === "winner" && away.kind === "loser") ||
        (home.kind === "loser" && away.kind === "winner")

    return isPair && home.value === away.value
}

/**
 * For a reset final (Winner of M10 vs Loser of M10): which side of the first
 * final arrives unbeaten, built only from seeds and winners, never a loser.
 * The reset is played only if the OTHER side wins the first final. null when
 * the match is not a reset, or the bracket does not tell the sides apart.
 */
export function resetFinalUnbeatenSide(
    home: ParsedSource,
    away: ParsedSource,
    matchByNum: Map<number, BracketMatchRef>
): { firstMatchNum: number; unbeaten: "home" | "away" } | null {
    if (!isWinnerLoserReset(home, away) || home.value === null) return null
    const first = matchByNum.get(home.value)
    if (!first) return null
    const isUnbeaten = (source: ParsedSource, seen: Set<number>): boolean => {
        if (source.kind === "seed" || source.kind === "team") return true
        if (source.kind !== "winner" || source.value === null) return false
        if (seen.has(source.value)) return false
        const m = matchByNum.get(source.value)
        if (!m) return false
        const next = new Set(seen).add(source.value)
        return isUnbeaten(m.homeSource, next) && isUnbeaten(m.awaySource, next)
    }
    const seen = new Set([home.value])
    const homeUnbeaten = isUnbeaten(first.homeSource, seen)
    const awayUnbeaten = isUnbeaten(first.awaySource, seen)
    if (homeUnbeaten === awayUnbeaten) return null
    return {
        firstMatchNum: home.value,
        unbeaten: homeUnbeaten ? "home" : "away"
    }
}

interface ResolveContext {
    seedToTeamId: Map<number, number>
    winnerByMatchNum: Map<number, number>
    loserByMatchNum: Map<number, number>
}

export function resolveSourceToTeamId(
    source: ParsedSource,
    ctx: ResolveContext
): number | null {
    if (source.kind === "team" && source.value !== null) {
        return source.value
    }
    if (source.kind === "seed" && source.value !== null) {
        return ctx.seedToTeamId.get(source.value) ?? null
    }
    if (source.kind === "winner" && source.value !== null) {
        return ctx.winnerByMatchNum.get(source.value) ?? null
    }
    if (source.kind === "loser" && source.value !== null) {
        return ctx.loserByMatchNum.get(source.value) ?? null
    }
    return null
}

export interface BracketMatchRef {
    matchNum: number
    homeSource: ParsedSource
    awaySource: ParsedSource
}

export function collectPossibleTeams(
    source: ParsedSource,
    ctx: ResolveContext,
    matchByNum: Map<number, BracketMatchRef>,
    depth = 0
): Set<number> {
    const out = new Set<number>()
    if (depth > 16) return out

    const direct = resolveSourceToTeamId(source, ctx)
    if (direct !== null) {
        out.add(direct)
        return out
    }

    if (
        (source.kind === "winner" || source.kind === "loser") &&
        source.value !== null
    ) {
        const parent = matchByNum.get(source.value)
        if (parent) {
            for (const t of collectPossibleTeams(
                parent.homeSource,
                ctx,
                matchByNum,
                depth + 1
            )) {
                out.add(t)
            }
            for (const t of collectPossibleTeams(
                parent.awaySource,
                ctx,
                matchByNum,
                depth + 1
            )) {
                out.add(t)
            }
        }
    }

    return out
}
