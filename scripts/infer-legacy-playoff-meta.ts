// Recovery script (2026-08): reconstruct playoff_matches_meta for table-era
// seasons (2000-2013) whose archived pages named participants but carried no
// W/L bracket tokens, so import-wayback.ts created matches rows without meta.
//
// Inference, per season+division, walking playoff matches chronologically:
//   - a team's first appearance is seeded S{standings position}
//   - later appearances become W{n}/L{n} of the team's previous playoff match
//   - forward refs mirror the backward refs, exactly like
//     scripts/archive/backfill-playoff-forward-refs.ts derives them
// Validation: every match must have a determinable winner, and the terminal
// winners-chain match must be won by the champions-table team for the
// division. Divisions failing validation are reported and skipped.
//
// Usage:
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/infer-legacy-playoff-meta.ts \
//       --seasons 11,12 [--apply] [--include-flagged]
// Default is a dry run; --apply inserts meta rows only for matches that have
// none, only in divisions that PASS (unless --include-flagged).
import "dotenv/config"
import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import {
    champions,
    matches,
    playoffMatchesMeta,
    seasons,
    teams
} from "../src/database/schema"
import { db } from "../src/database/db"

const APPLY = process.argv.includes("--apply")
const INCLUDE_FLAGGED = process.argv.includes("--include-flagged")
const seasonsArgIdx = process.argv.indexOf("--seasons")
const SEASON_FILTER =
    seasonsArgIdx >= 0
        ? process.argv[seasonsArgIdx + 1].split(",").map((s) => Number(s))
        : null
const divisionArgIdx = process.argv.indexOf("--division")
const DIVISION_FILTER =
    divisionArgIdx >= 0 ? Number(process.argv[divisionArgIdx + 1]) : null

interface MatchRow {
    id: number
    division: number
    week: number
    date: string | null
    time: string | null
    homeTeam: number | null
    awayTeam: number | null
    homeScore: number | null
    awayScore: number | null
    winner: number | null
}

interface ProposedMeta {
    season: number
    division: number
    week: number
    match_num: number
    match_id: number
    home_source: string
    away_source: string
    next_match_num: number | null
    next_loser_match_num: number | null
}

function timeToMinutes(time: string | null): number {
    if (!time) return Number.MAX_SAFE_INTEGER
    const m = time.match(/^(\d{1,2}):(\d{2})/)
    if (!m) return Number.MAX_SAFE_INTEGER
    return Number(m[1]) * 60 + Number(m[2])
}

function matchWinner(m: MatchRow): number | null {
    if (m.winner !== null) return m.winner
    if (
        m.homeScore !== null &&
        m.awayScore !== null &&
        m.homeScore !== m.awayScore
    ) {
        return m.homeScore > m.awayScore ? m.homeTeam : m.awayTeam
    }
    return null
}

async function seedOrder(
    seasonId: number,
    divisionId: number
): Promise<Map<number, number>> {
    // Prefer the imported standings rank; fall back to regular-season wins.
    const divTeams = await db
        .select({ id: teams.id, rank: teams.rank, number: teams.number })
        .from(teams)
        .where(and(eq(teams.season, seasonId), eq(teams.division, divisionId)))

    const ranks = divTeams.map((t) => t.rank)
    const useRank =
        ranks.every((r) => r !== null) &&
        new Set(ranks).size === divTeams.length

    let ordered: number[]
    if (useRank) {
        ordered = [...divTeams]
            .sort((a, b) => (a.rank as number) - (b.rank as number))
            .map((t) => t.id)
    } else {
        const regular = await db
            .select({
                homeTeam: matches.home_team,
                awayTeam: matches.away_team,
                homeScore: matches.home_score,
                awayScore: matches.away_score,
                winner: matches.winner
            })
            .from(matches)
            .where(
                and(
                    eq(matches.season, seasonId),
                    eq(matches.division, divisionId),
                    eq(matches.playoff, false)
                )
            )
        const wins = new Map<number, number>()
        for (const t of divTeams) wins.set(t.id, 0)
        for (const m of regular) {
            const w =
                m.winner ??
                (m.homeScore !== null &&
                m.awayScore !== null &&
                m.homeScore !== m.awayScore
                    ? m.homeScore > m.awayScore
                        ? m.homeTeam
                        : m.awayTeam
                    : null)
            if (w !== null && wins.has(w)) wins.set(w, (wins.get(w) ?? 0) + 1)
        }
        ordered = [...divTeams]
            .sort(
                (a, b) =>
                    (wins.get(b.id) ?? 0) - (wins.get(a.id) ?? 0) ||
                    (a.number ?? 99) - (b.number ?? 99)
            )
            .map((t) => t.id)
    }

    const seedByTeam = new Map<number, number>()
    for (const [i, teamId] of ordered.entries()) {
        seedByTeam.set(teamId, i + 1)
    }
    return seedByTeam
}

async function main() {
    // Target: seasons owning playoff matches that lack a meta row.
    const targets = await db
        .selectDistinct({ season: matches.season })
        .from(matches)
        .leftJoin(
            playoffMatchesMeta,
            eq(playoffMatchesMeta.match_id, matches.id)
        )
        .where(and(eq(matches.playoff, true), isNull(playoffMatchesMeta.id)))

    let seasonIds = targets.map((t) => t.season)
    if (SEASON_FILTER) {
        seasonIds = seasonIds.filter((id) => SEASON_FILTER.includes(id))
    }
    seasonIds.sort((a, b) => a - b)

    const seasonRows = await db
        .select({ id: seasons.id, code: seasons.code })
        .from(seasons)
        .where(inArray(seasons.id, seasonIds.length ? seasonIds : [-1]))
    const codeById = new Map(seasonRows.map((s) => [s.id, s.code]))

    let totalInserted = 0
    for (const seasonId of seasonIds) {
        const code = codeById.get(seasonId) ?? String(seasonId)
        const playoffRows: MatchRow[] = (
            await db
                .select({
                    id: matches.id,
                    division: matches.division,
                    week: matches.week,
                    date: matches.date,
                    time: matches.time,
                    homeTeam: matches.home_team,
                    awayTeam: matches.away_team,
                    homeScore: matches.home_score,
                    awayScore: matches.away_score,
                    winner: matches.winner
                })
                .from(matches)
                .where(
                    and(eq(matches.season, seasonId), eq(matches.playoff, true))
                )
                .orderBy(asc(matches.week), asc(matches.date), asc(matches.id))
        ).map((r) => ({ ...r }))

        const existingMeta = await db
            .select({
                matchId: playoffMatchesMeta.match_id,
                division: playoffMatchesMeta.division,
                matchNum: playoffMatchesMeta.match_num,
                homeSource: playoffMatchesMeta.home_source,
                awaySource: playoffMatchesMeta.away_source
            })
            .from(playoffMatchesMeta)
            .where(eq(playoffMatchesMeta.season, seasonId))
        const existingByMatchId = new Map(
            existingMeta.map((m) => [m.matchId, m])
        )

        const teamRows = await db
            .select({ id: teams.id, name: teams.name })
            .from(teams)
            .where(eq(teams.season, seasonId))
        const teamName = new Map(teamRows.map((t) => [t.id, t.name]))

        const champRows = await db
            .select({ division: champions.division, team: champions.team })
            .from(champions)
            .where(eq(champions.season, seasonId))
        const championByDivision = new Map(
            champRows.map((c) => [c.division, c.team])
        )

        let divisions = [...new Set(playoffRows.map((m) => m.division))].sort(
            (a, b) => a - b
        )
        if (DIVISION_FILTER !== null) {
            divisions = divisions.filter((d) => d === DIVISION_FILTER)
        }
        console.log(`\n=== ${code} (season ${seasonId}) ===`)

        for (const divisionId of divisions) {
            const divMatches = playoffRows
                .filter((m) => m.division === divisionId)
                .sort(
                    (a, b) =>
                        a.week - b.week ||
                        (a.date ?? "").localeCompare(b.date ?? "") ||
                        timeToMinutes(a.time) - timeToMinutes(b.time) ||
                        a.id - b.id
                )

            const flags: string[] = []
            const seedByTeam = await seedOrder(seasonId, divisionId)

            // Number matches chronologically, honoring existing meta nums.
            // Meta-less matches take the MISSING numbers in 1..max (a page
            // whose surviving tokens start at #5 numbered its lost round-one
            // games 1-4), then continue past the max.
            const divExisting = existingMeta.filter(
                (m) => m.division === divisionId
            )
            const usedNums = new Set(divExisting.map((m) => m.matchNum))
            const maxNum = Math.max(0, ...usedNums)
            const freeNums: number[] = []
            for (let n = 1; n <= maxNum; n++) {
                if (!usedNums.has(n)) freeNums.push(n)
            }
            let overflowNum = maxNum + 1
            const numByMatchId = new Map<number, number>()
            for (const m of divMatches) {
                const existing = existingByMatchId.get(m.id)
                numByMatchId.set(
                    m.id,
                    existing
                        ? existing.matchNum
                        : (freeNums.shift() ?? overflowNum++)
                )
            }

            // Walk chronologically, tracking each team's previous match.
            const lastByTeam = new Map<number, { num: number; won: boolean }>()
            const proposals: ProposedMeta[] = []
            const byNum = new Map<number, ProposedMeta>()
            for (const m of divMatches) {
                const num = numByMatchId.get(m.id) as number
                const winner = matchWinner(m)

                // A bye row (one team, auto-win): skip meta entirely — the
                // bracket synthesizes bye stubs from seed tokens, and the
                // team's next match correctly sources its pre-bye state.
                const isBye =
                    (m.homeTeam === null) !== (m.awayTeam === null) &&
                    winner !== null &&
                    (winner === m.homeTeam || winner === m.awayTeam)
                if (isBye) continue

                // An unplayed "if necessary" reset final: no teams, no score,
                // chronologically last, after a W-vs-W final. Mirror the shape
                // of played reset finals ([L{final}] vs [W{final}]).
                if (m.homeTeam === null && m.awayTeam === null) {
                    const terminalSoFar = [...proposals]
                        .reverse()
                        .find((p) => p.next_match_num === null)
                    const isLast = divMatches[divMatches.length - 1].id === m.id
                    if (terminalSoFar && isLast && winner === null) {
                        const t = terminalSoFar.match_num
                        const proposal: ProposedMeta = {
                            season: seasonId,
                            division: divisionId,
                            week: m.week,
                            match_num: num,
                            match_id: m.id,
                            home_source: `L${t}`,
                            away_source: `W${t}`,
                            next_match_num: null,
                            next_loser_match_num: null
                        }
                        terminalSoFar.next_match_num = num
                        terminalSoFar.next_loser_match_num = num
                        proposals.push(proposal)
                        byNum.set(num, proposal)
                        continue
                    }
                    flags.push(`match #${num} (id ${m.id}) missing both teams`)
                    continue
                }

                // Only rows we would insert need a winner; existing meta rows
                // are untouched, so their missing results are not our problem.
                if (winner === null && !existingByMatchId.has(m.id)) {
                    flags.push(`match #${num} (id ${m.id}) has no winner`)
                }
                if (m.homeTeam === null || m.awayTeam === null) {
                    flags.push(`match #${num} (id ${m.id}) missing a team`)
                    continue
                }

                const sourceFor = (teamId: number): string => {
                    const last = lastByTeam.get(teamId)
                    if (!last) return `S${seedByTeam.get(teamId) ?? 99}`
                    return `${last.won ? "W" : "L"}${last.num}`
                }
                const homeSource = sourceFor(m.homeTeam)
                const awaySource = sourceFor(m.awayTeam)

                const proposal: ProposedMeta = {
                    season: seasonId,
                    division: divisionId,
                    week: m.week,
                    match_num: num,
                    match_id: m.id,
                    home_source: homeSource,
                    away_source: awaySource,
                    next_match_num: null,
                    next_loser_match_num: null
                }
                proposals.push(proposal)
                byNum.set(num, proposal)

                // Mirror backward refs into forward refs on the source match.
                for (const src of [homeSource, awaySource]) {
                    const ref = src.match(/^([WL])(\d+)$/)
                    if (!ref) continue
                    const source = byNum.get(Number(ref[2]))
                    if (!source) continue
                    if (ref[1] === "W" && source.next_match_num === null) {
                        source.next_match_num = num
                    }
                    if (
                        ref[1] === "L" &&
                        source.next_loser_match_num === null
                    ) {
                        source.next_loser_match_num = num
                    }
                }

                lastByTeam.set(m.homeTeam, { num, won: winner === m.homeTeam })
                lastByTeam.set(m.awayTeam, { num, won: winner === m.awayTeam })
            }

            // Fill new rows' forward refs from EXISTING rows' backward tokens
            // (a lost round-one game's next is the surviving row that
            // references W{n}/L{n} of its number).
            for (const ex of divExisting) {
                for (const src of [ex.homeSource, ex.awaySource]) {
                    const ref = src
                        .trim()
                        .toUpperCase()
                        .match(/^([WL])(\d+)$/)
                    if (!ref) continue
                    const referenced = byNum.get(Number(ref[2]))
                    if (
                        !referenced ||
                        existingByMatchId.has(referenced.match_id)
                    )
                        continue
                    if (ref[1] === "W" && referenced.next_match_num === null) {
                        referenced.next_match_num = ex.matchNum
                    }
                    if (
                        ref[1] === "L" &&
                        referenced.next_loser_match_num === null
                    ) {
                        referenced.next_loser_match_num = ex.matchNum
                    }
                }
            }

            // Champion validation: the winners-chain terminal must be won by
            // the champions-table team.
            const champion = championByDivision.get(divisionId)
            const matchById = new Map(divMatches.map((m) => [m.id, m]))
            // Terminal = last chain end that was actually played (an unplayed
            // "if necessary" reset final doesn't dethrone the game-1 winner).
            const terminal = [...proposals].reverse().find((p) => {
                const own = matchWinner(matchById.get(p.match_id) as MatchRow)
                if (own === null) return false
                if (p.next_match_num === null) return true
                const next = byNum.get(p.next_match_num)
                const nextMatch = next
                    ? matchById.get(next.match_id)
                    : undefined
                return nextMatch ? matchWinner(nextMatch) === null : true
            })
            const terminalMatch = terminal
                ? matchById.get(terminal.match_id)
                : undefined
            const terminalWinner = terminalMatch
                ? matchWinner(terminalMatch)
                : null
            if (champion === undefined) {
                flags.push("no champions row for this division")
            } else if (terminalWinner !== champion) {
                flags.push(
                    `terminal match winner ${terminalWinner !== null ? (teamName.get(terminalWinner) ?? terminalWinner) : "?"} != champion ${teamName.get(champion) ?? champion}`
                )
            }

            const newRows = proposals.filter(
                (p) => !existingByMatchId.has(p.match_id)
            )
            const verdict = flags.length === 0 ? "PASS" : "FLAGGED"
            console.log(
                `  division ${divisionId}: ${divMatches.length} matches, ` +
                    `${newRows.length} new meta rows -> ${verdict}` +
                    (flags.length ? `  [${flags.join("; ")}]` : "")
            )
            for (const p of proposals) {
                const m = divMatches.find((x) => x.id === p.match_id)
                const mark = existingByMatchId.has(p.match_id) ? "=" : "+"
                console.log(
                    `    ${mark} #${String(p.match_num).padStart(2)} wk${p.week} ` +
                        `[${p.home_source}] ${teamName.get(m?.homeTeam ?? -1) ?? "?"} vs ` +
                        `[${p.away_source}] ${teamName.get(m?.awayTeam ?? -1) ?? "?"} ` +
                        `-> next=${p.next_match_num ?? "—"} loser->${p.next_loser_match_num ?? "—"}`
                )
            }

            if (APPLY && (verdict === "PASS" || INCLUDE_FLAGGED)) {
                for (const p of newRows) {
                    await db.insert(playoffMatchesMeta).values(p)
                }
                totalInserted += newRows.length
            }
        }
    }

    console.log(
        `\n${APPLY ? "Inserted" : "[dry-run] Would insert"} rows this run: ${totalInserted}`
    )
    process.exit(0)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
