"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import {
    withAction,
    ok,
    fail,
    requireSession,
    requireNonEmptyString
} from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"

export interface VolleyballProfileData {
    experience: string | null
    assessment: string | null
    height: number | null
    skill_passer: boolean
    skill_setter: boolean
    skill_hitter: boolean
    skill_other: boolean
}

export async function getOnboardingVolleyballData(): Promise<VolleyballProfileData | null> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
        return null
    }

    const [profile] = await db
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

    if (!profile) return null

    return {
        experience: profile.experience,
        assessment: profile.assessment,
        height: profile.height,
        skill_passer: profile.skill_passer ?? false,
        skill_setter: profile.skill_setter ?? false,
        skill_hitter: profile.skill_hitter ?? false,
        skill_other: profile.skill_other ?? false
    }
}

export const completeOnboarding = withAction(
    async (data: VolleyballProfileData): Promise<ActionResult> => {
        const session = await requireSession()

        requireNonEmptyString(data.experience, "Experience")
        if (data.height == null) {
            return fail("Height is required.")
        }

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
                onboarding_completed: true,
                updatedAt: new Date()
            })
            .where(eq(users.id, session.user.id))

        await logAuditEntry({
            userId: session.user.id,
            action: "update",
            entityType: "users",
            entityId: session.user.id,
            summary: "Completed onboarding (volleyball profile)"
        })

        return ok(undefined, "Onboarding completed!")
    }
)
