import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/database/db"

/**
 * Runs `fn` while holding a Postgres advisory lock on `key`, so two requests
 * for the same thing — one member paying twice from two tabs, two captains
 * taking the last spot in a division — run one after the other, and the
 * second one's pre-checks see what the first one wrote.
 *
 * Every payment flow checks, then charges the card, then records: nothing
 * stops two of them passing the check before either records. The unique
 * indexes catch the second insert, but by then the card is charged and a
 * refund is manual. Holding the lock across the charge turns that into a
 * clean "already paid" before any money moves.
 *
 * The lock is transaction-scoped and lives in a transaction that does
 * nothing else; it is released when `fn` settles, however it settles. The
 * writes inside `fn` keep their own transactions, so nothing about retries
 * or rollbacks changes. The cost is one pooled connection for the few
 * seconds the card takes to authorise.
 */
export async function withSerializedPayment<T>(
    key: string,
    fn: () => Promise<T>
): Promise<T> {
    return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`)
        return fn()
    })
}
