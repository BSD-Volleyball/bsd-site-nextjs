"use server"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { revalidateCalendarFeeds } from "@/next/calendar-invalidation"
import { withAction, ok, fail, requirePositiveInt } from "@/next/action-helpers"
import { revalidatePath, updateTag } from "next/cache"
import { SEASON_CONFIG_TAG } from "@/next/public-cache"
import { db } from "@/database/db"
import { seasons, seasonEvents, eventTimeSlots } from "@/database/schema"
import { and, eq, inArray } from "drizzle-orm"
import { isAdminOrDirectorBySession, getSessionUserId } from "@/next/session"
import { logAuditEntry } from "@/lib/audit-log"
import { countUnavailablePlayersByEvent } from "./data"

export type EventType =
    | "tryout"
    | "regular_season"
    | "playoff"
    | "draft"
    | "captain_select"
    | "late_date"

export interface TimeSlotData {
    /**
     * The existing event_time_slots row, or null for a slot the admin just
     * added. Load-bearing for the same reason as EventData.id: tryout
     * volunteer assignments reference slot ids (ON DELETE CASCADE), so a
     * save must update slots in place rather than delete and reinsert them.
     */
    id: number | null
    start_time: string
    slot_label: string | null
    sort_order: number
}

export interface EventData {
    /**
     * The existing season_events row this entry maps to, or null for an event
     * the admin just added. Load-bearing: matching on id lets a save update
     * rows in place instead of deleting and reinserting them, which would
     * cascade away every user_unavailability row pointing at the old ids.
     */
    id: number | null
    event_type: EventType
    event_date: string
    sort_order: number
    label: string | null
    time_slots: TimeSlotData[]
}

export interface SaveSeasonConfigOptions {
    /**
     * Permit dropping events that players have already marked themselves
     * unavailable for. Without it such a save is refused, because the delete
     * cascades to user_unavailability and the entries cannot be recovered.
     */
    confirmDeletions?: boolean
}

export interface SeasonMetadata {
    season_amount: string
    late_amount: string
    max_players: number | null
    certified_ref_rate: string
    uncertified_ref_rate: string
}

export const saveSeasonConfig = withAction(
    async (
        seasonId: number,
        metadata: SeasonMetadata,
        events: EventData[],
        options: SaveSeasonConfigOptions = {}
    ): Promise<ActionResult> => {
        requirePositiveInt(seasonId, "season ID")
        const isAdmin = await isAdminOrDirectorBySession()
        if (!isAdmin) {
            return fail("Unauthorized")
        }

        const existingEvents = await db
            .select({
                id: seasonEvents.id,
                event_date: seasonEvents.event_date,
                label: seasonEvents.label
            })
            .from(seasonEvents)
            .where(eq(seasonEvents.season_id, seasonId))
        const existingById = new Map(existingEvents.map((e) => [e.id, e]))

        // Every id the payload claims must be an event of THIS season, and no
        // id may appear twice — otherwise a malformed payload could retarget
        // another season's dates or leave rows orphaned.
        const keptIds = new Set<number>()
        for (const event of events) {
            if (event.id === null) continue
            if (!existingById.has(event.id)) {
                return fail(
                    "This season's dates changed while you were editing. Reload the page and try again."
                )
            }
            if (keptIds.has(event.id)) {
                return fail("The same date was submitted twice.")
            }
            keptIds.add(event.id)
        }

        const removedIds = existingEvents
            .map((e) => e.id)
            .filter((id) => !keptIds.has(id))

        // Same guard for time slots: an id must belong to the event it is
        // submitted under, and can't be claimed twice.
        const existingSlots =
            existingEvents.length > 0
                ? await db
                      .select({
                          id: eventTimeSlots.id,
                          event_id: eventTimeSlots.event_id
                      })
                      .from(eventTimeSlots)
                      .where(
                          inArray(
                              eventTimeSlots.event_id,
                              existingEvents.map((e) => e.id)
                          )
                      )
                : []
        const slotEventById = new Map(
            existingSlots.map((s) => [s.id, s.event_id])
        )
        const keptSlotIds = new Set<number>()
        for (const event of events) {
            for (const slot of event.time_slots) {
                if (slot.id === null || slot.id === undefined) continue
                if (
                    event.id === null ||
                    slotEventById.get(slot.id) !== event.id ||
                    keptSlotIds.has(slot.id)
                ) {
                    return fail(
                        "This season's time slots changed while you were editing. Reload the page and try again."
                    )
                }
                keptSlotIds.add(slot.id)
            }
        }

        // Deleting an event cascades to user_unavailability, so a removal that
        // would take player-entered availability with it needs explicit intent.
        if (removedIds.length > 0 && !options.confirmDeletions) {
            const counts = await countUnavailablePlayersByEvent(removedIds)
            if (counts.size > 0) {
                const described = [...counts].map(([eventId, count]) => {
                    const event = existingById.get(eventId)
                    const name = event?.label || event?.event_date || "a date"
                    return `${name} (${count} ${count === 1 ? "player" : "players"})`
                })
                return fail(
                    `Removing ${described.join(", ")} would permanently delete availability players have already entered. Confirm the removal to proceed.`
                )
            }
        }

        try {
            await db.transaction(async (tx) => {
                // Update season metadata
                await tx
                    .update(seasons)
                    .set({
                        season_amount: metadata.season_amount || null,
                        late_amount: metadata.late_amount || null,
                        max_players: metadata.max_players,
                        certified_ref_rate: metadata.certified_ref_rate || null,
                        uncertified_ref_rate:
                            metadata.uncertified_ref_rate || null
                    })
                    .where(eq(seasons.id, seasonId))

                // Update events in place / insert the new ones. Time slots
                // get the same treatment — tryout volunteer assignments
                // reference slot ids with ON DELETE CASCADE, so replacing
                // them wholesale would silently drop every per-session
                // assignment on an otherwise no-op save.
                for (const event of events) {
                    let eventId = event.id
                    if (eventId === null) {
                        const [inserted] = await tx
                            .insert(seasonEvents)
                            .values({
                                season_id: seasonId,
                                event_type: event.event_type,
                                event_date: event.event_date,
                                sort_order: event.sort_order,
                                label: event.label || null
                            })
                            .returning({ id: seasonEvents.id })
                        eventId = inserted.id
                    } else {
                        await tx
                            .update(seasonEvents)
                            .set({
                                event_type: event.event_type,
                                event_date: event.event_date,
                                sort_order: event.sort_order,
                                label: event.label || null
                            })
                            .where(eq(seasonEvents.id, eventId))
                    }

                    const keptForEvent = new Set<number>()
                    for (const slot of event.time_slots) {
                        if (slot.id === null || slot.id === undefined) {
                            await tx.insert(eventTimeSlots).values({
                                event_id: eventId,
                                start_time: slot.start_time,
                                slot_label: slot.slot_label || null,
                                sort_order: slot.sort_order
                            })
                            continue
                        }
                        keptForEvent.add(slot.id)
                        await tx
                            .update(eventTimeSlots)
                            .set({
                                start_time: slot.start_time,
                                slot_label: slot.slot_label || null,
                                sort_order: slot.sort_order
                            })
                            .where(eq(eventTimeSlots.id, slot.id))
                    }

                    // Slots the admin removed go away (and take any volunteer
                    // assignments in that session with them — that IS the
                    // admin's intent when they delete a session).
                    if (event.id !== null) {
                        const staleSlotIds = existingSlots
                            .filter(
                                (s) =>
                                    s.event_id === event.id &&
                                    !keptForEvent.has(s.id)
                            )
                            .map((s) => s.id)
                        if (staleSlotIds.length > 0) {
                            await tx
                                .delete(eventTimeSlots)
                                .where(inArray(eventTimeSlots.id, staleSlotIds))
                        }
                    }
                }

                if (removedIds.length > 0) {
                    await tx
                        .delete(seasonEvents)
                        .where(
                            and(
                                eq(seasonEvents.season_id, seasonId),
                                inArray(seasonEvents.id, removedIds)
                            )
                        )
                }
            })

            const userId = await getSessionUserId()
            if (userId) {
                await logAuditEntry({
                    userId,
                    action: "update_season_config",
                    entityType: "season",
                    entityId: seasonId,
                    // Spell out the destructive part: the old summary said only
                    // "N events" while silently dropping player availability.
                    summary: `Updated season configuration: ${events.length} events (${events.length - keptIds.size} added, ${removedIds.length} removed)`
                })
            }

            revalidatePath("/dashboard/season-config")
            revalidatePath("/dashboard")
            // Public season-info page renders these dates/pricing
            revalidatePath("/season-info")
            updateTag(SEASON_CONFIG_TAG)
            revalidateCalendarFeeds()
            return ok(undefined, "Season configuration saved successfully")
        } catch (error) {
            logger.error("Failed to save season config", undefined, error)
            return fail("Failed to save season configuration")
        }
    }
)
