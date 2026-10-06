"use server"

import { db } from "@/database/db"
import { waivers } from "@/database/schema"
import { eq } from "drizzle-orm"
import {
    requireAdmin,
    requireSession,
    withAction,
    ok,
    fail,
    ActionError
} from "@/next/action-helpers"
import {
    createWaiverVersion as createWaiverVersionLib,
    publishWaiver
} from "@/lib/waivers"
import { logAuditEntry } from "@/lib/audit-log"
import { revalidatePath } from "next/cache"

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
