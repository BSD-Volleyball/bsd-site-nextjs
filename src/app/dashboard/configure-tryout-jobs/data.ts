import "server-only"

import { asc, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/database/db"
import {
    tryoutVolunteerAssignments,
    tryoutVolunteerJobs
} from "@/database/schema"
import {
    ok,
    requireAdmin,
    requireSeasonConfig,
    withAction,
    type ActionResult
} from "@/next/action-helpers"
import { formatSeasonLabel, getEventsByType } from "@/lib/season-utils"
import { getTryoutCourtNumbersByEvent } from "@/lib/tryout-volunteer-schedule"
import type {
    TryoutJobCourtScope,
    TryoutJobScope
} from "@/lib/tryout-volunteer-types"

export interface TryoutJobRow {
    id: number
    name: string
    needed: number
    scope: TryoutJobScope
    courtScope: TryoutJobCourtScope
    notes: string | null
    sortOrder: number
    /** How many people are currently assigned to any slot of this job. */
    assignmentCount: number
}

export interface TryoutNightView {
    eventId: number
    eventDate: string
    label: string | null
    /** Ordinal for display, e.g. 1 for the first tryout night. */
    ordinal: number
    timeSlots: { id: number; startTime: string; slotLabel: string | null }[]
    /** Courts in use this night; per-court jobs fan out over these. */
    courtNumbers: number[]
    jobs: TryoutJobRow[]
}

export interface ConfigureTryoutJobsView {
    seasonId: number
    seasonLabel: string
    nights: TryoutNightView[]
}

/**
 * Loads the season's tryout nights with their jobs. Returns null data when
 * the season has no tryout events configured yet, so the page can point the
 * admin at Season Configuration instead of rendering an empty shell.
 */
export const getConfigureTryoutJobsView = withAction(
    async (): Promise<ActionResult<ConfigureTryoutJobsView | null>> => {
        await requireAdmin()
        const config = await requireSeasonConfig()

        const tryoutEvents = getEventsByType(config, "tryout")
        if (tryoutEvents.length === 0) return ok(null)

        const [jobs, courtsByEvent] = await Promise.all([
            db
                .select()
                .from(tryoutVolunteerJobs)
                .where(eq(tryoutVolunteerJobs.season_id, config.seasonId))
                .orderBy(
                    asc(tryoutVolunteerJobs.sort_order),
                    asc(tryoutVolunteerJobs.id)
                ),
            getTryoutCourtNumbersByEvent(tryoutEvents.map((e) => e.id))
        ])

        const counts = new Map<number, number>()
        if (jobs.length > 0) {
            const rows = await db
                .select({
                    jobId: tryoutVolunteerAssignments.job_id,
                    total: sql<number>`count(*)::int`
                })
                .from(tryoutVolunteerAssignments)
                .where(
                    inArray(
                        tryoutVolunteerAssignments.job_id,
                        jobs.map((j) => j.id)
                    )
                )
                .groupBy(tryoutVolunteerAssignments.job_id)
            for (const row of rows) counts.set(row.jobId, row.total)
        }

        const nights: TryoutNightView[] = tryoutEvents.map((event, index) => ({
            eventId: event.id,
            eventDate: event.eventDate,
            label: event.label,
            ordinal: index + 1,
            timeSlots: [...event.timeSlots]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((s) => ({
                    id: s.id,
                    startTime: s.startTime,
                    slotLabel: s.slotLabel
                })),
            courtNumbers: courtsByEvent.get(event.id) ?? [],
            jobs: jobs
                .filter((j) => j.event_id === event.id)
                .map((j) => ({
                    id: j.id,
                    name: j.name,
                    needed: j.needed,
                    scope: j.scope,
                    courtScope: j.court_scope,
                    notes: j.notes,
                    sortOrder: j.sort_order,
                    assignmentCount: counts.get(j.id) ?? 0
                }))
        }))

        return ok({
            seasonId: config.seasonId,
            seasonLabel: formatSeasonLabel(config),
            nights
        })
    }
)
