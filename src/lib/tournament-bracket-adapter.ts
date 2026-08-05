/**
 * Adapts tournament_matches bracket rows to the { upper, lower } BracketMatch
 * shape that BracketView (the season playoff bracket component) renders.
 *
 * Tournament brackets store topology implicitly as
 * (bracket: 'winners' | 'losers' | 'final', bracket_round, bracket_slot);
 * this module synthesizes stable match numbers and next-match links using the
 * same advancement rules as src/lib/tournament-brackets/progression.ts:
 *   - winners (r, s) -> (r + 1, ceil(s / 2)); champion -> grand final
 *   - losers (r, s) -> (r + 1, r even ? ceil(s / 2) : s); champion -> final
 *   - winners losers drop: round 1 -> L1 slot ceil(s / 2), round r>=2 -> L(2r-2) slot s
 * Round-one byes are materialized rows (one team, pre-set winner), so unlike
 * the season builder no placeholder synthesis is needed to balance columns.
 */

import type {
    BracketMatch,
    BracketParticipant
} from "@/lib/playoff-bracket-types"

export interface TournamentBracketRow {
    id: number
    bracket: string
    bracketRound: number | null
    bracketSlot: number | null
    court: number | null
    startTime: string | null
    homeTeamId: number | null
    awayTeamId: number | null
    homeSet1: number | null
    awaySet1: number | null
    homeSet2: number | null
    awaySet2: number | null
    homeSet3: number | null
    awaySet3: number | null
    winnerTeamId: number | null
}

interface NumberedRow extends TournamentBracketRow {
    matchNum: number
    round: number
    slot: number
}

function setWins(row: TournamentBracketRow): {
    home: number | null
    away: number | null
} {
    let home = 0
    let away = 0
    let played = 0
    for (const [h, a] of [
        [row.homeSet1, row.awaySet1],
        [row.homeSet2, row.awaySet2],
        [row.homeSet3, row.awaySet3]
    ]) {
        if (h === null || a === null || (h === 0 && a === 0)) continue
        played++
        if (h > a) home++
        else if (a > h) away++
    }
    if (played === 0) return { home: null, away: null }
    return { home, away }
}

function scoresDisplay(row: TournamentBracketRow): string {
    const sets: string[] = []
    for (const [h, a] of [
        [row.homeSet1, row.awaySet1],
        [row.homeSet2, row.awaySet2],
        [row.homeSet3, row.awaySet3]
    ]) {
        if (h === null || a === null || (h === 0 && a === 0)) continue
        sets.push(`${h}-${a}`)
    }
    return sets.length > 0 ? sets.join("  ") : "—"
}

/**
 * Build BracketView input for one tournament division. Returns null when the
 * division has no bracket rows.
 */
export function buildTournamentBracket(
    rows: TournamentBracketRow[],
    teamNames: Map<number, string>,
    tournamentDate: string | null
): { upper: BracketMatch[]; lower: BracketMatch[] } | null {
    const bracketRows = rows.filter(
        (r) =>
            r.bracket !== "pool" &&
            r.bracketRound !== null &&
            r.bracketSlot !== null
    )
    if (bracketRows.length === 0) return null

    const byPosition = (a: NumberedRow, b: NumberedRow) =>
        a.round - b.round || a.slot - b.slot

    const winners: NumberedRow[] = []
    const losers: NumberedRow[] = []
    const finals: NumberedRow[] = []
    for (const r of bracketRows) {
        const numbered: NumberedRow = {
            ...r,
            matchNum: 0,
            round: r.bracketRound as number,
            slot: r.bracketSlot as number
        }
        if (r.bracket === "winners") winners.push(numbered)
        else if (r.bracket === "losers") losers.push(numbered)
        else finals.push(numbered)
    }
    winners.sort(byPosition)
    losers.sort(byPosition)
    finals.sort(byPosition)

    let num = 1
    for (const m of [...winners, ...losers, ...finals]) {
        m.matchNum = num++
    }

    const winnersByPos = new Map<string, NumberedRow>()
    for (const m of winners) winnersByPos.set(`${m.round}:${m.slot}`, m)
    const losersByPos = new Map<string, NumberedRow>()
    for (const m of losers) losersByPos.set(`${m.round}:${m.slot}`, m)
    const finalsByPos = new Map<string, NumberedRow>()
    for (const m of finals) finalsByPos.set(`${m.round}:${m.slot}`, m)

    const winnersMaxRound = Math.max(0, ...winners.map((m) => m.round))
    const losersMaxRound = Math.max(0, ...losers.map((m) => m.round))
    // Double elim: the sole 'final' row that no winners round advances into
    // by position is the grand final (seeded as bracket_round 1, slot 1).
    const grandFinal =
        finals.length === 1 &&
        !finalsByPos.has(`${winnersMaxRound + 1}:1`) &&
        losers.length > 0
            ? finals[0]
            : null

    const nextForWinners = (m: NumberedRow): number | null => {
        const key = `${m.round + 1}:${Math.ceil(m.slot / 2)}`
        return (
            winnersByPos.get(key)?.matchNum ??
            finalsByPos.get(key)?.matchNum ??
            (m.round === winnersMaxRound
                ? (grandFinal?.matchNum ?? null)
                : null)
        )
    }
    const loserDropForWinners = (m: NumberedRow): number | null => {
        if (losers.length === 0) return null
        const key =
            m.round === 1
                ? `1:${Math.ceil(m.slot / 2)}`
                : `${2 * m.round - 2}:${m.slot}`
        return losersByPos.get(key)?.matchNum ?? null
    }
    const nextForLosers = (m: NumberedRow): number | null => {
        const nextSlot = m.round % 2 === 0 ? Math.ceil(m.slot / 2) : m.slot
        return (
            losersByPos.get(`${m.round + 1}:${nextSlot}`)?.matchNum ??
            (m.round === losersMaxRound ? (grandFinal?.matchNum ?? null) : null)
        )
    }

    const feederLabel = (m: NumberedRow, side: "home" | "away"): string => {
        // Home slot is fed by the odd feeder slot, away by the even one.
        const feederSlot = side === "home" ? m.slot * 2 - 1 : m.slot * 2
        if (m.bracket === "winners" || m.bracket === "final") {
            const feeder = winnersByPos.get(`${m.round - 1}:${feederSlot}`)
            if (feeder) return `Winner Match #${feeder.matchNum}`
        }
        return "TBD"
    }

    const toBracketMatch = (
        m: NumberedRow,
        nextMatchId: number | null,
        nextLooserMatchId: number | null
    ): BracketMatch => {
        const wins = setWins(m)
        const isBye =
            m.round === 1 &&
            m.winnerTeamId !== null &&
            (m.homeTeamId === null) !== (m.awayTeamId === null)
        const hasResult = m.winnerTeamId !== null

        const participantFor = (side: "home" | "away"): BracketParticipant => {
            const teamId = side === "home" ? m.homeTeamId : m.awayTeamId
            const won = side === "home" ? wins.home : wins.away
            if (teamId === null) {
                return {
                    id: `${side}-${m.matchNum}`,
                    name: isBye ? "BYE" : feederLabel(m, side),
                    resultText: null,
                    isWinner: false,
                    status: isBye ? "NO_SHOW" : null
                }
            }
            return {
                id: teamId.toString(),
                name: teamNames.get(teamId) ?? `Team ${teamId}`,
                resultText: won !== null ? won.toString() : null,
                isWinner: hasResult && m.winnerTeamId === teamId,
                status: isBye ? "WALK_OVER" : hasResult ? "PLAYED" : null
            }
        }

        return {
            id: m.matchNum,
            name: `Match #${m.matchNum}`,
            nextMatchId,
            nextLooserMatchId,
            tournamentRoundText: m === grandFinal ? "GF" : `R${m.round}`,
            startTime: tournamentDate ?? "",
            state: isBye ? "WALK_OVER" : hasResult ? "SCORE_DONE" : "NO_PARTY",
            participants: [participantFor("home"), participantFor("away")],
            matchNum: m.matchNum,
            week: 0,
            date: tournamentDate,
            time: m.startTime,
            court: m.court,
            scoresDisplay: isBye ? "—" : scoresDisplay(m),
            homeSourceLabel: null,
            awaySourceLabel: null,
            workTeamLabel: null,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
            workTeamId: null,
            homeSourceRefMatch: null,
            homeSourceRefIsWin: null,
            awaySourceRefMatch: null,
            awaySourceRefIsWin: null,
            workSourceRefMatch: null,
            workSourceRefIsWin: null
        }
    }

    const upper = [
        ...winners.map((m) =>
            toBracketMatch(m, nextForWinners(m), loserDropForWinners(m))
        ),
        ...finals.map((m) => toBracketMatch(m, null, null))
    ]
    const lower = losers.map((m) => toBracketMatch(m, nextForLosers(m), null))

    // Null out refs pointing outside the rendered set, mirroring the season
    // builder's guard against dangling links.
    const allIds = new Set([...upper, ...lower].map((m) => m.id))
    for (const m of [...upper, ...lower]) {
        if (m.nextMatchId !== null && !allIds.has(m.nextMatchId)) {
            m.nextMatchId = null
        }
        if (m.nextLooserMatchId !== null && !allIds.has(m.nextLooserMatchId)) {
            m.nextLooserMatchId = null
        }
    }

    return { upper, lower }
}
