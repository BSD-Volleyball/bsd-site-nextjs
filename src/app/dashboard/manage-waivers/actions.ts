"use server"

import { desc } from "drizzle-orm"
import { db } from "@/database/db"
import { waivers, users } from "@/database/schema"
import { eq } from "drizzle-orm"
import {
    requireAdmin,
    requireSession,
    withAction,
    ok,
    fail,
    ActionError
} from "@/lib/action-helpers"
import {
    createWaiverVersion as createWaiverVersionLib,
    publishWaiver
} from "@/lib/waivers"
import { logAuditEntry } from "@/lib/audit-log"
import { revalidatePath } from "next/cache"

export interface WaiverRow {
    id: number
    content: string
    active: boolean
    created_at: Date
    created_by_name: string | null
}

export async function listWaivers(): Promise<WaiverRow[]> {
    await requireAdmin()
    const rows = await db
        .select({
            id: waivers.id,
            content: waivers.content,
            active: waivers.active,
            created_at: waivers.created_at,
            created_by_first: users.first_name,
            created_by_last: users.last_name
        })
        .from(waivers)
        .leftJoin(users, eq(waivers.created_by, users.id))
        .orderBy(desc(waivers.created_at))

    return rows.map((r) => ({
        id: r.id,
        content: r.content,
        active: r.active,
        created_at: r.created_at,
        created_by_name:
            r.created_by_first && r.created_by_last
                ? `${r.created_by_first} ${r.created_by_last}`
                : null
    }))
}

export const createWaiverVersion = withAction(
    async (content: string, publishImmediately: boolean) => {
        await requireAdmin()
        const session = await requireSession()
        const trimmed = content.trim()
        if (trimmed.length === 0) {
            throw new ActionError("Waiver content cannot be empty.")
        }

        const { id } = await createWaiverVersionLib(
            trimmed,
            session.user.id,
            publishImmediately
        )

        await logAuditEntry({
            userId: session.user.id,
            action: "create",
            entityType: "waiver",
            summary: publishImmediately
                ? `Created and published waiver version ${id}`
                : `Created waiver version ${id} (not published)`
        })

        revalidatePath("/dashboard/manage-waivers")
        return ok({ id })
    }
)

export const publishWaiverVersion = withAction(async (id: number) => {
    await requireAdmin()
    const session = await requireSession()

    if (!Number.isInteger(id) || id <= 0) {
        return fail("Invalid waiver id.")
    }

    // Confirm the target exists before flipping flags.
    const [target] = await db
        .select({ id: waivers.id })
        .from(waivers)
        .where(eq(waivers.id, id))
        .limit(1)
    if (!target) {
        return fail("Waiver version not found.")
    }

    await publishWaiver(id)

    await logAuditEntry({
        userId: session.user.id,
        action: "update",
        entityType: "waiver",
        summary: `Published waiver version ${id}`
    })

    revalidatePath("/dashboard/manage-waivers")
    return ok()
})
