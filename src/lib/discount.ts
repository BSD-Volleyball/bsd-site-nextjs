import { db, type DbExecutor } from "@/database/db"
import { discounts } from "@/database/schema"
import { eq, and, or, isNull, gt } from "drizzle-orm"

export interface UserDiscount {
    id: number
    percentage: string
    expiration: Date | null
}

export type DiscountScope = "season" | "tournament"

export async function getActiveDiscountForUser(
    userId: string,
    scope: DiscountScope
): Promise<UserDiscount | null> {
    const now = new Date()

    const [discount] = await db
        .select({
            id: discounts.id,
            percentage: discounts.percentage,
            expiration: discounts.expiration
        })
        .from(discounts)
        .where(
            and(
                eq(discounts.user, userId),
                eq(discounts.used, false),
                eq(discounts.scope, scope),
                or(isNull(discounts.expiration), gt(discounts.expiration, now))
            )
        )
        .limit(1)

    return discount
        ? {
              id: discount.id,
              percentage: discount.percentage || "0",
              expiration: discount.expiration
          }
        : null
}

/**
 * Consume a discount. `signupId` records which season signup the discount was
 * applied to, so "who used a discount this season" is answerable later — the
 * `used` flag alone is a lifetime flag and cannot be scoped to a season.
 * Tournament-scope discounts are consumed against a tournament team rather than
 * a signup, so they record only `used_at`.
 */
export async function markDiscountAsUsed(
    discountId: number,
    executor: DbExecutor = db,
    signupId?: number
): Promise<void> {
    await executor
        .update(discounts)
        .set({
            used: true,
            used_at: new Date(),
            used_signup_id: signupId ?? null
        })
        .where(eq(discounts.id, discountId))
}

export function calculateDiscountedAmount(
    baseAmount: string,
    discountPercentage: string
): string {
    const base = parseFloat(baseAmount)
    const discount = parseFloat(discountPercentage)
    const discounted = base * (1 - discount / 100)
    return discounted.toFixed(2)
}
