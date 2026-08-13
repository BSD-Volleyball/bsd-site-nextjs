#!/usr/bin/env tsx
// Sweeps every season for double-elimination "if necessary" finals that were
// never played, and removes them so they stop rendering as an empty box on the
// end of the bracket.
//
// New seasons no longer need this: advanceSeasonPhase prunes them the moment a
// season is marked Complete (src/lib/playoff-bracket-cleanup.ts). This exists
// to clear the backlog, and to re-sweep after a historical re-import, which
// recreates playoff_matches_meta from the archived pages.
//
// The rule -- shared with the runtime path, so both behave identically -- is
// that an unplayed reset slot may be removed ONLY when the first final was won
// by a team that came into it undefeated. If the winners-bracket team lost, a
// decider was genuinely required and an empty slot means the score is missing.
//
// Usage:
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/prune-unplayed-bracket-resets.ts [--apply]
// Default is a dry run. A JSON backup of every removed row is written either
// way, so --apply is reversible.
import "dotenv/config"
import fs from "node:fs"
import path from "node:path"
import { asc, inArray } from "drizzle-orm"
import {
    divisions,
    matchReferees,
    matches,
    playoffMatchesMeta,
    seasons,
    teams
} from "../src/database/schema"
import { db } from "../src/database/db"
import {
    findUnplayedBracketResets,
    pruneUnplayedBracketResets
} from "../src/lib/playoff-bracket-cleanup"

const APPLY = process.argv.includes("--apply")

async function main() {
    const allSeasons = await db.select().from(seasons).orderBy(asc(seasons.id))
    const divById = new Map(
        (await db.select().from(divisions)).map((d) => [d.id, d.name])
    )
    const teamName = new Map(
        (await db.select().from(teams)).map((t) => [
            t.id,
            `#${t.number} ${t.name ?? ""}`.trim()
        ])
    )

    const backup: unknown[] = []
    let total = 0
    let refAssignments = 0

    console.log(APPLY ? "APPLY\n" : "DRY RUN\n")

    for (const season of allSeasons) {
        const candidates = await findUnplayedBracketResets(season.id)
        if (candidates.length === 0) {
            continue
        }

        // Capture the full rows before anything is deleted.
        const metaRows = await db
            .select()
            .from(playoffMatchesMeta)
            .where(
                inArray(
                    playoffMatchesMeta.id,
                    candidates.map((c) => c.metaId)
                )
            )
        const matchIds = candidates
            .map((c) => c.matchId)
            .filter((id): id is number => id !== null)
        const matchRows = matchIds.length
            ? await db
                  .select()
                  .from(matches)
                  .where(inArray(matches.id, matchIds))
            : []
        const refRows = matchIds.length
            ? await db
                  .select()
                  .from(matchReferees)
                  .where(inArray(matchReferees.match_id, matchIds))
            : []
        refAssignments += refRows.length

        for (const c of candidates) {
            const divisionId = metaRows.find((m) => m.id === c.metaId)?.division
            console.log(
                `${season.code} (${season.season} ${season.year}) / ${divisionId ? divById.get(divisionId) : "?"}  match #${c.matchNum}  metaId=${c.metaId} matchId=${c.matchId ?? "none"}`
            )
            console.log(
                `    #${c.decidedByMatchNum} was won by ${teamName.get(c.championTeamId) ?? c.championTeamId} while undefeated, so #${c.matchNum} was never needed`
            )
        }
        if (refRows.length > 0) {
            console.log(
                `    (also removes ${refRows.length} referee assignment(s) on the unplayed match)`
            )
        }

        backup.push({
            season: season.code,
            candidates,
            metaRows,
            matchRows,
            refRows
        })
        total += candidates.length

        if (APPLY) {
            const { pruned, skipped } = await pruneUnplayedBracketResets(
                season.id
            )
            if (skipped.length > 0) {
                console.log(`    SKIPPED: ${JSON.stringify(skipped)}`)
            }
            if (pruned.length !== candidates.length) {
                console.log(
                    `    NOTE: pruned ${pruned.length} of ${candidates.length}`
                )
            }
        }
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    const backupDir = path.join(process.env.HOME ?? ".", "backups")
    fs.mkdirSync(backupDir, { recursive: true })
    const backupPath = path.join(
        backupDir,
        `unplayed-bracket-resets.${stamp}.json`
    )
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2))

    console.log(
        `\n${APPLY ? "Removed" : "Would remove"} ${total} unplayed reset final(s) across ${backup.length} season(s).`
    )
    if (refAssignments > 0) {
        console.log(
            `${APPLY ? "Removed" : "Would remove"} ${refAssignments} referee assignment(s) attached to them -- ref-compensation counts assignments, not results, so these were credited for matches that never happened.`
        )
    }
    console.log(`Backup: ${backupPath}`)
    if (!APPLY) {
        console.log("\nDry run -- nothing written. Re-run with --apply.")
    }
    process.exit(0)
}

main()
