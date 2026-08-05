// Scoped version of scripts/archive/backfill-playoff-forward-refs.ts:
// computes next_match_num / next_loser_match_num from W{n}/L{n} source tokens,
// but ONLY for seasons whose meta rows currently have zero forward refs, so
// app-authored modern brackets (F24+) are never touched.
import "dotenv/config"
import { eq, inArray, sql } from "drizzle-orm"
import { playoffMatchesMeta } from "../src/database/schema"
import { db } from "../src/database/db"

const APPLY = process.argv.includes("--apply")

function parseWinnerLoserRef(
    source: string
): { kind: "winner" | "loser"; value: number } | null {
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
    const broken = await db.execute(sql`
        select season from playoff_matches_meta
        group by season
        having count(*) filter (where next_match_num is not null) = 0
    `)
    const seasonIds = broken.rows.map((r) => Number(r.season))
    console.log(
        `Seasons with zero forward refs: ${seasonIds.sort((a, b) => a - b).join(", ")}`
    )
    if (seasonIds.length === 0) {
        console.log("Nothing to do.")
        process.exit(0)
    }

    const rows = await db
        .select({
            id: playoffMatchesMeta.id,
            season: playoffMatchesMeta.season,
            division: playoffMatchesMeta.division,
            matchNum: playoffMatchesMeta.match_num,
            homeSource: playoffMatchesMeta.home_source,
            awaySource: playoffMatchesMeta.away_source
        })
        .from(playoffMatchesMeta)
        .where(inArray(playoffMatchesMeta.season, seasonIds))

    const groups = new Map<string, typeof rows>()
    for (const row of rows) {
        const key = `${row.season}-${row.division}`
        const group = groups.get(key) || []
        group.push(row)
        groups.set(key, group)
    }

    let updated = 0
    let withNext = 0
    for (const [, group] of groups) {
        for (const row of group) {
            let nextMatchNum: number | null = null
            let nextLoserMatchNum: number | null = null
            for (const other of group) {
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
            if (nextMatchNum !== null) withNext++
            if (
                APPLY &&
                (nextMatchNum !== null || nextLoserMatchNum !== null)
            ) {
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
    }
    console.log(
        `${APPLY ? "Updated" : "[dry-run] Would update"} rows: ${APPLY ? updated : withNext} ` +
            `(${rows.length} rows scanned, ${withNext} gained a next_match_num)`
    )
    process.exit(0)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
