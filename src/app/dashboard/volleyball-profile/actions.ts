"use server"

import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import { withAction, ok, requireSession } from "@/next/action-helpers"
import type { ActionResult } from "@/next/action-helpers"
import type { VolleyballProfileData } from "./data"

export const updateVolleyballProfile = withAction(
    async (data: VolleyballProfileData): Promise<ActionResult> => {
        const session = await requireSession()

        await db
            .update(users)
            .set({
                experience: data.experience,
                assessment: data.assessment,
                height: data.height,
                skill_passer: data.skill_passer,
                skill_setter: data.skill_setter,
                skill_hitter: data.skill_hitter,
                skill_other: data.skill_other,
                updatedAt: new Date()
            })
            .where(eq(users.id, session.user.id))

        await logAuditEntry({
            userId: session.user.id,
            action: "update",
            entityType: "users",
            entityId: session.user.id,
            summary: `Updated volleyball profile (experience: ${data.experience}, height: ${data.height})`
        })

        return ok(undefined, "Profile updated successfully!")
    }
)
