"use server"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { getSessionUserId, isAdminOrDirectorBySession } from "@/next/session"
import { logAuditEntry } from "@/lib/audit-log"

export const updateGoogleMembership = withAction(
    async (
        userId: string,
        values: {
            seasonsList: string
            notificationList: string
        }
    ): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            await db
                .update(users)
                .set({
                    seasons_list: values.seasonsList,
                    notification_list: values.notificationList,
                    updatedAt: new Date()
                })
                .where(eq(users.id, userId))

            const actorId = await getSessionUserId()

            if (actorId) {
                await logAuditEntry({
                    userId: actorId,
                    action: "update",
                    entityType: "users",
                    entityId: userId,
                    summary: `Admin updated Google membership flags for ${userId} (seasons_list=${values.seasonsList}, notification_list=${values.notificationList})`
                })
            }

            revalidatePath("/dashboard/google-membership")
            return ok(undefined, "Membership fields updated.")
        } catch (error) {
            logger.error(
                "Error updating Google Membership fields",
                undefined,
                error
            )
            return fail("Failed to update membership fields.")
        }
    }
)
