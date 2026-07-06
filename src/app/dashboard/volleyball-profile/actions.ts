"use server"

import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import { withAction, ok, requireSession } from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"

export interface VolleyballProfileData {
    experience: string | null
    assessment: string | null
    height: number | null
    skill_passer: boolean | null
    skill_setter: boolean | null
    skill_hitter: boolean | null
    skill_other: boolean | null
}

export const getVolleyballProfile = withAction(
    async (): Promise<ActionResult<VolleyballProfileData | null>> => {
        const session = await requireSession()

        const [user] = await db
            .select({
                experience: users.experience,
                assessment: users.assessment,
                height: users.height,
                skill_passer: users.skill_passer,
                skill_setter: users.skill_setter,
                skill_hitter: users.skill_hitter,
                skill_other: users.skill_other
            })
            .from(users)
            .where(eq(users.id, session.user.id))
            .limit(1)

        return ok(user || null)
    }
)

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
