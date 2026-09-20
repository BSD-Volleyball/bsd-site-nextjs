"use server"

import { and, eq } from "drizzle-orm"

import { db } from "@/database/db"
import { coveragePresence } from "@/database/schema"
import { logAuditEntry } from "@/lib/audit-log"
import { normalizeTime } from "@/lib/coverage/format"
import { listAdminPool, loadCoverage } from "@/lib/coverage/load"
import type { CoverageAdmin, CoverageDate } from "@/lib/coverage/types"
import { getLeagueDateString } from "@/lib/date-utils"
import {
    ActionError,
    type ActionResult,
    fail,
    ok,
    requireAdmin,
    requireNonEmptyString,
    requirePositiveInt,
    requireSession,
    withAction
} from "@/next/action-helpers"

export interface CoverageView {
    dates: CoverageDate[]
    admins: CoverageAdmin[]
    today: string
}

export const getCoverageView = withAction(
    async (): Promise<ActionResult<CoverageView>> => {
        await requireAdmin()
        const today = getLeagueDateString()
        const [dates, admins] = await Promise.all([
            loadCoverage({ fromDate: today }),
            listAdminPool()
        ])
        return ok({ dates, admins, today })
    }
)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const addPresence = withAction(
    async (input: {
        userId: string
        date: string
        slotTimes: string[]
        note?: string | null
    }): Promise<ActionResult<void>> => {
        await requireAdmin()
        const session = await requireSession()

        const userId = requireNonEmptyString(input.userId, "user")
        const date = requireNonEmptyString(input.date, "date")
        if (!DATE_RE.test(date)) throw new ActionError("Invalid date.")
        const today = getLeagueDateString()
        if (date < today) throw new ActionError("That date has passed.")
        if (!Array.isArray(input.slotTimes) || input.slotTimes.length === 0) {
            throw new ActionError("Pick at least one time slot.")
        }
        const slotTimes = input.slotTimes.map((t) => normalizeTime(t))
        if (slotTimes.some((t) => t === null)) {
            throw new ActionError("Invalid time slot.")
        }
        const note = input.note?.trim() ? input.note.trim().slice(0, 200) : null

        const admins = await listAdminPool()
        const target = admins.find((a) => a.userId === userId)
        if (!target) return fail("Only admins can be marked present.")

        const [day] = await loadCoverage({ fromDate: date, toDate: date })
        if (!day) return fail("No matches are scheduled on that date.")
        const valid = new Set(
            day.slots
                .map((s) => s.startTime)
                .filter((t): t is string => t !== null)
        )
        for (const t of slotTimes) {
            if (!valid.has(t as string)) {
                return fail("That time is not a slot on this date.")
            }
        }

        await db
            .insert(coveragePresence)
            .values(
                slotTimes.map((t) => ({
                    user_id: userId,
                    event_date: date,
                    slot_time: t as string,
                    note,
                    created_by: session.user.id
                }))
            )
            .onConflictDoNothing()

        await logAuditEntry({
            userId: session.user.id,
            action: "add_coverage_presence",
            entityType: "coverage_presence",
            summary: `Marked ${target.name} present on ${date} at ${slotTimes.join(", ")}`
        })
        return ok(undefined, "Added.")
    }
)

export const removePresence = withAction(
    async (input: { id: number }): Promise<ActionResult<void>> => {
        await requireAdmin()
        const session = await requireSession()
        const id = requirePositiveInt(input.id, "presence id")

        const [row] = await db
            .select({
                id: coveragePresence.id,
                userId: coveragePresence.user_id,
                date: coveragePresence.event_date,
                slot: coveragePresence.slot_time
            })
            .from(coveragePresence)
            .where(eq(coveragePresence.id, id))
            .limit(1)
        if (!row) return fail("That entry no longer exists.")

        await db
            .delete(coveragePresence)
            .where(and(eq(coveragePresence.id, id)))

        await logAuditEntry({
            userId: session.user.id,
            action: "remove_coverage_presence",
            entityType: "coverage_presence",
            entityId: id,
            summary: `Removed presence for user ${row.userId} on ${row.date} at ${row.slot}`
        })
        return ok(undefined, "Removed.")
    }
)
