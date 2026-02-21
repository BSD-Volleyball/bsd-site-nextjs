import "dotenv/config"
import { db } from "../src/database/db"
import { playoffMatchesMeta } from "../src/database/schema"
import { eq } from "drizzle-orm"

/**
 * Backfill script: computes forward bracket references (next_match_num,
 * next_loser_match_num) from existing backward references (home_source,
 * away_source) in the playoff_matches_meta table.
 *
 * For each meta row M, we look at all other rows R in the same
 * season+division. If R references "W{M.match_num}" (winner of M) as its
 * home or away source, then M.next_match_num = R.match_num. Likewise for
 * "L{M.match_num}" → M.next_loser_match_num.
 */

interface MetaRow {
    id: number
    season: number
    division: number
    matchNum: number
    homeSource: string
    awaySource: string
}

function parseWinnerLoserRef(source: string): { kind: "winner" | "loser"; value: number } | null {
    const normalized = source.trim().replace(/^"|"$/g, "").toUpperCase()
    const winnerMatch = normalized.match(/^W(?:INNER)?(\d+)$/)
    if (winnerMatch) {
        return { kind: "winner", value: Number.parseInt(winnerMatch[1], 10) }
    }
    const loserMatch = normalized.match(/^L(?:OSER)?(\d+)$/)
    if (loserMatch) {
        return { kind: "loser", value: Number.parseInt(loserMatch[1], 10) }
    }
    return null
}

async function main() {
    const allRows = await db
        .select({
            id: playoffMatchesMeta.id,
            season: playoffMatchesMeta.season,
            division: playoffMatchesMeta.division,
            matchNum: playoffMatchesMeta.match_num,
            homeSource: playoffMatchesMeta.home_source,
            awaySource: playoffMatchesMeta.away_source
        })
        .from(playoffMatchesMeta)

    console.log(`Loaded ${allRows.length} playoff_matches_meta rows`)

    // Group by season+division
    const groups = new Map<string, MetaRow[]>()
    for (const row of allRows) {
        const key = `${row.season}-${row.division}`
        const group = groups.get(key) || []
        group.push(row)
        groups.set(key, group)
    }

    let updated = 0

    for (const [groupKey, rows] of groups) {
        console.log(`\nProcessing group ${groupKey} (${rows.length} matches)`)

        // For each row, compute forward references
        for (const row of rows) {
            let nextMatchNum: number | null = null
            let nextLoserMatchNum: number | null = null

            // Find which row references this match's winner or loser
            for (const other of rows) {
                if (other.id === row.id) continue

                for (const source of [other.homeSource, other.awaySource]) {
                    const parsed = parseWinnerLoserRef(source)
                    if (!parsed || parsed.value !== row.matchNum) continue

                    if (parsed.kind === "winner" && nextMatchNum === null) {
                        nextMatchNum = other.matchNum
                    }
                    if (parsed.kind === "loser" && nextLoserMatchNum === null) {
                        nextLoserMatchNum = other.matchNum
                    }
                }
            }

            console.log(
                `  Match #${row.matchNum}: next=${nextMatchNum ?? "—"}, nextLoser=${nextLoserMatchNum ?? "—"}`
            )

            await db
                .update(playoffMatchesMeta)
                .set({
                    next_match_num: nextMatchNum,
                    next_loser_match_num: nextLoserMatchNum
                })
                .where(eq(playoffMatchesMeta.id, row.id))

            updated++
        }
    }

    console.log(`\nDone. Updated ${updated} rows.`)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Backfill failed:", error)
        process.exit(1)
    })
