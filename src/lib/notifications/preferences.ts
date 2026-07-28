/**
 * preferences.ts — Reads and writes per-type notification opt-outs.
 *
 * Storage is opt-out rows only (notification_optouts): no row means the user
 * receives that type. Mandatory types are rejected at the write boundary so
 * they can never accumulate rows.
 */

import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import { notificationOptouts } from "@/database/schema"
import {
    NOTIFICATION_TYPES,
    type NotificationType,
    isNotificationType
} from "./types"

export async function getOptedOutTypes(
    userId: string
): Promise<Set<NotificationType>> {
    const rows = await db
        .select({ type: notificationOptouts.notification_type })
        .from(notificationOptouts)
        .where(eq(notificationOptouts.user_id, userId))
    return new Set(rows.map((r) => r.type).filter(isNotificationType))
}

/**
 * Batch form used by the dispatcher: of these users, which have opted out of
 * this type? One indexed query regardless of recipient count.
 */
export async function getOptedOutUserIds(
    type: NotificationType,
    userIds: string[]
): Promise<Set<string>> {
    if (userIds.length === 0) return new Set()
    const rows = await db
        .select({ userId: notificationOptouts.user_id })
        .from(notificationOptouts)
        .where(
            and(
                eq(notificationOptouts.notification_type, type),
                inArray(notificationOptouts.user_id, userIds)
            )
        )
    return new Set(rows.map((r) => r.userId))
}

/**
 * Replaces the user's full opt-out set. Returns the diff so callers can run
 * category-level Postmark suppression sync only when something changed.
 * Throws on unknown or mandatory types — validate user input before calling
 * or let withAction turn this into a failed ActionResult.
 */
export async function setUserOptouts(
    userId: string,
    optedOut: NotificationType[]
): Promise<{ added: NotificationType[]; removed: NotificationType[] }> {
    const requested = new Set(optedOut)
    for (const type of requested) {
        if (!isNotificationType(type)) {
            throw new Error(`Unknown notification type: ${type}`)
        }
        if (NOTIFICATION_TYPES[type].mandatory) {
            throw new Error(`Notification type is mandatory: ${type}`)
        }
    }

    const current = await getOptedOutTypes(userId)
    const added = [...requested].filter((t) => !current.has(t))
    const removed = [...current].filter((t) => !requested.has(t))
    if (added.length === 0 && removed.length === 0) {
        return { added, removed }
    }

    await db.transaction(async (tx) => {
        if (removed.length > 0) {
            await tx
                .delete(notificationOptouts)
                .where(
                    and(
                        eq(notificationOptouts.user_id, userId),
                        inArray(notificationOptouts.notification_type, removed)
                    )
                )
        }
        if (added.length > 0) {
            await tx
                .insert(notificationOptouts)
                .values(
                    added.map((type) => ({
                        user_id: userId,
                        notification_type: type
                    }))
                )
                .onConflictDoNothing()
        }
    })

    return { added, removed }
}

/**
 * Single-type opt-out used by the one-click unsubscribe endpoint. Idempotent.
 * Returns whether a new row was written (false when already opted out).
 */
export async function addOptout(
    userId: string,
    type: NotificationType
): Promise<boolean> {
    if (NOTIFICATION_TYPES[type].mandatory) {
        throw new Error(`Notification type is mandatory: ${type}`)
    }
    const inserted = await db
        .insert(notificationOptouts)
        .values({ user_id: userId, notification_type: type })
        .onConflictDoNothing()
        .returning({ id: notificationOptouts.id })
    return inserted.length > 0
}
