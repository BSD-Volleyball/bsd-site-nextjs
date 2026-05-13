import { eq, sql } from "drizzle-orm"
import { db } from "@/database/db"
import { waivers, waiverAcceptances } from "@/database/schema"

export type ActiveWaiver = {
    id: number
    content: string
}

// Returns the currently published waiver (the lone row with active = true),
// or null if no waiver has been published yet. Callers that gate signup must
// handle null defensively.
export async function getActiveWaiver(): Promise<ActiveWaiver | null> {
    const [row] = await db
        .select({ id: waivers.id, content: waivers.content })
        .from(waivers)
        .where(eq(waivers.active, true))
        .limit(1)
    return row ?? null
}

// Records that `userId` accepted waiver version `waiverId`. Idempotent: the
// (user_id, waiver_id) unique index turns repeat calls into no-ops, so it is
// safe to invoke on every signup/waitlist join.
export async function recordWaiverAcceptance(
    userId: string,
    waiverId: number,
    acceptedAt: Date = new Date()
): Promise<void> {
    await db
        .insert(waiverAcceptances)
        .values({
            user_id: userId,
            waiver_id: waiverId,
            accepted_at: acceptedAt
        })
        .onConflictDoNothing({
            target: [waiverAcceptances.user_id, waiverAcceptances.waiver_id]
        })
}

// Atomically publishes a single waiver version: clears any existing active
// row and sets the target row to active in one transaction.
export async function publishWaiver(waiverId: number): Promise<void> {
    await db.transaction(async (tx) => {
        await tx
            .update(waivers)
            .set({ active: false })
            .where(eq(waivers.active, true))
        await tx
            .update(waivers)
            .set({ active: true })
            .where(eq(waivers.id, waiverId))
    })
}

// Inserts a new waiver version and (optionally) publishes it immediately. The
// content of an inserted row is immutable thanks to a DB trigger; there is no
// `updateWaiverContent` function on purpose.
export async function createWaiverVersion(
    content: string,
    createdBy: string,
    publishImmediately: boolean
): Promise<{ id: number }> {
    return await db.transaction(async (tx) => {
        const [inserted] = await tx
            .insert(waivers)
            .values({
                content,
                active: false,
                created_by: createdBy,
                created_at: new Date()
            })
            .returning({ id: waivers.id })

        if (publishImmediately) {
            await tx
                .update(waivers)
                .set({ active: false })
                .where(
                    sql`${waivers.active} = true AND ${waivers.id} <> ${inserted.id}`
                )
            await tx
                .update(waivers)
                .set({ active: true })
                .where(eq(waivers.id, inserted.id))
        }

        return { id: inserted.id }
    })
}
