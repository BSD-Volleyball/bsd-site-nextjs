// Converts a classified division playoff into the { upper, lower } shape the
// bracket visualisation renders. Pure.

import type {
    BracketMatch,
    BracketParticipant
} from "@/lib/playoff-bracket-types"
import {
    formatSourceShortLabel,
    type ParsedSource
} from "@/lib/playoff-sources"
import {
    formatSetScoreDisplay,
    getGameWins,
    getWinnerTeamId
} from "./match-results"
import { type LabelContext, resolveSideLabel, resolveWorkLabel } from "./labels"
import { type CombinedMatch, sourceRefIsWin, sourceRefMatch } from "./structure"

export type EffectiveTeamResolver = (
    teamId: number | null,
    source: ParsedSource
) => number | null

/**
 * Upper = winners bracket + championship; lower = losers bracket. Only
 * numbered matches appear. Returns null when nothing is numbered.
 *
 * Two adjustments for the layout library:
 * - a winners match fed by one direct (seed/team) side and one winner
 *   reference gets a synthetic BYE predecessor (negative id), so a 6-team
 *   bracket's 2-2-1 columns become a balanced 4-2-1;
 * - forward refs (nextMatchId / nextLooserMatchId) pointing at a match not
 *   in the bracket (e.g. an "if necessary" final that was pruned) are nulled.
 */
export function buildBracketData(
    combinedMatches: CombinedMatch[],
    labelContext: LabelContext,
    resolveEffective: EffectiveTeamResolver = (teamId) => teamId
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
            homeSourceLabel: formatSourceShortLabel(m.homeSource),
            awaySourceLabel: formatSourceShortLabel(m.awaySource),
            workTeamLabel: resolveWorkLabel(
                m.workTeamId,
                m.workSource,
                labelContext
            ),
            homeTeamId: resolveEffective(m.homeTeamId, m.homeSource),
            awayTeamId: resolveEffective(m.awayTeamId, m.awaySource),
            workTeamId: resolveEffective(m.workTeamId, m.workSource),
            homeSourceRefMatch: sourceRefMatch(m.homeSource),
            homeSourceRefIsWin: sourceRefIsWin(m.homeSource),
            awaySourceRefMatch: sourceRefMatch(m.awaySource),
            awaySourceRefIsWin: sourceRefIsWin(m.awaySource),
            workSourceRefMatch: sourceRefMatch(m.workSource),
            workSourceRefIsWin: sourceRefIsWin(m.workSource)
        }
    })

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
            scoresDisplay: "—",
            homeSourceLabel: null,
            awaySourceLabel: null,
            workTeamLabel: null,
            homeTeamId: byeSide === "home" ? byeTeamId : null,
            awayTeamId: byeSide === "away" ? byeTeamId : null,
            workTeamId: null,
            homeSourceRefMatch: null,
            homeSourceRefIsWin: null,
            awaySourceRefMatch: null,
            awaySourceRefIsWin: null,
            workSourceRefMatch: null,
            workSourceRefIsWin: null
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
