/**
 * bracket.ts — where each playoff team is certain to be in the gym before
 * the results that place it are known. Pure; load.ts feeds it.
 *
 * The schedule engine skips a playoff match until both its teams are set,
 * so "S1 vs Winner of M1, worked by Loser of M1" at 7:50 credits nobody,
 * though both M1 teams are there either way (one plays, one works). This
 * walks every outcome of the division's undecided matches and keeps the
 * (team, date, time) appearances that occur in all of them.
 */

import { parseSourceToken, resetFinalUnbeatenSide } from "@/lib/playoff-sources"
import { normalizeTime } from "./format"

export interface BracketMatch {
    matchNum: number
    /** null when the night is not configured yet. */
    date: string | null
    startTime: string | null
    homeTeamId: number | null
    awayTeamId: number | null
    workTeamId: number | null
    winnerTeamId: number | null
    homeSource: string | null
    awaySource: string | null
    workSource: string | null
}

export type BracketRole = "play" | "work" | "play_or_work"

export interface CertainAppearance {
    teamId: number
    date: string
    startTime: string | null
    role: BracketRole
}

/** Beyond 2^16 outcomes, give up rather than stall the page. */
const MAX_OPEN_MATCHES = 16

interface Placed {
    home: number | null
    away: number | null
    work: number | null
    winner: number | null
    loser: number | null
}

/**
 * The if-necessary finals of one division that may not be played: a reset
 * final whose first final is undecided, or was won by the side that came in
 * unbeaten (which ends the bracket).
 */
export function ifNeededMatchNums(division: BracketMatch[]): Set<number> {
    const byNum = new Map(division.map((m) => [m.matchNum, m]))
    const refByNum = new Map(
        division.map((m) => [
            m.matchNum,
            {
                matchNum: m.matchNum,
                homeSource: parseSourceToken(m.homeSource),
                awaySource: parseSourceToken(m.awaySource)
            }
        ])
    )
    const out = new Set<number>()
    for (const [matchNum, ref] of refByNum) {
        if (byNum.get(matchNum)?.winnerTeamId !== null) continue
        const reset = resetFinalUnbeatenSide(
            ref.homeSource,
            ref.awaySource,
            refByNum
        )
        const first = reset && byNum.get(reset.firstMatchNum)
        if (!reset || !first) continue
        if (first.winnerTeamId !== null) {
            const winnerSide =
                first.winnerTeamId === first.homeTeamId ? "home" : "away"
            if (winnerSide !== reset.unbeaten) continue
        }
        out.add(matchNum)
    }
    return out
}

/**
 * Appearances certain in every outcome of one division's bracket, excluding
 * those the schedule engine already credits (a match whose two teams are both
 * set: its players and its set work team), so its sub handling still holds.
 * Sources may only refer to lower-numbered matches, as the bracket seeds them;
 * any other reference resolves to nobody.
 */
export function certainBracketAppearances(
    division: BracketMatch[]
): CertainAppearance[] {
    const ms = [...division].sort((a, b) => a.matchNum - b.matchNum)
    const open = ms.filter((m) => m.winnerTeamId === null).length
    if (open > MAX_OPEN_MATCHES) return []

    const indexByNum = new Map(ms.map((m, i) => [m.matchNum, i]))
    const sources = ms.map((m) => ({
        home: parseSourceToken(m.homeSource),
        away: parseSourceToken(m.awaySource),
        work: parseSourceToken(m.workSource)
    }))
    const refByNum = new Map(
        ms.map((m, i) => [
            m.matchNum,
            {
                matchNum: m.matchNum,
                homeSource: sources[i].home,
                awaySource: sources[i].away
            }
        ])
    )
    // The if-necessary final is played only if its first final's unbeaten
    // side loses; in outcomes where that side wins, nobody is there for it.
    const resets = ms.map((_, i) =>
        resetFinalUnbeatenSide(sources[i].home, sources[i].away, refByNum)
    )
    const notPlayed = (i: number): boolean => {
        const reset = resets[i]
        if (!reset) return false
        const firstIdx = indexByNum.get(reset.firstMatchNum)
        if (firstIdx === undefined || firstIdx >= i) return false
        const first = placed[firstIdx]
        if (first.winner === null) return false
        const winnerSide = first.winner === first.home ? "home" : "away"
        return winnerSide === reset.unbeaten
    }

    // key "team|date|time" → roles seen across outcomes; null before the first.
    const acc: { certain: Map<string, Set<"play" | "work">> | null } = {
        certain: null
    }

    const placed: Placed[] = []
    const resolve = (
        dbTeam: number | null,
        source: ReturnType<typeof parseSourceToken>,
        before: number
    ): number | null => {
        if (dbTeam !== null) return dbTeam
        if (source.value === null) return null
        if (source.kind !== "winner" && source.kind !== "loser") return null
        const idx = indexByNum.get(source.value)
        if (idx === undefined || idx >= before) return null
        return source.kind === "winner" ? placed[idx].winner : placed[idx].loser
    }

    const recordOutcome = () => {
        const seen = new Map<string, "play" | "work">()
        for (const [i, m] of ms.entries()) {
            if (!m.date || notPlayed(i)) continue
            const time = normalizeTime(m.startTime) ?? ""
            const p = placed[i]
            for (const team of [p.home, p.away]) {
                if (team !== null) seen.set(`${team}|${m.date}|${time}`, "play")
            }
            const workKey = `${p.work}|${m.date}|${time}`
            if (p.work !== null && !seen.has(workKey)) seen.set(workKey, "work")
        }
        if (acc.certain === null) {
            acc.certain = new Map(
                [...seen].map(([k, role]) => [k, new Set([role])])
            )
            return
        }
        for (const [key, roles] of acc.certain) {
            const role = seen.get(key)
            if (role === undefined) acc.certain.delete(key)
            else roles.add(role)
        }
    }

    const explore = (i: number) => {
        if (i === ms.length) {
            recordOutcome()
            return
        }
        const m = ms[i]
        const home = resolve(m.homeTeamId, sources[i].home, i)
        const away = resolve(m.awayTeamId, sources[i].away, i)
        const work = resolve(m.workTeamId, sources[i].work, i)
        const branches: [number | null, number | null][] =
            m.winnerTeamId !== null
                ? [
                      [
                          m.winnerTeamId,
                          m.winnerTeamId === home
                              ? away
                              : m.winnerTeamId === away
                                ? home
                                : null
                      ]
                  ]
                : home !== null && away !== null
                  ? [
                        [home, away],
                        [away, home]
                    ]
                  : [[null, null]]
        for (const [winner, loser] of branches) {
            placed[i] = { home, away, work, winner, loser }
            explore(i + 1)
        }
        placed.length = i
    }
    explore(0)

    // What the schedule engine already emits, by the same key.
    const credited = new Set<string>()
    for (const m of ms) {
        if (!m.date || m.homeTeamId === null || m.awayTeamId === null) continue
        const time = normalizeTime(m.startTime) ?? ""
        for (const team of [m.homeTeamId, m.awayTeamId, m.workTeamId]) {
            if (team !== null) credited.add(`${team}|${m.date}|${time}`)
        }
    }

    const out: CertainAppearance[] = []
    for (const [key, roles] of acc.certain ?? []) {
        if (credited.has(key)) continue
        const [team, date, time] = key.split("|")
        out.push({
            teamId: Number(team),
            date,
            startTime: time || null,
            role: roles.size > 1 ? "play_or_work" : [...roles][0]
        })
    }
    return out
}
