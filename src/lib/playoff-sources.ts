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
