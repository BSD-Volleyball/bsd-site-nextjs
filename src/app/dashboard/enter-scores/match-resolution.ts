import {
    formatSourceHumanLabel,
    parseSourceToken,
    resolveSourceToTeamId
} from "@/lib/playoff-sources"
import type { DivisionMatchGroup, MatchScoreData } from "./actions"
import type { MatchFormState } from "./match-form-state"

export interface ResolvedMatchInfo {
    homeTeamId: number | null
    awayTeamId: number | null
    homeTeamName: string
    awayTeamName: string
    homeIsResolved: boolean
    awayIsResolved: boolean
    homeLockLabel: string | null
    awayLockLabel: string | null
    isLocked: boolean
}

export function emptyResolved(match: MatchScoreData): ResolvedMatchInfo {
    return {
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        homeTeamName: match.homeTeamName,
        awayTeamName: match.awayTeamName,
        homeIsResolved: match.homeTeamId !== null,
        awayIsResolved: match.awayTeamId !== null,
        homeLockLabel: null,
        awayLockLabel: null,
        isLocked: false
    }
}

// Compute the effective (resolved) team IDs and lock state for every match in
// a division, using the current form state. Iterates to a fixed point so that
// chained dependencies (W of a match whose W depends on another W) all
// resolve in one render.
export function computeResolvedMatches(
    division: DivisionMatchGroup,
    formStates: Record<number, MatchFormState>
): Map<number, ResolvedMatchInfo> {
    const result = new Map<number, ResolvedMatchInfo>()
    for (const m of division.matches) {
        result.set(m.matchId, emptyResolved(m))
    }

    const seedToTeamId = new Map<number, number>()
    for (const [seedStr, teamId] of Object.entries(division.seedToTeamId)) {
        seedToTeamId.set(Number(seedStr), teamId)
    }

    const hasAnySource = division.matches.some(
        (m) => m.homeSource !== null || m.awaySource !== null
    )
    if (!hasAnySource) return result

    for (let iter = 0; iter < 8; iter++) {
        const winnerByMatchNum = new Map<number, number>()
        const loserByMatchNum = new Map<number, number>()

        for (const m of division.matches) {
            if (m.playoffMatchNum === null) continue
            const info = result.get(m.matchId)
            if (!info) continue
            const form = formStates[m.matchId]
            const winner = form?.winner ?? null
            if (
                winner !== null &&
                info.homeTeamId !== null &&
                info.awayTeamId !== null &&
                (winner === info.homeTeamId || winner === info.awayTeamId)
            ) {
                winnerByMatchNum.set(m.playoffMatchNum, winner)
                loserByMatchNum.set(
                    m.playoffMatchNum,
                    winner === info.homeTeamId
                        ? info.awayTeamId
                        : info.homeTeamId
                )
            }
        }

        const ctx = {
            seedToTeamId,
            winnerByMatchNum,
            loserByMatchNum
        }

        let changed = false
        for (const m of division.matches) {
            if (m.homeSource === null && m.awaySource === null) continue
            const info = result.get(m.matchId)
            if (!info) continue

            const parsedHome = parseSourceToken(m.homeSource)
            const parsedAway = parseSourceToken(m.awaySource)

            if (info.homeTeamId === null) {
                const resolved = resolveSourceToTeamId(parsedHome, ctx)
                if (resolved !== null) {
                    const name =
                        division.teamNameById[resolved] ?? `Team ${resolved}`
                    info.homeTeamId = resolved
                    info.homeTeamName = name
                    info.homeIsResolved = true
                    changed = true
                } else {
                    const label = formatSourceHumanLabel(parsedHome)
                    if (label && info.homeLockLabel !== label) {
                        info.homeLockLabel = label
                    }
                }
            }
            if (info.awayTeamId === null) {
                const resolved = resolveSourceToTeamId(parsedAway, ctx)
                if (resolved !== null) {
                    const name =
                        division.teamNameById[resolved] ?? `Team ${resolved}`
                    info.awayTeamId = resolved
                    info.awayTeamName = name
                    info.awayIsResolved = true
                    changed = true
                } else {
                    const label = formatSourceHumanLabel(parsedAway)
                    if (label && info.awayLockLabel !== label) {
                        info.awayLockLabel = label
                    }
                }
            }
        }
        if (!changed) break
    }

    for (const m of division.matches) {
        const info = result.get(m.matchId)
        if (!info) continue
        const hasSource = m.homeSource !== null || m.awaySource !== null
        if (hasSource) {
            info.isLocked = info.homeTeamId === null || info.awayTeamId === null
        }
    }

    return result
}
