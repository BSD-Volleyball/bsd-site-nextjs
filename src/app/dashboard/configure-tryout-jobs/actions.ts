"use server"

import { revalidatePath } from "next/cache"
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm"

import { db } from "@/database/db"
import {
    seasonEvents,
    seasons,
    tryoutVolunteerAssignments,
    tryoutVolunteerJobs
} from "@/database/schema"
import {
    ActionError,
    fail,
    ok,
    requireAdmin,
    requireNonEmptyString,
    requirePositiveInt,
    requireSeasonConfig,
    requireSession,
    withAction,
    type ActionResult
} from "@/lib/action-helpers"
import { logAuditEntry } from "@/lib/audit-log"
import { formatSeasonLabel, getEventsByType } from "@/lib/season-utils"
import {
    isTryoutJobScope,
    type TryoutJobScope
} from "@/lib/tryout-volunteer-types"

export interface TryoutJobRow {
    id: number
    name: string
    needed: number
    scope: TryoutJobScope
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
    jobs: TryoutJobRow[]
}

export interface ConfigureTryoutJobsView {
    seasonId: number
    seasonLabel: string
    nights: TryoutNightView[]
}

/** Payload shape posted by the client for one night's job list. */
export interface TryoutJobInput {
    /** null for rows added in the browser and not yet persisted. */
    id: number | null
    name: string
    needed: number
    scope: TryoutJobScope
    notes: string | null
}

const MAX_NEEDED = 50

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

        const jobs = await db
            .select()
            .from(tryoutVolunteerJobs)
            .where(eq(tryoutVolunteerJobs.season_id, config.seasonId))
            .orderBy(
                asc(tryoutVolunteerJobs.sort_order),
                asc(tryoutVolunteerJobs.id)
            )

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
            jobs: jobs
                .filter((j) => j.event_id === event.id)
                .map((j) => ({
                    id: j.id,
                    name: j.name,
                    needed: j.needed,
                    scope: j.scope,
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

/**
 * Replaces one tryout night's job list. Rows arriving with an id are
 * updated in place and rows without one are inserted; jobs missing from the
 * payload are deleted (which cascades to their assignments). Updating in
 * place rather than delete-and-reinsert is deliberate — a full replace
 * would silently drop every assignment on an otherwise no-op save.
 */
export const saveTryoutJobs = withAction(
    async (
        eventId: number,
        jobs: TryoutJobInput[]
    ): Promise<ActionResult<void>> => {
        const session = await requireSession()
        await requireAdmin()
        const config = await requireSeasonConfig()
        const eid = requirePositiveInt(eventId, "event ID")

        const [event] = await db
            .select()
            .from(seasonEvents)
            .where(eq(seasonEvents.id, eid))
            .limit(1)
        if (
            !event ||
            event.season_id !== config.seasonId ||
            event.event_type !== "tryout"
        ) {
            return fail("Tryout date not found in the current season.")
        }

        if (!Array.isArray(jobs)) return fail("Invalid job list.")

        const cleaned = jobs.map((job, index) => {
            const name = requireNonEmptyString(job.name, "Job name")
            const needed =
                typeof job.needed === "number" ? job.needed : Number(job.needed)
            if (
                !Number.isInteger(needed) ||
                needed < 1 ||
                needed > MAX_NEEDED
            ) {
                throw new ActionError(
                    `"${name}" needs a count between 1 and ${MAX_NEEDED}.`
                )
            }
            if (!isTryoutJobScope(job.scope)) {
                throw new ActionError(`"${name}" has an invalid scope.`)
            }
            return {
                id:
                    job.id === null
                        ? null
                        : requirePositiveInt(job.id, "job ID"),
                name,
                needed,
                scope: job.scope,
                notes: job.notes?.trim() ? job.notes.trim() : null,
                sortOrder: index
            }
        })

        const names = new Set<string>()
        for (const job of cleaned) {
            const key = job.name.toLowerCase()
            if (names.has(key)) {
                return fail(`Duplicate job name "${job.name}" on this date.`)
            }
            names.add(key)
        }

        const existing = await db
            .select({ id: tryoutVolunteerJobs.id })
            .from(tryoutVolunteerJobs)
            .where(eq(tryoutVolunteerJobs.event_id, eid))
        const existingIds = new Set(existing.map((row) => row.id))

        for (const job of cleaned) {
            if (job.id !== null && !existingIds.has(job.id)) {
                return fail(
                    "This date's jobs changed while you were editing. Reload and try again."
                )
            }
        }

        const keptIds = new Set(
            cleaned
                .map((job) => job.id)
                .filter((id): id is number => id !== null)
        )
        const removedIds = [...existingIds].filter((id) => !keptIds.has(id))

        await db.transaction(async (tx) => {
            for (const job of cleaned) {
                if (job.id === null) {
                    await tx.insert(tryoutVolunteerJobs).values({
                        season_id: config.seasonId,
                        event_id: eid,
                        name: job.name,
                        needed: job.needed,
                        scope: job.scope,
                        notes: job.notes,
                        sort_order: job.sortOrder
                    })
                    continue
                }

                // Switching scope invalidates existing assignments: a
                // whole-night job's rows carry a null time_slot_id that a
                // per-session job can never mean, and vice versa.
                const [previous] = await tx
                    .select({ scope: tryoutVolunteerJobs.scope })
                    .from(tryoutVolunteerJobs)
                    .where(eq(tryoutVolunteerJobs.id, job.id))
                    .limit(1)

                await tx
                    .update(tryoutVolunteerJobs)
                    .set({
                        name: job.name,
                        needed: job.needed,
                        scope: job.scope,
                        notes: job.notes,
                        sort_order: job.sortOrder
                    })
                    .where(eq(tryoutVolunteerJobs.id, job.id))

                if (previous && previous.scope !== job.scope) {
                    await tx
                        .delete(tryoutVolunteerAssignments)
                        .where(eq(tryoutVolunteerAssignments.job_id, job.id))
                }
            }

            if (removedIds.length > 0) {
                await tx
                    .delete(tryoutVolunteerJobs)
                    .where(inArray(tryoutVolunteerJobs.id, removedIds))
            }
        })

        await logAuditEntry({
            userId: session.user.id,
            action: "save_tryout_jobs",
            entityType: "tryout_volunteer_jobs",
            entityId: eid,
            summary: `Saved ${cleaned.length} volunteer job(s) for the ${event.event_date} tryout${
                removedIds.length > 0 ? ` (removed ${removedIds.length})` : ""
            }`
        })

        revalidatePath("/dashboard/configure-tryout-jobs")
        revalidatePath("/dashboard/assign-tryout-jobs")
        return ok(undefined, "Volunteer jobs saved.")
    }
)

/**
 * Copies the previous season's tryout volunteer jobs into this season,
 * matching tryout nights by their position in the season (1→1, 2→2, 3→3)
 * since dates obviously differ. Jobs whose name already exists on the
 * target night are skipped, so clicking twice is a no-op.
 */
export const importJobsFromLastSeason = withAction(
    async (): Promise<ActionResult<{ imported: number; skipped: number }>> => {
        const session = await requireSession()
        await requireAdmin()
        const config = await requireSeasonConfig()

        const thisSeasonTryouts = getEventsByType(config, "tryout")
        if (thisSeasonTryouts.length === 0) {
            return fail(
                "This season has no tryout dates yet. Add them in Season Configuration first."
            )
        }

        // Largest season id below the current one — gap-tolerant, unlike
        // seasonId - 1.
        const [previous] = await db
            .select({
                id: seasons.id,
                season: seasons.season,
                year: seasons.year
            })
            .from(seasons)
            .where(lt(seasons.id, config.seasonId))
            .orderBy(desc(seasons.id))
            .limit(1)
        if (!previous)
            return fail("There is no previous season to import from.")

        const previousTryouts = await db
            .select({ id: seasonEvents.id })
            .from(seasonEvents)
            .where(
                and(
                    eq(seasonEvents.season_id, previous.id),
                    eq(seasonEvents.event_type, "tryout")
                )
            )
            .orderBy(asc(seasonEvents.sort_order), asc(seasonEvents.id))

        const previousLabel = formatSeasonLabel({
            seasonName: previous.season,
            seasonYear: previous.year
        })

        if (previousTryouts.length === 0) {
            return fail(`${previousLabel} has no tryout dates to import from.`)
        }

        const sourceJobs = await db
            .select()
            .from(tryoutVolunteerJobs)
            .where(eq(tryoutVolunteerJobs.season_id, previous.id))
            .orderBy(
                asc(tryoutVolunteerJobs.sort_order),
                asc(tryoutVolunteerJobs.id)
            )
        if (sourceJobs.length === 0) {
            return fail(`${previousLabel} has no volunteer jobs to import.`)
        }

        const currentJobs = await db
            .select({
                eventId: tryoutVolunteerJobs.event_id,
                name: tryoutVolunteerJobs.name
            })
            .from(tryoutVolunteerJobs)
            .where(eq(tryoutVolunteerJobs.season_id, config.seasonId))
        const taken = new Set(
            currentJobs.map((j) => `${j.eventId}:${j.name.toLowerCase()}`)
        )

        // Map source event id → this season's tryout night at the same index.
        const targetBySourceEvent = new Map<number, number>()
        previousTryouts.forEach((event, index) => {
            const target = thisSeasonTryouts[index]
            if (target) targetBySourceEvent.set(event.id, target.id)
        })

        const toInsert: (typeof tryoutVolunteerJobs.$inferInsert)[] = []
        let skipped = 0

        for (const job of sourceJobs) {
            const targetEventId = targetBySourceEvent.get(job.event_id)
            // Last season had more tryout nights than this one.
            if (!targetEventId) {
                skipped += 1
                continue
            }
            const key = `${targetEventId}:${job.name.toLowerCase()}`
            if (taken.has(key)) {
                skipped += 1
                continue
            }
            taken.add(key)
            toInsert.push({
                season_id: config.seasonId,
                event_id: targetEventId,
                name: job.name,
                needed: job.needed,
                scope: job.scope,
                notes: job.notes,
                sort_order: job.sort_order
            })
        }

        if (toInsert.length > 0) {
            await db.insert(tryoutVolunteerJobs).values(toInsert)
        }

        await logAuditEntry({
            userId: session.user.id,
            action: "import_tryout_jobs",
            entityType: "tryout_volunteer_jobs",
            entityId: config.seasonId,
            summary: `Imported ${toInsert.length} volunteer job(s) from ${previousLabel} (${skipped} skipped)`
        })

        revalidatePath("/dashboard/configure-tryout-jobs")
        revalidatePath("/dashboard/assign-tryout-jobs")

        const message =
            toInsert.length === 0
                ? `Nothing to import — all ${previousLabel} jobs already exist.`
                : `Imported ${toInsert.length} job(s) from ${previousLabel}${
                      skipped > 0
                          ? `, skipped ${skipped} already present.`
                          : "."
                  }`

        return ok({ imported: toInsert.length, skipped }, message)
    }
)
