// Source-resolution helpers shared between the playoff page action and the
// dashboard's playoff next-match card.

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
        return { raw: null, normalized: null, kind: "none", value: null }
    }

    const normalized = source.trim().replace(/^"|"$/g, "").toUpperCase()
    if (!normalized) {
        return { raw: source, normalized: null, kind: "none", value: null }
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

    return { raw: source, normalized, kind: "unknown", value: null }
}

// Lean per-match shape needed to evaluate "could team T be involved here?"
// without dragging in the route's full CombinedMatch type.
export interface PlayoffNode {
    matchNum: number
    week: number
    homeSource: ParsedSource
    awaySource: ParsedSource
    workSource: ParsedSource
    homeTeamId: number | null
    awayTeamId: number | null
    workTeamId: number | null
    winnerTeamId: number | null
    loserTeamId: number | null
}

export interface ResolutionContext {
    seedTeamIdByNumber: Map<number, number>
    nodeByMatchNum: Map<number, PlayoffNode>
    teamNumberById: Map<number, number>
}

interface SourceMatchResult {
    contains: boolean
    // null when the team is the deterministic resolution; otherwise a human
    // string describing the outcome chain required, e.g. "If you win match 1".
    condition: string | null
}

const NO_MATCH: SourceMatchResult = { contains: false, condition: null }

export function sourceContainsTeam(
    source: ParsedSource,
    teamId: number,
    ctx: ResolutionContext,
    seenMatchNums: Set<number> = new Set()
): SourceMatchResult {
    if (source.kind === "none" || source.value === null) return NO_MATCH

    if (source.kind === "seed") {
        return ctx.seedTeamIdByNumber.get(source.value) === teamId
            ? { contains: true, condition: null }
            : NO_MATCH
    }

    if (source.kind === "team") {
        // "team" means a direct team number reference.
        const teamNumber = ctx.teamNumberById.get(teamId)
        return teamNumber === source.value
            ? { contains: true, condition: null }
            : NO_MATCH
    }

    if (source.kind === "winner" || source.kind === "loser") {
        const refMatchNum = source.value
        if (seenMatchNums.has(refMatchNum)) return NO_MATCH

        const node = ctx.nodeByMatchNum.get(refMatchNum)
        if (!node) return NO_MATCH

        // If the upstream match has decided a winner, we know definitively.
        if (node.winnerTeamId !== null && node.loserTeamId !== null) {
            const referenced =
                source.kind === "winner" ? node.winnerTeamId : node.loserTeamId
            return referenced === teamId
                ? { contains: true, condition: null }
                : NO_MATCH
        }

        // Otherwise the team participates iff it could play match refMatchNum
        // at all, and we tag the condition with the required outcome.
        const nextSeen = new Set(seenMatchNums)
        nextSeen.add(refMatchNum)
        const homeCheck = sourceContainsTeam(
            node.homeSource,
            teamId,
            ctx,
            nextSeen
        )
        const awayCheck = sourceContainsTeam(
            node.awaySource,
            teamId,
            ctx,
            nextSeen
        )
        if (!homeCheck.contains && !awayCheck.contains) return NO_MATCH

        const upstream = homeCheck.contains ? homeCheck : awayCheck
        const verb = source.kind === "winner" ? "win" : "lose"
        const ownCondition = `If you ${verb} match ${refMatchNum}`
        const condition = upstream.condition
            ? `${upstream.condition} and ${verb} match ${refMatchNum}`
            : ownCondition
        return { contains: true, condition }
    }

    return NO_MATCH
}

// Resolve the "other side" of a match into a label. Mirrors the route's
// resolveReferenceLabel but operates on the lean PlayoffNode graph.
export function resolveOpponentLabel(
    source: ParsedSource,
    ctx: ResolutionContext,
    teamLabelById: Map<number, string>
): string {
    if (source.kind === "none" || source.value === null) return "TBD"

    if (source.kind === "seed") {
        const teamId = ctx.seedTeamIdByNumber.get(source.value)
        if (teamId !== undefined) {
            return teamLabelById.get(teamId) || `Seed ${source.value}`
        }
        return `Seed ${source.value}`
    }

    if (source.kind === "team") {
        return `Team #${source.value}`
    }

    if (source.kind === "winner" || source.kind === "loser") {
        const node = ctx.nodeByMatchNum.get(source.value)
        if (node) {
            if (source.kind === "winner" && node.winnerTeamId !== null) {
                return (
                    teamLabelById.get(node.winnerTeamId) ||
                    `Winner #${source.value}`
                )
            }
            if (source.kind === "loser" && node.loserTeamId !== null) {
                return (
                    teamLabelById.get(node.loserTeamId) ||
                    `Loser #${source.value}`
                )
            }
        }
        return source.kind === "winner"
            ? `Winner of #${source.value}`
            : `Loser of #${source.value}`
    }

    return source.normalized || source.raw || "TBD"
}

export interface TeamNodeItem {
    role: "play" | "work"
    // null when the team is certain to be there; otherwise the outcome chain
    // required, e.g. "If you win match 1".
    condition: string | null
    // Play rows only: the other side, e.g. "#2 Spikers" or "Winner of #3".
    opponentLabel: string | null
}

// What a team could be doing in one bracket match: a play row if either side
// can resolve to it, and a work row if the work source can. Both appear for a
// match the team plays if it wins one earlier match and works if it loses.
export function teamItemsForNode(
    node: PlayoffNode,
    teamId: number,
    ctx: ResolutionContext,
    teamLabelById: Map<number, string>
): TeamNodeItem[] {
    const items: TeamNodeItem[] = []
    const playHome = sourceContainsTeam(node.homeSource, teamId, ctx)
    const playAway = sourceContainsTeam(node.awaySource, teamId, ctx)
    if (playHome.contains || playAway.contains) {
        const side = playHome.contains ? playHome : playAway
        items.push({
            role: "play",
            condition: side.condition,
            opponentLabel: resolveOpponentLabel(
                playHome.contains ? node.awaySource : node.homeSource,
                ctx,
                teamLabelById
            )
        })
    }
    const work = sourceContainsTeam(node.workSource, teamId, ctx)
    if (work.contains) {
        items.push({
            role: "work",
            condition: work.condition,
            opponentLabel: null
        })
    }
    return items
}
