"use server"

import { db } from "@/database/db"
import { signups } from "@/database/schema"
import { eq, and } from "drizzle-orm"
import {
    withAction,
    ok,
    fail,
    requireSession,
    requirePositiveInt
} from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"
import { getSeasonConfig } from "@/lib/site-config"
import { PAIR_REQUIRED_AGE_GROUP } from "@/lib/age-groups"
import { logAuditEntry } from "@/lib/audit-log"
import { canEditPreferences, type SignupPreferences } from "./utils"

const VALID_CAPTAIN_VALUES = ["yes", "only_if_needed", "no"] as const

export const updateSignupPreferences = withAction(
    async (
        signupId: number,
        preferences: SignupPreferences
    ): Promise<ActionResult> => {
        const session = await requireSession()
        requirePositiveInt(signupId, "signup")

        if (!VALID_CAPTAIN_VALUES.includes(preferences.captain as never)) {
            return fail("Invalid captain preference.")
        }

        // Editing locks once drafting starts — enforce server-side, not just in the UI.
        const config = await getSeasonConfig()
        if (!config.seasonId) {
            return fail("There is no active season at this time.")
        }
        if (!canEditPreferences(config.phase)) {
            return fail(
                "Preferences can no longer be edited now that drafting has started."
            )
        }

        // Verify the signup belongs to the authenticated user.
        const [signup] = await db
            .select({
                id: signups.id,
                player: signups.player,
                age: signups.age
            })
            .from(signups)
            .where(
                and(
                    eq(signups.id, signupId),
                    eq(signups.player, session.user.id)
                )
            )
            .limit(1)

        if (!signup) {
            return fail("Signup not found or does not belong to you.")
        }

        // When not pairing, clear the pair fields (mirrors the signup wizard).
        const pair = preferences.pair === true
        const pairPick = pair ? preferences.pairPick || null : null
        const pairReason = pair ? preferences.pairReason : ""

        // League rules require 14-15 year olds to stay paired; signup enforces
        // the pick and this action must not become the back door that drops it.
        if (signup.age === PAIR_REQUIRED_AGE_GROUP && !pairPick) {
            return fail(
                "Players aged 14-15 must stay paired with a registered parent/guardian."
            )
        }
        const refInterest = preferences.refInterest === true
        const tryoutHelp = preferences.tryoutHelp === true

        await db
            .update(signups)
            .set({
                captain: preferences.captain,
                pair,
                pair_pick: pairPick,
                pair_reason: pairReason,
                ref_interest: refInterest,
                tryout_help: tryoutHelp
            })
            .where(
                and(
                    eq(signups.id, signupId),
                    eq(signups.player, session.user.id)
                )
            )

        await logAuditEntry({
            userId: session.user.id,
            action: "update_signup_preferences",
            entityType: "signup",
            entityId: signupId,
            summary: `Updated season preferences (captain=${preferences.captain}, pair=${pair}, ref=${refInterest}, tryoutHelp=${tryoutHelp})`
        })

        return ok(undefined, "Your preferences have been updated.")
    }
)
