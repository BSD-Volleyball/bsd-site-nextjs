/**
 * Backfill `waiver_acceptances` rows for users who signed up *before* the
 * waiver-acceptance feature shipped.
 *
 * IMPORTANT INTENT: This is administrative reconciliation, NOT a fresh consent
 * event. The `accepted_at` we write is the first tryout date of the target
 * season — used as a proxy because every signed-up player was confirmed in the
 * league as of that date and the v1 waiver text matches what they were shown
 * at signup time. Do not interpret these rows as "the user clicked at that
 * timestamp."
 *
 * Idempotent: the unique (user_id, waiver_id) index turns repeat runs into
 * no-ops. Safe to re-run; safe to run after some users have already accepted
 * via the new UI (their genuine row stays untouched).
 *
 * Refuses to run if the active waiver isn't the one explicitly targeted, so we
 * never attribute acceptance against the wrong version's content.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/backfill-waiver-acceptances.ts \
 *     [--season-id <n>] [--waiver-id <n>]
 *
 * Both flags are optional. With no flags, uses the current season (highest id)
 * and the active waiver, and requires there to be exactly one waiver row
 * (i.e. v1 still in place) — otherwise the operator must pass --waiver-id
 * explicitly to acknowledge that newer versions exist.
 */

import "dotenv/config"
import { drizzle } from "drizzle-orm/node-postgres"
import { eq, sql } from "drizzle-orm"
import {
    signups,
    seasons,
    seasonEvents,
    waivers,
    waiverAcceptances
} from "../src/database/schema"

function parseFlag(name: string): string | undefined {
    const idx = process.argv.indexOf(`--${name}`)
    if (idx === -1) return undefined
    return process.argv[idx + 1]
}

async function main() {
    const db = drizzle(process.env.DATABASE_URL!)

    let seasonId: number
    const seasonFlag = parseFlag("season-id")
    if (seasonFlag) {
        seasonId = Number.parseInt(seasonFlag, 10)
        if (!Number.isInteger(seasonId) || seasonId <= 0) {
            throw new Error(`Invalid --season-id ${seasonFlag}`)
        }
    } else {
        const [latest] = await db
            .select({ id: seasons.id })
            .from(seasons)
            .orderBy(sql`${seasons.id} DESC`)
            .limit(1)
        if (!latest) throw new Error("No seasons found in DB.")
        seasonId = latest.id
    }

    const [tryoutRow] = await db
        .select({
            minDate: sql<string | null>`MIN(${seasonEvents.event_date})`
        })
        .from(seasonEvents)
        .where(
            sql`${seasonEvents.season_id} = ${seasonId} AND ${seasonEvents.event_type} = 'tryout'`
        )

    if (!tryoutRow?.minDate) {
        throw new Error(
            `Season ${seasonId} has no tryout events; cannot pick a backfill date.`
        )
    }
    const acceptedAt = new Date(`${tryoutRow.minDate}T00:00:00`)
    if (Number.isNaN(acceptedAt.getTime())) {
        throw new Error(
            `Could not parse first tryout date "${tryoutRow.minDate}"`
        )
    }

    const waiverFlag = parseFlag("waiver-id")
    let waiverId: number
    if (waiverFlag) {
        waiverId = Number.parseInt(waiverFlag, 10)
        if (!Number.isInteger(waiverId) || waiverId <= 0) {
            throw new Error(`Invalid --waiver-id ${waiverFlag}`)
        }
        const [exists] = await db
            .select({ id: waivers.id })
            .from(waivers)
            .where(eq(waivers.id, waiverId))
            .limit(1)
        if (!exists) throw new Error(`Waiver id ${waiverId} not found.`)
    } else {
        const allWaivers = await db
            .select({ id: waivers.id, active: waivers.active })
            .from(waivers)
        if (allWaivers.length === 0) {
            throw new Error("No waivers exist; run seed-initial-waiver first.")
        }
        if (allWaivers.length > 1) {
            throw new Error(
                `Multiple waiver versions exist (${allWaivers.length}). Pass --waiver-id <n> explicitly to acknowledge which version users were shown at signup.`
            )
        }
        if (!allWaivers[0].active) {
            throw new Error(
                `Sole waiver row (id=${allWaivers[0].id}) is not active; refusing to attribute acceptance.`
            )
        }
        waiverId = allWaivers[0].id
    }

    const signedUp = await db
        .selectDistinct({ userId: signups.player })
        .from(signups)
        .where(eq(signups.season, seasonId))

    if (signedUp.length === 0) {
        console.log(`No signups found for season ${seasonId}. Nothing to do.`)
        return
    }

    let inserted = 0
    let skipped = 0
    for (const { userId } of signedUp) {
        const result = await db
            .insert(waiverAcceptances)
            .values({
                user_id: userId,
                waiver_id: waiverId,
                accepted_at: acceptedAt
            })
            .onConflictDoNothing({
                target: [waiverAcceptances.user_id, waiverAcceptances.waiver_id]
            })
            .returning({ id: waiverAcceptances.id })
        if (result.length > 0) inserted++
        else skipped++
    }

    console.log(
        `Backfill complete: inserted ${inserted}, skipped ${skipped} (already accepted), season=${seasonId}, waiver=${waiverId}, dated=${acceptedAt.toISOString().slice(0, 10)}.`
    )
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
