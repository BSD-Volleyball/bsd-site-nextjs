"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import { seasons, seasonEvents, eventTimeSlots } from "@/database/schema"
import { eq, asc, desc, inArray } from "drizzle-orm"
import { isAdminOrDirectorBySession, getSessionUserId } from "@/lib/rbac"
import { logAuditEntry } from "@/lib/audit-log"

export type EventType =
    | "tryout"
    | "regular_season"
    | "playoff"
    | "draft"
    | "captain_select"
    | "late_date"

export interface TimeSlotData {
    start_time: string
    slot_label: string | null
    sort_order: number
}

export interface EventData {
    event_type: EventType
    event_date: string
    sort_order: number
    label: string | null
    time_slots: TimeSlotData[]
}

export interface SeasonMetadata {
    season_amount: string
    late_amount: string
    max_players: number | null
}

export interface SeasonConfigData {
    seasonId: number
    year: number
    seasonName: string
    code: string
    phase: string
    season_amount: string | null
    late_amount: string | null
    max_players: number | null
    events: {
        id: number
        event_type: EventType
        event_date: string
        sort_order: number
        label: string | null
        time_slots: {
            id: number
            start_time: string
            slot_label: string | null
            sort_order: number
        }[]
    }[]
}

export async function getSeasonConfigData(): Promise<{
    status: boolean
    message?: string
    data?: SeasonConfigData
}> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        const [season] = await db
            .select()
            .from(seasons)
            .orderBy(desc(seasons.id))
            .limit(1)

        if (!season) {
            return { status: false, message: "No seasons found" }
        }

        const eventRows = await db
            .select()
            .from(seasonEvents)
            .where(eq(seasonEvents.season_id, season.id))
            .orderBy(asc(seasonEvents.event_type), asc(seasonEvents.sort_order))

        const eventIds = eventRows.map((e) => e.id)
        let timeSlotRows: (typeof eventTimeSlots.$inferSelect)[] = []
        if (eventIds.length > 0) {
            timeSlotRows = await db
                .select()
                .from(eventTimeSlots)
                .where(inArray(eventTimeSlots.event_id, eventIds))
                .orderBy(asc(eventTimeSlots.sort_order))
        }

        const slotsByEvent = new Map<
            number,
            {
                id: number
                start_time: string
                slot_label: string | null
                sort_order: number
            }[]
        >()
        for (const ts of timeSlotRows) {
            const slots = slotsByEvent.get(ts.event_id) || []
            slots.push({
                id: ts.id,
                start_time: ts.start_time,
                slot_label: ts.slot_label,
                sort_order: ts.sort_order
            })
            slotsByEvent.set(ts.event_id, slots)
        }

        const events = eventRows.map((e) => ({
            id: e.id,
            event_type: e.event_type as EventType,
            event_date: e.event_date,
            sort_order: e.sort_order,
            label: e.label,
            time_slots: slotsByEvent.get(e.id) || []
        }))

        return {
            status: true,
            data: {
                seasonId: season.id,
                year: season.year,
                seasonName: season.season,
                code: season.code,
                phase: season.phase,
                season_amount: season.season_amount,
                late_amount: season.late_amount,
                max_players: season.max_players,
                events
            }
        }
    } catch (error) {
        console.error("Failed to load season config:", error)
        return { status: false, message: "Failed to load season configuration" }
    }
}

export async function saveSeasonConfig(
    seasonId: number,
    metadata: SeasonMetadata,
    events: EventData[]
): Promise<{ status: boolean; message: string }> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) {
        return { status: false, message: "Unauthorized" }
    }

    if (!seasonId || seasonId <= 0) {
        return { status: false, message: "Invalid season ID" }
    }

    try {
        await db.transaction(async (tx) => {
            // Update season metadata
            await tx
                .update(seasons)
                .set({
                    season_amount: metadata.season_amount || null,
                    late_amount: metadata.late_amount || null,
                    max_players: metadata.max_players
                })
                .where(eq(seasons.id, seasonId))

            // Delete existing events (cascades to time slots)
            await tx
                .delete(seasonEvents)
                .where(eq(seasonEvents.season_id, seasonId))

            // Insert new events and their time slots
            for (const event of events) {
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

                if (event.time_slots.length > 0) {
                    await tx.insert(eventTimeSlots).values(
                        event.time_slots.map((slot) => ({
                            event_id: inserted.id,
                            start_time: slot.start_time,
                            slot_label: slot.slot_label || null,
                            sort_order: slot.sort_order
                        }))
                    )
                }
            }
        })

        const userId = await getSessionUserId()
        if (userId) {
            await logAuditEntry({
                userId,
                action: "update_season_config",
                entityType: "season",
                entityId: seasonId,
                summary: `Updated season configuration: ${events.length} events`
            })
        }

        revalidatePath("/dashboard/season-config")
        revalidatePath("/dashboard")
        return {
            status: true,
            message: "Season configuration saved successfully"
        }
    } catch (error) {
        console.error("Failed to save season config:", error)
        return { status: false, message: "Failed to save season configuration" }
    }
}
