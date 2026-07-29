// Tryout timeslot requests: admin-entered records of which tryout time
// slots a player CAN attend for a given preseason week. Consumed by the
// create-week-1/2/3 roster builders (as a strong placement preference)
// and the admin management page.

import "server-only"

import { and, eq } from "drizzle-orm"
import { db } from "@/database/db"
import { tryoutSlotRequests } from "@/database/schema"

export interface TryoutSlotRequestInfo {
    /** 1-based slot numbers the player can attend (week 1: 1-2, weeks 2/3: 1-3). */
    availableSlots: number[]
    comment: string | null
}

export async function loadTryoutSlotRequests(
    seasonId: number,
    week: 1 | 2 | 3
): Promise<Map<string, TryoutSlotRequestInfo>> {
    const rows = await db
        .select({
            userId: tryoutSlotRequests.user_id,
            canSlot1: tryoutSlotRequests.can_slot_1,
            canSlot2: tryoutSlotRequests.can_slot_2,
            canSlot3: tryoutSlotRequests.can_slot_3,
            comment: tryoutSlotRequests.comment
        })
        .from(tryoutSlotRequests)
        .where(
            and(
                eq(tryoutSlotRequests.season, seasonId),
                eq(tryoutSlotRequests.week, week)
            )
        )

    const result = new Map<string, TryoutSlotRequestInfo>()
    for (const row of rows) {
        const availableSlots: number[] = []
        if (row.canSlot1) {
            availableSlots.push(1)
        }
        if (row.canSlot2) {
            availableSlots.push(2)
        }
        if (row.canSlot3 && week !== 1) {
            availableSlots.push(3)
        }

        if (availableSlots.length === 0) {
            continue
        }

        result.set(row.userId, {
            availableSlots,
            comment: row.comment
        })
    }

    return result
}
