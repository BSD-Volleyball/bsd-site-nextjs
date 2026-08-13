#!/usr/bin/env tsx
// Removes double-elimination "if necessary" finals that were never played, and
// clears never-played third sets, both imported by the 2026-07 backfill.
//
// ROOT CAUSE: the archived playoff pages are JS. A match (or a set) that turned
// out not to be needed was left in the file with every line prefixed "//".
// The importer's line regex ignored JS comment syntax, so those blocks were
// read as real results. Because the pages were copied forward season to season,
// the commented-out block usually carried a PREVIOUS season's scores -- which is
// why the phantom finals so often show the champion "losing" the last match.
//
// Two defect classes, each re-verified here before anything is written:
//   1. PHANTOM FINAL  - a match whose meta sources are W{n}/L{n} of the same
//      preceding match n, where the winner of n came in undefeated. Winning n
//      ended the tournament, so n+1 was never played. The matches row is
//      deleted; the meta row is KEPT and its match_id goes NULL (ON DELETE SET
//      NULL), so the bracket still renders the "if necessary" slot as unplayed
//      -- the same shape the app produces for live seasons.
//   2. PHANTOM SET    - a commented-out games[2].scores line imported into a
//      match that was actually a two-set sweep. The set columns are cleared and
//      home_score/away_score recomputed from the sets that were really played.
//
// Deliberately NOT touched:
//   - app-authored empty "if necessary" rows (all scores NULL) in seasons the
//     app itself scheduled -- they are correct, not imported junk;
//   - brackets whose preceding final has no recorded winner, so "was the
//     winners-bracket team undefeated?" cannot be answered (S02/B).
//
// Usage:
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/fix-phantom-playoff-finals.ts [--apply]
// Default is a dry run. A JSON backup of every row it would change is written
// regardless, so --apply is always reversible.
import "dotenv/config"
import fs from "node:fs"
import path from "node:path"
import { and, eq, inArray } from "drizzle-orm"
import {
    divisions,
    matchReferees,
    matchSubstitutions,
    matches,
    playoffMatchesMeta,
    seasons,
    subRequests,
    teams
} from "../src/database/schema"
import { db } from "../src/database/db"

const APPLY = process.argv.includes("--apply")

// Verified against the archived source pages by
// scripts/data/audit-commented-playoff-data.ts (commented-out blocks) and
// scripts/data/find-reset-final-signature.ts (bracket-reset meta signature).
const PHANTOM_FINAL_MATCH_IDS = [
    29546, 30243, 30261, 30272, 30283, 30294, 30305, 30316, 30327, 30338, 30349,
    30356, 30367, 30425, 30432, 31069, 31080, 31091, 31102, 31113, 31161, 31172,
    31183, 31205, 31216, 31227, 31496, 31503, 31521
]

// Commented-out third sets that were imported into real two-set matches.
const PHANTOM_SET3_MATCH_IDS = [30270, 30303, 31050]

interface Change {
    kind: string
    matchId: number
    season: string
    division: string
    matchNum: number | null
    before: Record<string, unknown>
    after?: Record<string, unknown>
    reason: string
}

async function main() {
    const seasonById = new Map(
        (await db.select().from(seasons)).map((s: any) => [s.id, s])
    )
    const divById = new Map(
        (await db.select().from(divisions)).map((d: any) => [d.id, d.name])
    )
    const teamName = new Map(
        (await db.select().from(teams)).map((t: any) => [
            t.id,
            `#${t.number} ${t.name ?? ""}`.trim()
        ])
    )

    const changes: Change[] = []
    const refusals: string[] = []

    // ---------- class 1: phantom finals ----------
    for (const matchId of PHANTOM_FINAL_MATCH_IDS) {
        const row = (
            await db.select().from(matches).where(eq(matches.id, matchId))
        )[0] as any
        if (!row) {
            refusals.push(`match ${matchId}: row not found`)
            continue
        }
        const meta = (
            await db
                .select()
                .from(playoffMatchesMeta)
                .where(eq(playoffMatchesMeta.match_id, matchId))
        )[0] as any
        if (!meta) {
            refusals.push(`match ${matchId}: no playoff meta row`)
            continue
        }

        // Re-derive the PHANTOM verdict from the data, independently of the
        // list above -- the list is a target, not an authority.
        const a = /^([WL])(\d+)$/.exec(meta.home_source ?? "")
        const b = /^([WL])(\d+)$/.exec(meta.away_source ?? "")
        if (!a || !b || a[2] !== b[2] || a[1] === b[1]) {
            refusals.push(
                `match ${matchId}: sources ${meta.home_source}/${meta.away_source} are not a W{n}/L{n} bracket reset`
            )
            continue
        }
        const priorNum = Number(a[2])
        const divisionMeta = await db
            .select()
            .from(playoffMatchesMeta)
            .where(
                and(
                    eq(playoffMatchesMeta.season, meta.season),
                    eq(playoffMatchesMeta.division, meta.division)
                )
            )
        const maxNum = Math.max(...divisionMeta.map((m: any) => m.match_num))
        if (meta.match_num !== maxNum) {
            refusals.push(
                `match ${matchId}: match #${meta.match_num} is not the last match (#${maxNum}) in the bracket`
            )
            continue
        }
        const prior = divisionMeta.find(
            (m: any) => m.match_num === priorNum
        ) as any
        const priorMatch = prior?.match_id
            ? ((
                  await db
                      .select()
                      .from(matches)
                      .where(eq(matches.id, prior.match_id))
              )[0] as any)
            : null
        if (!priorMatch?.winner) {
            refusals.push(
                `match ${matchId}: preceding match #${priorNum} has no recorded winner`
            )
            continue
        }
        // Losses the winner of the first final carried into it.
        const priorIds = divisionMeta
            .filter((m: any) => m.match_num < priorNum && m.match_id)
            .map((m: any) => m.match_id as number)
        const earlier = priorIds.length
            ? await db
                  .select()
                  .from(matches)
                  .where(inArray(matches.id, priorIds))
            : []
        let winnerLosses = 0
        for (const m of earlier as any[]) {
            if (!m.winner || !m.home_team || !m.away_team) continue
            const loser = m.winner === m.home_team ? m.away_team : m.home_team
            if (loser === priorMatch.winner) winnerLosses++
        }
        if (winnerLosses !== 0) {
            refusals.push(
                `match ${matchId}: winner of #${priorNum} already had ${winnerLosses} loss(es) -- this reset final was legitimately required`
            )
            continue
        }

        // Nothing may depend on the row.
        const subs = await db
            .select()
            .from(matchSubstitutions)
            .where(eq(matchSubstitutions.match, matchId))
        const refs = await db
            .select()
            .from(matchReferees)
            .where(eq(matchReferees.match_id, matchId))
        const sreq = await db
            .select()
            .from(subRequests)
            .where(eq(subRequests.match, matchId))
        if (subs.length || refs.length || sreq.length) {
            refusals.push(
                `match ${matchId}: has dependent rows (subs=${subs.length} refs=${refs.length} subRequests=${sreq.length})`
            )
            continue
        }

        changes.push({
            kind: "delete-phantom-final",
            matchId,
            season: seasonById.get(meta.season)?.code ?? String(meta.season),
            division: divById.get(meta.division) ?? String(meta.division),
            matchNum: meta.match_num,
            before: { match: row, meta },
            reason: `#${priorNum} was won by ${teamName.get(priorMatch.winner)} while undefeated, so #${meta.match_num} was never played`
        })
    }

    // ---------- class 2: phantom third sets ----------
    for (const matchId of PHANTOM_SET3_MATCH_IDS) {
        const row = (
            await db.select().from(matches).where(eq(matches.id, matchId))
        )[0] as any
        if (!row) {
            refusals.push(`match ${matchId}: row not found`)
            continue
        }
        if (row.home_set3_score === null && row.away_set3_score === null) {
            refusals.push(`match ${matchId}: set 3 already cleared`)
            continue
        }
        const sets: [number, number][] = []
        for (const n of [1, 2]) {
            const h = row[`home_set${n}_score`]
            const aw = row[`away_set${n}_score`]
            if (h !== null && aw !== null) sets.push([h, aw])
        }
        if (sets.length !== 2) {
            refusals.push(
                `match ${matchId}: expected two played sets, found ${sets.length}`
            )
            continue
        }
        const homeSets = sets.filter(([h, aw]) => h > aw).length
        const awaySets = sets.filter(([h, aw]) => aw > h).length
        if (homeSets !== 2 && awaySets !== 2) {
            refusals.push(
                `match ${matchId}: first two sets were split (${homeSets}-${awaySets}), so a third set really was needed`
            )
            continue
        }
        const winner = homeSets === 2 ? row.home_team : row.away_team
        if (row.winner !== winner) {
            refusals.push(
                `match ${matchId}: recorded winner ${row.winner} disagrees with the two-set sweep winner ${winner}`
            )
            continue
        }
        changes.push({
            kind: "clear-phantom-set3",
            matchId,
            season: seasonById.get(row.season)?.code ?? String(row.season),
            division: divById.get(row.division) ?? String(row.division),
            matchNum: null,
            before: { match: row },
            after: {
                home_score: homeSets,
                away_score: awaySets,
                home_set3_score: null,
                away_set3_score: null
            },
            reason: `two-set sweep; the imported third set (${row.home_set3_score}-${row.away_set3_score}) was commented out in the source page`
        })
    }

    // ---------- report ----------
    const deletions = changes.filter((c) => c.kind === "delete-phantom-final")
    const setFixes = changes.filter((c) => c.kind === "clear-phantom-set3")
    console.log(`${APPLY ? "APPLY" : "DRY RUN"}\n`)
    console.log(`Phantom finals to delete: ${deletions.length}`)
    for (const c of deletions) {
        const m: any = c.before.match
        console.log(
            `  ${c.season}/${c.division} m#${c.matchNum} id=${c.matchId}  ${teamName.get(m.home_team) ?? "?"} ${m.home_score}-${m.away_score} ${teamName.get(m.away_team) ?? "?"} W=${m.winner ? teamName.get(m.winner) : "none"}`
        )
        console.log(`      ${c.reason}`)
    }
    console.log(`\nPhantom third sets to clear: ${setFixes.length}`)
    for (const c of setFixes) {
        const m: any = c.before.match
        console.log(
            `  ${c.season}/${c.division} id=${c.matchId}  ${m.home_score}-${m.away_score} -> ${c.after!.home_score}-${c.after!.away_score}  (dropping set3 ${m.home_set3_score}-${m.away_set3_score})`
        )
    }
    if (refusals.length) {
        console.log(
            `\nREFUSED (${refusals.length}) -- verification failed, left untouched:`
        )
        for (const r of refusals) console.log(`  ${r}`)
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    const backupDir = path.join(process.env.HOME ?? ".", "backups")
    fs.mkdirSync(backupDir, { recursive: true })
    const backupPath = path.join(
        backupDir,
        `phantom-playoff-finals.${stamp}.json`
    )
    fs.writeFileSync(backupPath, JSON.stringify(changes, null, 2))
    console.log(`\nBackup of every affected row: ${backupPath}`)

    if (!APPLY) {
        console.log("\nDry run -- nothing written. Re-run with --apply.")
        process.exit(0)
    }

    for (const c of setFixes) {
        await db
            .update(matches)
            .set(c.after as any)
            .where(eq(matches.id, c.matchId))
    }
    if (deletions.length) {
        await db.delete(matches).where(
            inArray(
                matches.id,
                deletions.map((c) => c.matchId)
            )
        )
    }
    console.log(
        `\nApplied: deleted ${deletions.length} phantom finals, cleared ${setFixes.length} phantom third sets.`
    )
    process.exit(0)
}
main()
