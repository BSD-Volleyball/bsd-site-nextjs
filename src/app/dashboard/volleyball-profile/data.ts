import "server-only"

import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { withAction, ok, requireSession } from "@/next/action-helpers"
import type { ActionResult } from "@/next/action-helpers"

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
