// Split discounts that were redeemed more than once into one row per
// redemption.
//
// Historically a comp (e.g. a director's permanent free season) was reissued by
// editing the discount, which reset `used` back to false — so a single
// discounts row could pay for signups in several seasons. That makes
// `used_signup_id` lossy (it can only point at the latest redemption) and makes
// "was this code already used?" unanswerable.
//
// This script mints a synthetic discount row for every *earlier* redemption,
// leaving the original row attached to its most recent one, so nothing in the
// current season moves. Signups whose `order_id` is `FREE-<originalId>` are
// repointed at the synthetic row that now owns that redemption, keeping the
// order id and used_signup_id in agreement.
//
// Redemptions are recovered the same two ways as
// scripts/backfill-discount-usage.ts: `FREE-<discountId>` order ids for full
// comps, and a payment equal to the discounted season/late fee for partial
// ones.
//
// Usage:
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/split-reused-discounts.ts
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/split-reused-discounts.ts --apply
import "dotenv/config"
import { eq } from "drizzle-orm"
import { db } from "../src/database/db"
import { discounts, seasons, signups } from "../src/database/schema"

const APPLY = process.argv.includes("--apply")

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
        .select()
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

    const reused: Array<{
        discount: (typeof usedDiscounts)[number]
        redemptions: typeof allSignups
    }> = []

    for (const discount of usedDiscounts) {
        const percentage = Number.parseFloat(discount.percentage)
        const redemptions = allSignups.filter((signup) => {
            if (signup.player !== discount.user) return false
            if (signup.orderId === `FREE-${discount.id}`) return true
            if (discount.scope !== "season") return false
            if (!Number.isFinite(percentage) || percentage >= 100) return false
            if (signup.createdAt < discount.created_at) return false
            const paid = money(signup.amountPaid)
            const season = seasonById.get(signup.season)
            if (paid === null || !season) return false
            const base = money(season.seasonAmount)
            const late = money(season.lateAmount)
            return (
                (base !== null &&
                    paid === discountedAmount(base, percentage)) ||
                (late !== null && paid === discountedAmount(late, percentage))
            )
        })
        if (redemptions.length > 1) {
            reused.push({
                discount,
                // Newest first: the original row keeps redemptions[0].
                redemptions: redemptions.sort((a, b) => b.season - a.season)
            })
        }
    }

    if (reused.length === 0) {
        console.log("No discount has more than one redemption. Nothing to do.")
        process.exit(0)
    }

    console.log(`Discounts with multiple redemptions: ${reused.length}\n`)
    console.table(
        reused.flatMap(({ discount, redemptions }) =>
            redemptions.map((signup, index) => ({
                discount: discount.id,
                reason: discount.reason ?? "",
                signup: signup.id,
                season: seasonById.get(signup.season)?.code ?? signup.season,
                orderId: signup.orderId,
                disposition:
                    index === 0
                        ? "keeps original discount row"
                        : "moves to a new discount row"
            }))
        )
    )

    if (!APPLY) {
        console.log("\nDry run. Re-run with --apply to split these rows.")
        process.exit(0)
    }

    let created = 0
    let repointed = 0
    await db.transaction(async (tx) => {
        for (const { discount, redemptions } of reused) {
            for (const signup of redemptions.slice(1)) {
                const [synthetic] = await tx
                    .insert(discounts)
                    .values({
                        user: discount.user,
                        percentage: discount.percentage,
                        expiration: discount.expiration,
                        reason: discount.reason,
                        scope: discount.scope,
                        used: true,
                        used_at: signup.createdAt,
                        used_signup_id: signup.id,
                        created_at: discount.created_at
                    })
                    .returning({ id: discounts.id })
                created++

                if (signup.orderId === `FREE-${discount.id}`) {
                    await tx
                        .update(signups)
                        .set({ order_id: `FREE-${synthetic.id}` })
                        .where(eq(signups.id, signup.id))
                    repointed++
                }
                console.log(
                    `  discount ${discount.id} → new discount ${synthetic.id} for signup ${signup.id}`
                )
            }
        }
    })

    console.log(
        `\nCreated ${created} discount rows; repointed ${repointed} signup order ids.`
    )
    process.exit(0)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
