// Every double-elim "if necessary" bracket reset carries the same meta
// signature: sources W{n} and L{n} pointing at the SAME preceding match n.
// This enumerates all of them and classifies each as legitimate (the winners-
// bracket team lost match n, so a decider was required) or phantom (the
// winners-bracket team won match n, so the tournament was already over).
import "dotenv/config"
import { asc, eq } from "drizzle-orm"
import {
    champions,
    divisions,
    matches,
    playoffMatchesMeta,
    seasons,
    teams
} from "../src/database/schema"
import { db } from "../src/database/db"

async function main() {
    const allSeasons = await db.select().from(seasons).orderBy(asc(seasons.id))
    const seasonById = new Map(allSeasons.map((s: any) => [s.id, s]))
    const divById = new Map(
        (await db.select().from(divisions)).map((d: any) => [d.id, d.name])
    )
    const teamName = new Map(
        (await db.select().from(teams)).map((t: any) => [
            t.id,
            `#${t.number} ${t.name ?? ""}`.trim()
        ])
    )
    const champByKey = new Map(
        (await db.select().from(champions)).map((c: any) => [
            `${c.season}:${c.division}`,
            c.team
        ])
    )
    const allMatches = new Map(
        (await db.select().from(matches).where(eq(matches.playoff, true))).map(
            (m: any) => [m.id, m]
        )
    )
    const meta = await db.select().from(playoffMatchesMeta)

    const byKey = new Map<string, any[]>()
    for (const m of meta as any[]) {
        const k = `${m.season}:${m.division}`
        if (!byKey.has(k)) byKey.set(k, [])
        byKey.get(k)!.push(m)
    }

    const rows: any[] = []
    for (const [key, list] of byKey) {
        const byNum = new Map(list.map((m) => [m.match_num, m]))
        for (const mt of list) {
            const a = /^([WL])(\d+)$/.exec(mt.home_source ?? "")
            const b = /^([WL])(\d+)$/.exec(mt.away_source ?? "")
            if (!a || !b) continue
            if (a[2] !== b[2]) continue
            if (a[1] === b[1]) continue // need one W and one L
            const priorNum = Number(a[2])
            const prior = byNum.get(priorNum)
            if (!prior) continue

            const resetMatch = mt.match_id ? allMatches.get(mt.match_id) : null
            const priorMatch = prior.match_id
                ? allMatches.get(prior.match_id)
                : null

            // Losses each team carried into the prior (first) final.
            const losses = new Map<number, number>()
            for (const other of list) {
                if (other.match_num >= priorNum) continue
                const om = other.match_id
                    ? allMatches.get(other.match_id)
                    : null
                if (!om?.winner || !om.home_team || !om.away_team) continue
                const loser =
                    om.winner === om.home_team ? om.away_team : om.home_team
                losses.set(loser, (losses.get(loser) ?? 0) + 1)
            }

            const priorWinner = priorMatch?.winner ?? null
            const priorWinnerLosses = priorWinner
                ? (losses.get(priorWinner) ?? 0)
                : null
            const champ = champByKey.get(key) ?? null

            let verdict: string
            if (!priorMatch) verdict = "NO-PRIOR-MATCH-ROW"
            else if (!priorWinner) verdict = "PRIOR-WINNER-UNKNOWN"
            else if (priorWinnerLosses === 0) verdict = "PHANTOM"
            else verdict = "legit-reset"

            const hasRow = !!resetMatch
            const hasResult =
                !!resetMatch &&
                (resetMatch.home_score !== null ||
                    resetMatch.away_score !== null ||
                    resetMatch.winner !== null ||
                    resetMatch.home_set1_score !== null)

            rows.push({
                key,
                seasonCode: seasonById.get(mt.season)?.code,
                seasonLabel: `${seasonById.get(mt.season)?.season} ${seasonById.get(mt.season)?.year}`,
                seasonId: mt.season,
                division: divById.get(mt.division),
                resetNum: mt.match_num,
                priorNum,
                verdict,
                hasRow,
                hasResult,
                matchId: resetMatch?.id ?? null,
                metaId: mt.id,
                priorDetail: priorMatch
                    ? `${teamName.get(priorMatch.home_team) ?? "?"} ${priorMatch.home_score}-${priorMatch.away_score} ${teamName.get(priorMatch.away_team) ?? "?"} W=${priorMatch.winner ? teamName.get(priorMatch.winner) : "none"}`
                    : "(none)",
                resetDetail: resetMatch
                    ? `${teamName.get(resetMatch.home_team) ?? "?"} ${resetMatch.home_score}-${resetMatch.away_score} ${teamName.get(resetMatch.away_team) ?? "?"} W=${resetMatch.winner ? teamName.get(resetMatch.winner) : "none"}`
                    : "(no match row)",
                champ: champ ? teamName.get(champ) : null,
                championIsPriorWinner:
                    champ && priorWinner ? champ === priorWinner : null
            })
        }
    }

    rows.sort((a, b) => a.seasonId - b.seasonId)
    const counts: Record<string, number> = {}
    for (const r of rows) {
        const k = `${r.verdict} / row=${r.hasRow} result=${r.hasResult}`
        counts[k] = (counts[k] ?? 0) + 1
    }
    console.log(`Total bracket-reset meta rows: ${rows.length}`)
    console.log(counts)
    console.log("\n--- non-legit or noteworthy ---")
    for (const r of rows) {
        if (r.verdict === "legit-reset" && r.hasResult) continue
        console.log(
            `${r.seasonCode} (${r.seasonLabel}) / ${r.division} m#${r.resetNum} <- m#${r.priorNum}  ${r.verdict}  row=${r.hasRow} result=${r.hasResult} matchId=${r.matchId} metaId=${r.metaId}`
        )
        console.log(`     prior: ${r.priorDetail}`)
        console.log(
            `     reset: ${r.resetDetail}   champ=${r.champ} championIsPriorWinner=${r.championIsPriorWinner}`
        )
    }
    process.exit(0)
}
main()
