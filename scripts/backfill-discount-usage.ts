// Backfill discounts.used_signup_id / discounts.used_at.
//
// Before the used_signup_id column existed, `discounts.used` was the only
// record that a code had been redeemed — a lifetime boolean with no link to the
// season or signup it paid for. That made "who used a discount this season?"
// unanswerable, so the admin signups accounting card listed anyone who had
// *ever* redeemed a code, including full-price payers.
//
// Two matching passes recover the link from existing data:
//   1. Exact — a 100% discount writes `order_id = "FREE-<discountId>"` on the
//      signup it created (see src/app/dashboard/pay-season/actions.ts).
//   2. Amount — a partial discount leaves only a reduced `amount_paid`, so we
//      match signups whose payment equals the discounted season fee (or late
//      fee) and that were created after the discount was granted.
//
// Note: permanent comps (e.g. "director") are reset to unused and reused each
// season, so a single discount row can have several historical redemptions.
// used_signup_id records the most recent one, which is what season-scoped
// reporting needs.
//
// Usage:
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/backfill-discount-usage.ts
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/backfill-discount-usage.ts --apply
import "dotenv/config"
import { eq } from "drizzle-orm"
import { db } from "../src/database/db"
import { discounts, seasons, signups } from "../src/database/schema"

const APPLY = process.argv.includes("--apply")

interface Match {
    discountId: number
    signupId: number
    seasonId: number
    usedAt: Date
    how: "free-order-id" | "discounted-amount"
}

function money(value: string | null): number | null {
    if (value === null) return null
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
}

function discountedAmount(base: number, percentage: number): number {
    return Number.parseFloat((base * (1 - percentage / 100)).toFixed(2))
}

async function main() {
    const usedDiscounts = await db
        .select({
            id: discounts.id,
            user: discounts.user,
            percentage: discounts.percentage,
            scope: discounts.scope,
            reason: discounts.reason,
            createdAt: discounts.created_at
        })
        .from(discounts)
        .where(eq(discounts.used, true))

    const allSignups = await db
        .select({
            id: signups.id,
            season: signups.season,
            player: signups.player,
            orderId: signups.order_id,
            amountPaid: signups.amount_paid,
            createdAt: signups.created_at
        })
        .from(signups)

    const seasonRows = await db
        .select({
            id: seasons.id,
            code: seasons.code,
            seasonAmount: seasons.season_amount,
            lateAmount: seasons.late_amount
        })
        .from(seasons)
    const seasonById = new Map(seasonRows.map((s) => [s.id, s]))

    const signupsByPlayer = new Map<string, typeof allSignups>()
    for (const signup of allSignups) {
        const list = signupsByPlayer.get(signup.player) ?? []
        list.push(signup)
        signupsByPlayer.set(signup.player, list)
    }

    const matches: Match[] = []
    const claimedSignupIds = new Set<number>()
    const unmatched: Array<{ id: number; why: string }> = []

    // Pass 1: exact FREE-<discountId> order IDs (100% discounts).
    for (const discount of usedDiscounts) {
        const freeSignups = allSignups
            .filter((s) => s.orderId === `FREE-${discount.id}`)
            .sort((a, b) => b.season - a.season)
        if (freeSignups.length === 0) continue
        const latest = freeSignups[0]
        if (freeSignups.length > 1) {
            console.log(
                `  discount ${discount.id}: reused across seasons ${freeSignups
                    .map((s) => s.season)
                    .join(", ")} — recording the latest (signup ${latest.id})`
            )
        }
        matches.push({
            discountId: discount.id,
            signupId: latest.id,
            seasonId: latest.season,
            usedAt: latest.createdAt,
            how: "free-order-id"
        })
        claimedSignupIds.add(latest.id)
    }

    const matchedIds = new Set(matches.map((m) => m.discountId))

    // Pass 2: partial discounts, matched by the reduced amount paid.
    for (const discount of usedDiscounts) {
        if (matchedIds.has(discount.id)) continue
        if (discount.scope !== "season") {
            unmatched.push({
                id: discount.id,
                why: `${discount.scope}-scope discount — consumed against a tournament team, not a signup`
            })
            continue
        }
        const percentage = Number.parseFloat(discount.percentage)
        if (!Number.isFinite(percentage) || percentage <= 0) {
            unmatched.push({ id: discount.id, why: "unusable percentage" })
            continue
        }

        const candidates = (signupsByPlayer.get(discount.user) ?? [])
            .filter((signup) => {
                if (claimedSignupIds.has(signup.id)) return false
                if (signup.createdAt < discount.createdAt) return false
                const paid = money(signup.amountPaid)
                const season = seasonById.get(signup.season)
                if (paid === null || !season) return false
                const base = money(season.seasonAmount)
                const late = money(season.lateAmount)
                return (
                    (base !== null &&
                        paid === discountedAmount(base, percentage)) ||
                    (late !== null &&
                        paid === discountedAmount(late, percentage))
                )
            })
            .sort((a, b) => b.season - a.season)

        if (candidates.length === 0) {
            unmatched.push({
                id: discount.id,
                why: "no signup with a matching discounted amount"
            })
            continue
        }
        const latest = candidates[0]
        matches.push({
            discountId: discount.id,
            signupId: latest.id,
            seasonId: latest.season,
            usedAt: latest.createdAt,
            how: "discounted-amount"
        })
        claimedSignupIds.add(latest.id)
    }

    console.log(
        `\nUsed discounts: ${usedDiscounts.length} | matched: ${matches.length} | unmatched: ${unmatched.length}\n`
    )
    console.table(
        matches
            .sort((a, b) => a.discountId - b.discountId)
            .map((m) => ({
                discount: m.discountId,
                signup: m.signupId,
                season: seasonById.get(m.seasonId)?.code ?? m.seasonId,
                usedAt: m.usedAt.toISOString().slice(0, 10),
                how: m.how,
                reason:
                    usedDiscounts.find((d) => d.id === m.discountId)?.reason ??
                    ""
            }))
    )
    if (unmatched.length > 0) {
        console.log("Left NULL (usage could not be proven):")
        console.table(
            unmatched.map((u) => ({
                discount: u.id,
                reason: usedDiscounts.find((d) => d.id === u.id)?.reason ?? "",
                why: u.why
            }))
        )
    }

    if (!APPLY) {
        console.log("\nDry run. Re-run with --apply to write these rows.")
        process.exit(0)
    }

    await db.transaction(async (tx) => {
        for (const match of matches) {
            await tx
                .update(discounts)
                .set({
                    used_signup_id: match.signupId,
                    used_at: match.usedAt
                })
                .where(eq(discounts.id, match.discountId))
        }
    })
    console.log(`\nApplied ${matches.length} updates.`)
    process.exit(0)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
